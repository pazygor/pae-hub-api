import { Module, Injectable, Logger, Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

// ─────────────────────────────────────────────────────────────────────────────
// Geocodificação — adaptador autocontido de APIs públicas gratuitas (sem API key):
//   CEP  → BrasilAPI → AwesomeAPI (retornam coords direto quando têm)
//   Endereço → Nominatim (OpenStreetMap)
// Espelha o recurso do Climb Delivery, adaptado a NestJS + fetch nativo (Node 18+).
// Política do Nominatim: User-Agent identificável, timeout, sem lote paralelo.
// ─────────────────────────────────────────────────────────────────────────────

export interface Coordinates {
  latitude: number;
  longitude: number;
}
interface CepAddress {
  street?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
}

const NOMINATIM_UA = 'M1PaeHub/1.0 (contato@m1paehub.com.br)';

async function fetchJson(url: string, opts: { headers?: Record<string, string>; timeoutMs: number }): Promise<any | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  try {
    const res = await fetch(url, { headers: opts.headers, signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  /**
   * Ponto de entrada: resolve coords a partir de CEP e/ou endereço estruturado.
   *
   * Precisão por NÚMERO (Fase 6): quando há número + rua + cidade, geocodifica o
   * endereço COMPLETO no Nominatim primeiro — isso cai na quadra/porta, não no
   * centroide do CEP. O CEP é usado para (a) completar rua/cidade quando faltarem e
   * (b) servir de fallback (centroide) caso o Nominatim não encontre o número.
   */
  async resolveCoordinates(input: {
    cep?: string; street?: string; number?: string; neighborhood?: string; city?: string; state?: string;
  }): Promise<Coordinates | null> {
    const cepClean = input.cep?.replace(/\D/g, '') ?? '';
    const hasCep = cepClean.length === 8;

    let street = clean(input.street);
    let neighborhood = clean(input.neighborhood);
    let city = clean(input.city);
    let state = clean(input.state);
    let cepCentroid: Coordinates | null = null;

    // (a) Completa o endereço pelo CEP quando faltar rua/cidade — necessário para
    // conseguir geocodificar com precisão por número.
    if (hasCep && (!street || !city)) {
      const fromCep = await this.cepData(cepClean);
      street = street ?? fromCep.address?.street;
      neighborhood = neighborhood ?? fromCep.address?.neighborhood;
      city = city ?? fromCep.address?.city;
      state = state ?? fromCep.address?.state;
      cepCentroid = fromCep.coords;
    }

    // Endereço completo COM número → ponto mais preciso (Nominatim).
    const number = clean(input.number);
    if (number && street && city) {
      const full = [street, number, neighborhood, city, state, 'Brasil'].filter(Boolean).join(', ');
      const byNumber = await this.geocodeAddress(full);
      if (byNumber) return byNumber;
    }

    // Sem número (ou número não encontrado): centroide do CEP.
    if (hasCep) {
      const centroid = cepCentroid ?? (await this.cepData(cepClean)).coords;
      if (centroid) return centroid;
    }

    // Último recurso: endereço sem número.
    const query = [street, neighborhood, city, state, 'Brasil'].filter(Boolean).join(', ');
    if (query.replace(/[, ]/g, '').length > 6) {
      return this.geocodeAddress(query);
    }
    return null;
  }

  /** CEP → coords (BrasilAPI → AwesomeAPI → fallback por endereço no Nominatim). */
  async geocodeCep(cep: string): Promise<Coordinates | null> {
    const clean = cep.replace(/\D/g, '');
    const { coords, address } = await this.cepData(clean);
    if (coords) return coords;
    if (address) {
      const query = [address.street, address.neighborhood, address.city, address.state, 'Brasil'].filter(Boolean).join(', ');
      return this.geocodeAddress(query);
    }
    return null;
  }

  /** Consulta o CEP nos dois provedores e devolve coords (centroide) + endereço. */
  private async cepData(clean: string): Promise<{ coords: Coordinates | null; address: CepAddress | null }> {
    const brasil = await this.tryBrasilApi(clean);
    // Só consulta o segundo provedor se o primeiro não trouxe o que falta.
    const awesome = (!brasil.coords || !brasil.address) ? await this.tryAwesomeApi(clean) : { coords: null, address: null };
    return {
      coords: brasil.coords ?? awesome.coords,
      address: brasil.address ?? awesome.address,
    };
  }

  private async tryBrasilApi(clean: string): Promise<{ coords: Coordinates | null; address: CepAddress | null }> {
    const data = await fetchJson(`https://brasilapi.com.br/api/cep/v2/${clean}`, { timeoutMs: 5000 });
    if (!data) return { coords: null, address: null };
    const loc = data?.location?.coordinates;
    const address = this.extractAddress(data?.street, data?.neighborhood, data?.city, data?.state);
    if (loc?.latitude && loc?.longitude) {
      return { coords: { latitude: Number(loc.latitude), longitude: Number(loc.longitude) }, address };
    }
    return { coords: null, address };
  }

  private async tryAwesomeApi(clean: string): Promise<{ coords: Coordinates | null; address: CepAddress | null }> {
    const data = await fetchJson(`https://cep.awesomeapi.com.br/json/${clean}`, { timeoutMs: 5000 });
    if (!data) return { coords: null, address: null };
    const address = this.extractAddress(data?.address, data?.district, data?.city, data?.state);
    if (data?.lat && data?.lng) {
      return { coords: { latitude: Number(data.lat), longitude: Number(data.lng) }, address };
    }
    return { coords: null, address };
  }

  /** Endereço textual → coords (Nominatim / OpenStreetMap). */
  async geocodeAddress(address: string): Promise<Coordinates | null> {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(address)}`;
    const data = await fetchJson(url, { headers: { 'User-Agent': NOMINATIM_UA }, timeoutMs: 8000 });
    if (Array.isArray(data) && data.length > 0 && data[0].lat && data[0].lon) {
      this.logger.log(`[Nominatim] ✅ ${data[0].lat}, ${data[0].lon} para "${address}"`);
      return { latitude: Number(data[0].lat), longitude: Number(data[0].lon) };
    }
    this.logger.warn(`[Nominatim] sem resultado para "${address}"`);
    return null;
  }

  private extractAddress(street?: string, neighborhood?: string, city?: string, state?: string): CepAddress | null {
    if (!street && !neighborhood && !city) return null;
    return { street: clean(street), neighborhood: clean(neighborhood), city: clean(city), state: clean(state) };
  }
}

function clean(v?: string): string | undefined {
  if (!v) return undefined;
  return v.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim() || undefined;
}

class GeocodeDto {
  @ApiPropertyOptional() @IsOptional() @IsString() cep?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() street?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() number?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() neighborhood?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() state?: string;
}

@ApiTags('Geocoding')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('geocoding')
export class GeocodingController {
  constructor(private service: GeocodingService) {}

  @Post('coordinates')
  @ApiOperation({ summary: 'Resolve latitude/longitude a partir de CEP/endereço (Localizar)' })
  async coordinates(@Body() dto: GeocodeDto): Promise<Coordinates | null> {
    return this.service.resolveCoordinates(dto);
  }
}

@Module({
  providers: [GeocodingService],
  controllers: [GeocodingController],
  exports: [GeocodingService],
})
export class GeocodingModule {}

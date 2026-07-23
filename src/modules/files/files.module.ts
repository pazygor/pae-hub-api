import {
  Module, Injectable, Controller, Post, Get, Param, Query, Body, Res, Req,
  UploadedFile, UseInterceptors, BadRequestException, NotFoundException, Inject,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { extname } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/roles.decorator';
import { StorageService, STORAGE_SERVICE, LocalDiskStorage } from './storage.service';
import { needsAudioTranscode, transcodeAudioToAac } from './audio-transcode';

// multipart: multer em memória (default) — `buffer` disponível para o driver.
type UploadedFileT = { originalname: string; mimetype: string; size: number; buffer: Buffer };

const MAX_SIZE = 50 * 1024 * 1024; // 50MB (vídeo curto do chat — item 10)
const SIGN_TTL_MS = 2 * 60 * 60 * 1000; // 2h

// Qualquer extensão é aceita (decisão 23/07 — .xls e afins), EXCETO executáveis.
// A checagem é pela EXTENSÃO: o MIME chega como application/octet-stream em muitos
// casos, então confiar nele deixaria passar executável renomeado no Content-Type.
const BLOCKED_EXT = new Set([
  'exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'pif', 'ps1', 'vbs', 'js',
  'jar', 'sh', 'apk', 'app', 'deb', 'rpm', 'dll',
]);
function isBlockedFile(originalName: string): boolean {
  const ext = extname(originalName).replace('.', '').toLowerCase();
  return !!ext && BLOCKED_EXT.has(ext);
}

// SVG/HTML nunca inline: podem carregar script e rodariam na NOSSA origem (XSS
// armazenado). Vão como download. Demais mídias seguem inline (player/preview).
/**
 * Parseia o header `Range` (só o primeiro intervalo — players não usam multi-range).
 * Retorna null = sem range (200 inteiro); 'invalid' = 416.
 */
function parseRange(
  header: string | undefined,
  total: number,
): { start: number; end: number } | null | 'invalid' {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return 'invalid';
  const [, rawStart, rawEnd] = m;
  if (rawStart === '' && rawEnd === '') return 'invalid';
  let start: number;
  let end: number;
  if (rawStart === '') {
    const n = Number(rawEnd); // sufixo: últimos N bytes
    if (!n) return 'invalid';
    start = Math.max(0, total - n);
    end = total - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? total - 1 : Number(rawEnd);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) return 'invalid';
  return { start, end: Math.min(end, total - 1) };
}

const NEVER_INLINE = new Set(['image/svg+xml', 'text/html', 'application/xhtml+xml']);
const INLINE = (m: string) =>
  !NEVER_INLINE.has(m) &&
  (m.startsWith('image/') || m.startsWith('audio/') || m.startsWith('video/') || m === 'application/pdf');

@Injectable()
export class FilesService {
  private readonly secret: string;

  constructor(
    private prisma: PrismaService,
    config: ConfigService,
    @Inject(STORAGE_SERVICE) private storage: StorageService,
  ) {
    this.secret = config.get<string>('JWT_SECRET') || 'dev-secret';
  }

  async upload(file: UploadedFileT | undefined, user: any, kind?: string) {
    if (!file) throw new BadRequestException('Arquivo ausente');
    if (isBlockedFile(file.originalname)) {
      throw new BadRequestException('Tipo de arquivo não permitido por segurança (executável)');
    }
    // Normaliza áudio para AAC/mp4: o WebKit não decodifica webm/opus (o formato que
    // o Chrome grava). Se o ffmpeg falhar/faltar, segue com o original.
    let payload = { buffer: file.buffer, mimeType: file.mimetype, originalName: file.originalname };
    if (needsAudioTranscode(payload.mimeType)) {
      const converted = await transcodeAudioToAac(payload.buffer, payload.originalName);
      if (converted) payload = converted;
    }

    const { key } = await this.storage.save(payload);
    const asset = await this.prisma.fileAsset.create({
      data: {
        organizationId: user.organizationId,
        originalName: payload.originalName,
        storageKey: key,
        mimeType: payload.mimeType,
        size: payload.buffer.length, // tamanho já convertido
        kind: kind || 'other',
        uploadedById: user.id ?? null,
      },
    });
    return { id: asset.id, originalName: asset.originalName, mimeType: asset.mimeType, size: asset.size };
  }

  private hmac(data: string): string {
    return createHmac('sha256', this.secret).update(data).digest('hex');
  }

  /**
   * URL assinada de leitura para um FileAsset. Hoje (disco local) devolve o proxy
   * assinado da própria API (`/files/:id?exp&sig`), relativo à base — o front prefixa
   * a origem. Migração p/ GCS: buscar o `storageKey` e usar `storage.getSignedUrl`.
   */
  async readUrl(fileId: string): Promise<string> {
    const exp = Date.now() + SIGN_TTL_MS;
    return `/files/${fileId}?exp=${exp}&sig=${this.hmac(`${fileId}.${exp}`)}`;
  }

  verify(id: string, exp?: string, sig?: string): boolean {
    if (!exp || !sig) return false;
    if (Number(exp) < Date.now()) return false;
    const expected = this.hmac(`${id}.${exp}`);
    if (sig.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  }

  async streamTo(res: Response, id: string, exp?: string, sig?: string, rangeHeader?: string) {
    if (!this.verify(id, exp, sig)) throw new BadRequestException('Assinatura inválida ou expirada');
    const asset = await this.prisma.fileAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('Arquivo não encontrado');

    const total = asset.size;
    res.setHeader('Content-Type', asset.mimeType);
    res.setHeader(
      'Content-Disposition',
      `${INLINE(asset.mimeType) ? 'inline' : 'attachment'}; filename="${encodeURIComponent(asset.originalName)}"`,
    );
    // Sem byte-range o WebKit (Safari e TODO navegador no iOS) se recusa a reproduzir
    // <audio>/<video> — era a causa de "só funciona no Chrome".
    res.setHeader('Accept-Ranges', 'bytes');

    const range = parseRange(rangeHeader, total);
    if (range === 'invalid') {
      res.setHeader('Content-Range', `bytes */${total}`);
      res.status(416).end();
      return;
    }
    if (!range) {
      res.setHeader('Content-Length', String(total));
      this.storage.getReadStream(asset.storageKey).pipe(res);
      return;
    }
    res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${total}`);
    res.setHeader('Content-Length', String(range.end - range.start + 1));
    res.status(206);
    this.storage.getReadStream(asset.storageKey, range).pipe(res);
  }
}

@ApiTags('Files')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(private service: FilesService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_SIZE } }))
  upload(@UploadedFile() file: UploadedFileT, @Body('kind') kind: string, @CurrentUser() user: any) {
    return this.service.upload(file, user, kind);
  }

  // Público: a assinatura da URL é a credencial (a listagem que gera a URL já é tenant-scoped).
  @Public()
  @Get(':id')
  download(
    @Param('id') id: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.service.streamTo(res, id, exp, sig, req.headers.range);
  }
}

@Module({
  providers: [
    FilesService,
    { provide: STORAGE_SERVICE, useClass: LocalDiskStorage },
  ],
  controllers: [FilesController],
  exports: [FilesService],
})
export class FilesModule {}

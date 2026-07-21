import {
  Module, Injectable, Controller, Post, Get, Param, Query, Body, Res,
  UploadedFile, UseInterceptors, BadRequestException, NotFoundException, Inject,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/roles.decorator';
import { StorageService, STORAGE_SERVICE, LocalDiskStorage } from './storage.service';

// multipart: multer em memória (default) — `buffer` disponível para o driver.
type UploadedFileT = { originalname: string; mimetype: string; size: number; buffer: Buffer };

const MAX_SIZE = 50 * 1024 * 1024; // 50MB (vídeo curto do chat — item 10)
const SIGN_TTL_MS = 2 * 60 * 60 * 1000; // 2h

// Allowlist de tipos. Vídeo liberado para anexo de chat (item 10) — clipe curto,
// sem transcodificação; o vídeo de TREINAMENTO segue por URL externa.
function isAllowedMime(m: string): boolean {
  if (m.startsWith('image/') || m.startsWith('audio/') || m.startsWith('video/')) return true;
  return [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ].includes(m);
}

const INLINE = (m: string) =>
  m.startsWith('image/') || m.startsWith('audio/') || m.startsWith('video/') || m === 'application/pdf';

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
    if (!isAllowedMime(file.mimetype)) throw new BadRequestException('Tipo de arquivo não permitido');
    const { key } = await this.storage.save({
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname,
    });
    const asset = await this.prisma.fileAsset.create({
      data: {
        organizationId: user.organizationId,
        originalName: file.originalname,
        storageKey: key,
        mimeType: file.mimetype,
        size: file.size,
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

  async streamTo(res: Response, id: string, exp?: string, sig?: string) {
    if (!this.verify(id, exp, sig)) throw new BadRequestException('Assinatura inválida ou expirada');
    const asset = await this.prisma.fileAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('Arquivo não encontrado');
    res.setHeader('Content-Type', asset.mimeType);
    res.setHeader(
      'Content-Disposition',
      `${INLINE(asset.mimeType) ? 'inline' : 'attachment'}; filename="${encodeURIComponent(asset.originalName)}"`,
    );
    this.storage.getReadStream(asset.storageKey).pipe(res);
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
    @Res() res: Response,
  ) {
    return this.service.streamTo(res, id, exp, sig);
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

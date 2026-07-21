import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, promises as fs } from 'fs';
import { join, extname, isAbsolute } from 'path';
import { randomUUID } from 'crypto';

/**
 * Abstração de storage (item 4). Os consumidores (Files/Treinamentos/Chat) dependem
 * SÓ desta interface — trocar de backend depois é implementar um driver, sem tocar
 * em ninguém. Ver docs/sprint/item-4-storage-uploads.md.
 */
export interface StorageService {
  save(input: { buffer: Buffer; mimeType: string; originalName: string }): Promise<{ key: string }>;
  getReadStream(key: string): NodeJS.ReadableStream;
  delete(key: string): Promise<void>;
  /**
   * URL direta assinada do próprio storage (nuvem). Driver local devolve `null`
   * → o app faz proxy autenticado por assinatura (ver FilesService).
   */
  getSignedUrl(key: string): Promise<string | null>;
}

export const STORAGE_SERVICE = 'StorageService';

/**
 * Driver de disco local (MVP). Grava em UPLOAD_DIR; o download passa pelo endpoint
 * assinado da própria API. Migrar para GCS = trocar este provider por um GcsStorage
 * que devolve signed URL em getSignedUrl (aí o proxy nem é usado).
 */
@Injectable()
export class LocalDiskStorage implements StorageService {
  private readonly logger = new Logger('LocalDiskStorage');
  private readonly dir: string;

  constructor(config: ConfigService) {
    // Alinhado ao .env.example (STORAGE_LOCAL_PATH); UPLOAD_DIR fica como alias legado.
    const configured =
      config.get<string>('STORAGE_LOCAL_PATH') || config.get<string>('UPLOAD_DIR') || 'uploads';
    this.dir = isAbsolute(configured) ? configured : join(process.cwd(), configured);
    fs.mkdir(this.dir, { recursive: true }).catch((e) =>
      this.logger.error(`Falha ao criar UPLOAD_DIR ${this.dir}: ${e}`),
    );
  }

  private resolve(key: string): string {
    // key é sempre um basename gerado por nós (uuid.ext) — sem travessia de path.
    return join(this.dir, key);
  }

  async save(input: { buffer: Buffer; mimeType: string; originalName: string }): Promise<{ key: string }> {
    const key = `${randomUUID()}${extname(input.originalName) || ''}`;
    await fs.writeFile(this.resolve(key), input.buffer);
    return { key };
  }

  getReadStream(key: string): NodeJS.ReadableStream {
    return createReadStream(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await fs.unlink(this.resolve(key)).catch(() => undefined);
  }

  async getSignedUrl(): Promise<string | null> {
    return null; // disco local usa proxy assinado da API
  }
}

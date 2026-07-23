import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Logger } from '@nestjs/common';

/**
 * Transcodificação de áudio para AAC/mp4 (item 5 — mini-sprint 23/07).
 *
 * Por quê: o WebKit (Safari no Mac e TODO navegador no iOS) não decodifica
 * `webm/opus`, que é o formato que o Chrome grava. Corrigir o byte-range resolveu
 * a reprodução do que o navegador sabe decodificar; isto resolve o resto,
 * normalizando todo áudio para um formato que toca em qualquer motor.
 *
 * Só ÁUDIO. Vídeo mp4/mov já é universal e transcodificar vídeo na VM seria caro.
 */

const logger = new Logger('AudioTranscode');
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

/** Formatos que já tocam em todo lugar — não mexer. */
const UNIVERSAL_AUDIO = new Set([
  'audio/mp4', 'audio/aac', 'audio/x-m4a', 'audio/m4a', 'audio/mpeg', 'audio/mp3',
]);

export function needsAudioTranscode(mimeType: string): boolean {
  return !!mimeType && mimeType.startsWith('audio/') && !UNIVERSAL_AUDIO.has(mimeType);
}

export interface TranscodedAudio {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}

/**
 * Converte para AAC em container mp4 (.m4a). Usa arquivos temporários porque o mp4
 * exige saída "seekable" (o moov atom é escrito no fim).
 *
 * Devolve `null` em qualquer falha (inclusive ffmpeg ausente) — o chamador segue com
 * o arquivo original. **Upload nunca quebra por causa da transcodificação.**
 */
export async function transcodeAudioToAac(
  buffer: Buffer,
  originalName: string,
): Promise<TranscodedAudio | null> {
  let dir: string | null = null;
  try {
    dir = await fs.mkdtemp(join(tmpdir(), 'pae-audio-'));
    const inPath = join(dir, 'in');
    const outPath = join(dir, 'out.m4a');
    await fs.writeFile(inPath, buffer);

    await runFfmpeg([
      '-y', '-i', inPath,
      '-vn',                      // descarta qualquer trilha de vídeo
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',  // metadados no início → toca antes de baixar tudo
      outPath,
    ]);

    const out = await fs.readFile(outPath);
    if (out.length === 0) throw new Error('saída vazia');
    const base = originalName.replace(/\.[^.]+$/, '') || 'audio';
    return { buffer: out, mimeType: 'audio/mp4', originalName: `${base}.m4a` };
  } catch (err) {
    logger.warn(
      `Não foi possível transcodificar "${originalName}" (segue o original): ${err instanceof Error ? err.message : err}`,
    );
    return null;
  } finally {
    if (dir) await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, args);
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += String(d);
    });
    proc.on('error', (e: NodeJS.ErrnoException) => {
      reject(new Error(e.code === 'ENOENT' ? `ffmpeg não encontrado (${FFMPEG})` : e.message));
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg saiu com código ${code}: ${stderr.slice(-400)}`));
    });
  });
}

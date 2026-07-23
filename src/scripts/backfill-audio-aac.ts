/**
 * Backfill — converte para AAC/mp4 os áudios JÁ salvos que o WebKit não decodifica
 * (webm/opus, ogg…). Sem isto, os áudios que já estão nas ocorrências seguem mudos
 * no Safari/iPhone mesmo com o byte-range corrigido.
 *
 * Uso (dev):
 *   npm run backfill:audio -- --dry     # só lista o que faria
 *   npm run backfill:audio              # executa
 *
 * Uso (produção, dentro do container — já compilado no dist):
 *   docker compose exec api node dist/scripts/backfill-audio-aac.js --dry
 *   docker compose exec api node dist/scripts/backfill-audio-aac.js
 *
 * Seguro por construção:
 *  - o arquivo antigo NÃO é apagado (fica órfão no disco; limpe depois se quiser);
 *  - o registro só é atualizado depois que o novo arquivo é gravado com sucesso;
 *  - falha em um arquivo não interrompe os demais.
 *
 * ⚠️ Faça backup do banco antes. Requer ffmpeg no PATH (ou FFMPEG_PATH).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { promises as fs } from 'fs';
import { isAbsolute, join, extname } from 'path';
import { randomUUID } from 'crypto';
import { needsAudioTranscode, transcodeAudioToAac } from '../modules/files/audio-transcode';

// Prisma 7 exige o adapter explícito (mesmo padrão do prisma/seed.ts).
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const DRY = process.argv.includes('--dry');

function uploadsDir(): string {
  const configured = process.env.STORAGE_LOCAL_PATH || process.env.UPLOAD_DIR || 'uploads';
  return isAbsolute(configured) ? configured : join(process.cwd(), configured);
}

async function main() {
  const dir = uploadsDir();
  console.log(`📁 Diretório de uploads: ${dir}`);
  console.log(DRY ? '🔎 MODO DRY-RUN (nada será alterado)\n' : '▶ Executando conversão\n');

  const audios = await prisma.fileAsset.findMany({
    where: { mimeType: { startsWith: 'audio/' } },
    orderBy: { createdAt: 'asc' },
  });
  const targets = audios.filter((a) => needsAudioTranscode(a.mimeType));

  console.log(`Áudios no banco: ${audios.length} · a converter: ${targets.length}`);
  if (targets.length === 0) {
    console.log('✅ Nada a fazer — todos já estão em formato universal.');
    return;
  }

  let ok = 0;
  let failed = 0;
  for (const asset of targets) {
    const label = `${asset.originalName} (${asset.mimeType}, ${asset.id})`;
    if (DRY) {
      console.log(`  • converteria: ${label}`);
      continue;
    }
    try {
      const oldPath = join(dir, asset.storageKey);
      const buffer = await fs.readFile(oldPath);
      const converted = await transcodeAudioToAac(buffer, asset.originalName);
      if (!converted) throw new Error('transcodificação falhou (ffmpeg indisponível?)');

      const newKey = `${randomUUID()}${extname(converted.originalName) || '.m4a'}`;
      await fs.writeFile(join(dir, newKey), converted.buffer);

      await prisma.fileAsset.update({
        where: { id: asset.id },
        data: {
          storageKey: newKey,
          mimeType: converted.mimeType,
          originalName: converted.originalName,
          size: converted.buffer.length,
        },
      });
      console.log(`  ✅ ${label} → ${converted.originalName} (${converted.buffer.length} bytes)`);
      ok++;
    } catch (err) {
      console.error(`  ❌ ${label}: ${err instanceof Error ? err.message : err}`);
      failed++;
    }
  }

  console.log(`\nResumo: ${ok} convertido(s), ${failed} falha(s).`);
  if (ok > 0) console.log('Os arquivos antigos foram mantidos no disco (órfãos) por segurança.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

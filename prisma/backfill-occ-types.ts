import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { OCCURRENCE_TYPES } from '../src/domain/enums';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Backfill: usuários não-admin com "Tipos de Ocorrência" vazio passam a ver
// TODOS os 8 tipos (novo padrão). Vazio deixou de significar "todos" e passou a
// significar "nenhum" — sem isso, os usuários existentes ficariam sem ver nada.
async function main() {
  const res = await prisma.user.updateMany({
    where: { role: { not: 'admin' }, allowedOccurrenceTypes: { isEmpty: true } },
    data: { allowedOccurrenceTypes: [...OCCURRENCE_TYPES] },
  });
  console.log(`✅ Backfill: ${res.count} usuário(s) atualizados para todos os tipos de ocorrência.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

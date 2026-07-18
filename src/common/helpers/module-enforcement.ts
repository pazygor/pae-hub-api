import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SafetySubModule, terminalHasSafetySubModule } from './module-config';
import { userCanAccessTerminal } from './tenant-scope';

const LABEL: Record<SafetySubModule, string> = {
  trainings: 'Treinamentos',
  epis: 'EPIs',
  compliance: 'Conformidade',
};

/**
 * Item 6 — valida que o terminal tem o sub-módulo de Safety habilitado antes de
 * gravar dados dele (Treinamento/EPI/Conformidade). `terminalId` nulo = registro
 * da organização (org-wide), permitido. Conformidade é derivada — o helper
 * `terminalHasSafetySubModule` já considera a regra.
 */
export async function assertTerminalSafetySubModule(
  prisma: PrismaService,
  terminalId: string | null | undefined,
  sub: SafetySubModule,
): Promise<void> {
  if (!terminalId) return; // org-wide
  const terminal = await prisma.terminal.findUnique({
    where: { id: terminalId },
    select: { activeModules: true, activeSafetySubModules: true },
  });
  if (!terminal || !terminalHasSafetySubModule(terminal, sub)) {
    throw new ForbiddenException(`O terminal não tem o módulo "${LABEL[sub]}" habilitado`);
  }
}

/**
 * Valida a LISTA de terminais de um registro de Safety (registro compartilhado):
 * - lista vazia = **global** (org-wide) → exclusivo do admin;
 * - não-admin: todos os terminais precisam estar no seu acesso;
 * - cada terminal precisa ter o sub-módulo habilitado (item 6).
 */
export async function assertTerminalsForSafetyWrite(
  prisma: PrismaService,
  user: any,
  terminalIds: string[] | null | undefined,
  sub: SafetySubModule,
): Promise<void> {
  const ids = Array.isArray(terminalIds) ? [...new Set(terminalIds.filter(Boolean))] : [];
  if (ids.length === 0) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Registro global é exclusivo do administrador; selecione ao menos um terminal do seu acesso');
    }
    return; // admin global: sem terminal específico
  }
  for (const terminalId of ids) {
    if (user.role !== 'admin' && !userCanAccessTerminal(user, terminalId)) {
      throw new ForbiddenException('Terminal fora do seu acesso');
    }
    await assertTerminalSafetySubModule(prisma, terminalId, sub);
  }
}

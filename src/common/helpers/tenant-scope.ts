import { PrismaService } from '../../prisma/prisma.service';

/**
 * Escopo multi-tenant padrão dos domínios operacionais (Fases 2/3/5a):
 * admin → organização inteira; terminal → próprio terminal;
 * entity → terminais permitidos no cadastro (allowedTerminals).
 */
export async function tenantScope(prisma: PrismaService, user: any): Promise<Record<string, any>> {
  if (user.role === 'admin') return { organizationId: user.organizationId };
  if (user.role === 'terminal') return { terminalId: user.terminalId ?? '—' };
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { allowedTerminals: true },
  });
  return { terminalId: { in: dbUser?.allowedTerminals ?? [] } };
}

/** Valida que o terminal do payload existe e pertence à organização do usuário.
 *  Para role terminal, força o próprio terminal. Retorna o terminalId efetivo. */
export async function resolveTerminalId(
  prisma: PrismaService,
  user: any,
  requestedTerminalId?: string,
): Promise<string | null> {
  const terminalId = user.role === 'admin' ? requestedTerminalId : (user.terminalId ?? requestedTerminalId);
  if (!terminalId) return null;
  const terminal = await prisma.terminal.findFirst({
    where: { id: terminalId, organizationId: user.organizationId },
    select: { id: true },
  });
  return terminal ? terminalId : null;
}

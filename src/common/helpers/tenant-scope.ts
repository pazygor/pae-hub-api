import { PrismaService } from '../../prisma/prisma.service';

/**
 * Escopo multi-tenant dos domínios operacionais (Fases 2/3/5a).
 *
 * Regra de "Terminais Visíveis" (Níveis de Acesso, decisão do gestor 2026-07-07):
 * - o **terminal-casa** (vínculo do usuário) é **sempre visível** — não dá para
 *   escondê-lo do próprio dono;
 * - "Terminais Visíveis" **adiciona** outros terminais além da casa;
 * - admin: organização inteira (a lista, se preenchida, apenas estreita);
 * - entity: não tem casa → vê só os terminais autorizados na lista.
 */
/** Terminais que um usuário-entidade enxerga = terminalIds da Permissão da sua
 *  entidade (via user.entityId). Sem entityId ou sem Permissão → lista vazia. */
export async function entityPermittedTerminals(prisma: PrismaService, user: any): Promise<string[]> {
  const entityId = user.entityId
    ?? (await prisma.user.findUnique({ where: { id: user.id }, select: { entityId: true } }))?.entityId;
  if (!entityId) return [];
  const perm = await prisma.permission.findUnique({ where: { entityId }, select: { terminalIds: true } });
  return perm?.terminalIds ?? [];
}

export function terminalIdsForUser(user: any): string[] {
  const allowed: string[] = user.allowedTerminals ?? [];
  if (user.role === 'terminal') {
    return [...new Set([user.terminalId, ...allowed].filter(Boolean) as string[])];
  }
  return allowed; // entity
}

export async function tenantScope(prisma: PrismaService, user: any): Promise<Record<string, any>> {
  const allowed: string[] = user.allowedTerminals ?? [];

  if (user.role === 'admin') {
    return allowed.length
      ? { organizationId: user.organizationId, terminalId: { in: allowed } }
      : { organizationId: user.organizationId };
  }

  if (user.role === 'terminal') {
    const ids = terminalIdsForUser(user);
    return { organizationId: user.organizationId, terminalId: { in: ids.length ? ids : ['—'] } };
  }

  // entity: vê os terminais autorizados na PERMISSÃO da sua entidade (fonte única
  // de verdade — a Permissão entidade↔terminais). Requer o vínculo user.entityId.
  const entityTerminals = await entityPermittedTerminals(prisma, user);
  return { terminalId: { in: entityTerminals.length ? entityTerminals : ['—'] } };
}

/** O terminal está no escopo do usuário? (casa sempre acessível + adicionais) */
export function userCanAccessTerminal(user: any, terminalId: string | null | undefined): boolean {
  if (!terminalId) return user.role === 'admin';
  const allowed: string[] = user.allowedTerminals ?? [];
  if (user.role === 'admin') return allowed.length ? allowed.includes(terminalId) : true;
  if (user.role === 'terminal') return terminalId === user.terminalId || allowed.includes(terminalId);
  return allowed.includes(terminalId); // entity
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

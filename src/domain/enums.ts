// ─────────────────────────────────────────────────────────────────────────────
// Fonte única de constantes de domínio — ESPELHO de pae-app/src/lib/types.ts.
// O contrato da API usa exatamente estes valores (sem tradução).
// ─────────────────────────────────────────────────────────────────────────────

export const USER_ROLES = ['admin', 'terminal', 'entity'] as const;
export type AppRole = (typeof USER_ROLES)[number];

export const ACCESS_LEVELS = ['estratégico', 'tático', 'operacional'] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const OCCURRENCE_STATUS = ['aberto', 'em atendimento', 'emergência ativa', 'resolvido'] as const;
export const OCCURRENCE_CRITICALITY = ['baixa', 'média', 'alta', 'crítica'] as const;
export const SEVERITY_LEVEL = ['baixa', 'média', 'alta'] as const;

// 8 tipos oficiais (espelha o front). Padrão de "Tipos de Ocorrência" visíveis de
// um usuário novo (todos marcados); vazio = o usuário não vê nenhuma ocorrência.
export const OCCURRENCE_TYPES = [
  'Princípio de incêndio', 'Vazamento', 'Emergência', 'Explosão',
  'Queda de carga', 'Acidente de trabalho', 'Contaminação ambiental', 'Outros',
] as const;

export const TIMELINE_EVENT_TYPE = [
  'ocorrência registrada', 'equipe acionada', 'plano de emergência ativado',
  'entidade notificada', 'ação executada', 'atualização de status', 'ocorrência resolvida',
] as const;

// DER §4.3: Notificada → Em Atendimento → Confirmada
export const ENTITY_NOTIFICATION_STATUS = ['Notificada', 'Confirmada', 'Pendente', 'Em Atendimento'] as const;

// Checklist de 8 passos do Situation Room (Funcional §3.3) — semeado ao criar a
// ocorrência; itens adicionais podem ser acrescentados (decisão 2026-07-05).
export const OCCURRENCE_CHECKLIST_TEMPLATE = [
  'Ocorrência validada',
  'Equipe acionada',
  'Plano de emergência ativado',
  'Autoridade notificada',
  'Evacuação iniciada',
  'Área isolada',
  'Comunicação registrada',
  'Ocorrência encerrada',
] as const;

export const RISK_LEVEL = ['baixo', 'médio', 'alto'] as const;
export const PLAN_STATUS = ['ativo', 'inativo', 'em revisão'] as const;

export const DOCUMENT_TYPE = [
  'Plano de Ação de Emergência', 'Rotas de evacuação', 'Contatos de emergência',
  'Plantas operacionais', 'Procedimentos operacionais', 'Outros',
] as const;

export const MAP_LAYER_TYPE = ['fire_equipment', 'hydrant', 'evacuation_route', 'risk_area', 'meeting_point'] as const;

export const EPI_TYPE = [
  'proteção_cabeça', 'proteção_ocular', 'proteção_auditiva', 'proteção_respiratória',
  'proteção_mãos', 'proteção_pés', 'proteção_corpo', 'proteção_quedas', 'outro',
] as const;
export const EPI_USAGE_STATUS = ['entregue', 'em_uso', 'devolvido', 'vencido', 'substituido'] as const;

export const COMPLIANCE_STATUS = ['conforme', 'atencao', 'nao_conforme'] as const;
export const TERMINAL_STATUS = ['Ativo', 'Inativo', 'Revisão'] as const;
export const ENTITY_STATUS = ['Ativo', 'Inativo'] as const;

export const PRODUCT_MODULE = ['emergency_management', 'operational_safety'] as const;
export const SAFETY_SUBMODULE = ['trainings', 'epis', 'compliance'] as const;

// ─── Helpers de autorização (espelham pae-app/src/lib/access-control.ts) ──────

export interface AuthUserLike {
  role: string;
  accessLevel?: string | null;
}

/** Pode criar/editar/excluir em módulos de gestão (admin OU terminal+tático). */
export function canManage(user: AuthUserLike): boolean {
  if (user.role === 'admin') return true;
  return user.role === 'terminal' && user.accessLevel === 'tático';
}

/** Pode ver telas de gestão (não só o painel pessoal). */
export function canViewManagement(user: AuthUserLike): boolean {
  if (user.role === 'admin') return true;
  if (user.role === 'terminal') return user.accessLevel !== 'operacional';
  return false;
}

/** Restrito a visão pessoal (Meu Painel). */
export function isPersonalOnly(user: AuthUserLike): boolean {
  return user.role === 'terminal' && user.accessLevel === 'operacional';
}

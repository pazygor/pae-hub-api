import { PRODUCT_MODULE, SAFETY_SUBMODULE } from '../../domain/enums';

export type ProductModule = (typeof PRODUCT_MODULE)[number];
export type SafetySubModule = (typeof SAFETY_SUBMODULE)[number];

/**
 * Config de módulos por terminal (item 7). "empresa" = terminal.
 * `compliance` é DERIVADO: se o terminal tem `trainings` OU `epis`, tem `compliance`.
 * Por isso nunca armazenamos `compliance` — só os toggles reais (`trainings`, `epis`).
 */

const TOGGLEABLE_SAFETY: SafetySubModule[] = ['trainings', 'epis'];

/** Mantém apenas os pacotes válidos. */
export function normalizeModules(input: unknown): ProductModule[] {
  const arr = Array.isArray(input) ? input : [];
  return PRODUCT_MODULE.filter((m) => arr.includes(m));
}

/** Só os sub-módulos "reais" (toggles) para PERSISTIR — descarta `compliance` (derivada). */
export function storableSafetySubModules(input: unknown): SafetySubModule[] {
  const arr = Array.isArray(input) ? input : [];
  return TOGGLEABLE_SAFETY.filter((s) => arr.includes(s));
}

/** Lista EFETIVA para exibir/gatear — inclui `compliance` derivada. */
export function effectiveSafetySubModules(stored: unknown): SafetySubModule[] {
  const toggles = storableSafetySubModules(stored);
  const out: SafetySubModule[] = [...toggles];
  if (toggles.length > 0) out.push('compliance'); // trainings || epis → compliance
  return out;
}

/** Visão de módulos de um terminal (pacotes + safety efetiva). */
export function terminalModulesView(terminal: {
  activeModules?: string[] | null;
  activeSafetySubModules?: string[] | null;
}): { active: ProductModule[]; safetySubModules: SafetySubModule[] } {
  return {
    active: normalizeModules(terminal.activeModules),
    safetySubModules: effectiveSafetySubModules(terminal.activeSafetySubModules),
  };
}

/** O terminal tem o sub-módulo de Safety informado? (base para o enforcement do item 6.) */
export function terminalHasSafetySubModule(
  terminal: { activeModules?: string[] | null; activeSafetySubModules?: string[] | null },
  sub: SafetySubModule,
): boolean {
  const view = terminalModulesView(terminal);
  return view.active.includes('operational_safety') && view.safetySubModules.includes(sub);
}

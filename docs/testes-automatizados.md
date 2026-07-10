# M1 PAE Hub — Guia de Testes Automatizados

> Estado atual + roadmap dos testes automatizados. Serve como **guia de
> implementação**: o que já existe, como o harness funciona, o padrão para
> escrever novos testes, e o que ainda falta cobrir (com prioridade e referência
> ao fluxo documentado).
>
> Referências funcionais:
> - `pae-hub-app/docs/fluxo-de-funcionamento.md` (fluxo esperado do sistema)
> - `pae-hub-app/docs/plano-de-testes-e2e.md` (plano de testes E2E, casos S1–S10)

---

## 1. Estratégia de testes (camadas)

| Camada | Onde | Ferramenta | Precisa de banco? | Status |
|--------|------|------------|:---:|--------|
| **Unit / integração de serviço (back-end)** | `pae-hub-api/src/**/*.spec.ts` | Jest + ts-jest + Prisma mockado | Não | ✅ **Ativo** (24 testes) |
| Unit de funções puras (back-end) | `pae-hub-api/src/**/*.spec.ts` | Jest | Não | 🔲 A implementar |
| Unit / componente (front-end) | `pae-hub-app/src/**/*.test.ts(x)` | Vitest + RTL + jsdom | Não | 🔲 Só placeholder |
| **E2E de API (back-end real)** | `pae-hub-api/test/*.e2e-spec.ts` | Jest + supertest + Postgres de teste | Sim | 🔲 Não existe harness |
| **E2E de browser (front+back)** | — | Playwright/Cypress | Sim (tudo no ar) | 🔲 Não configurado |

**Decisão atual:** o foco está na camada de **serviço do back-end com Prisma
mockado**, porque é onde vivem as regras de negócio (RBAC, isolamento multi-tenant,
ciclo de ocorrência/despacho) e roda rápido **sem banco**. É o melhor custo-benefício
para proteger o "core central" da Fase 1.

---

## 2. Como rodar

```bash
cd pae-hub-api

npm test                 # roda toda a suíte (*.spec.ts)
npx jest auth            # só specs cujo caminho casa "auth"
npx jest --watch         # modo watch
npm run test:cov         # com cobertura (gera ../coverage)
```

> `npm test` usa `jest --passWithNoTests`. Config em `jest.config.js`
> (com `tsconfig.spec.json`).

---

## 3. Infraestrutura / harness (o que foi consertado)

O harness **estava quebrado e nenhum teste jamais rodou**. Correções aplicadas
(bugs pré-existentes) — importante conhecer para manter:

1. **Config de Jest duplicado** — existiam `jest.config.js` **e** a chave `jest` no
   `package.json`; o Jest recusa rodar com os dois. → Removida a chave do
   `package.json`; a fonte única passou a ser `jest.config.js`.

2. **Globais de teste não resolviam** (`jest`, `describe`, `it`, `expect`) — o
   `tsconfig.json` não injeta os tipos de teste. → Criado
   [`tsconfig.spec.json`](../tsconfig.spec.json) com `"types": ["jest", "node"]`,
   apontado pelo ts-jest no `jest.config.js`.

3. **`uuid` v14 é ESM puro** e quebra no runtime CommonJS do Jest
   (`SyntaxError: Unexpected token 'export'`). → Mapeado para um mock local em
   [`src/test/mocks/uuid.ts`](../src/test/mocks/uuid.ts) via `moduleNameMapper`.

4. **Type-check cruzado falhava no código-fonte** (ex.: `strictPropertyInitialization`
   em `@WebSocketServer() server` no RealtimeGateway). A app roda em
   `ts-node-dev --transpile-only` (sem type-check), então os testes fazem o mesmo:
   `isolatedModules: true` + `ignoreDeprecations: "6.0"` no `tsconfig.spec.json`.

**Arquivos do harness:**
- [`jest.config.js`](../jest.config.js) — transform ts-jest, `moduleNameMapper`
  (`@/` e `uuid`), `rootDir: src`, `testRegex: .*\.spec\.ts$`.
- [`tsconfig.spec.json`](../tsconfig.spec.json) — tipos de teste + isolatedModules.
- [`src/test/mocks/uuid.ts`](../src/test/mocks/uuid.ts) — mock CommonJS do uuid.

---

## 4. Padrão para escrever um teste de serviço

Convenção (siga os specs existentes):

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { XService } from './x.service';
import { PrismaService } from '../../prisma/prisma.service';

const mockPrisma = {
  recurso: { findMany: jest.fn(), create: jest.fn(), /* ...só o que o service usa */ },
};

describe('XService', () => {
  let service: XService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        XService,
        { provide: PrismaService, useValue: mockPrisma },
        // { provide: RealtimeGateway, useValue: mockRealtime },  // se o service emitir eventos
      ],
    }).compile();

    service = module.get<XService>(XService);
    jest.clearAllMocks();
  });

  it('faz X', async () => {
    mockPrisma.recurso.findMany.mockResolvedValue([/* ... */]);
    const result = await service.metodo(args);
    expect(result).toEqual(/* ... */);
    // asserta também os ARGS passados ao Prisma (where/data) — é onde mora a regra:
    // const where = mockPrisma.recurso.findMany.mock.calls[0][0].where;
  });
});
```

**Regras de ouro:**
- Mocke **apenas** os métodos do Prisma que o service chama.
- Asserte tanto o retorno quanto os **argumentos** passados ao Prisma (`where`,
  `data`) — é onde as regras (isolamento, defaults, timeline) ficam visíveis.
- Se o service injeta `RealtimeGateway`, forneça um mock com
  `{ emitToOrganization: jest.fn(), ... }` (senão o módulo Nest não compila).
- Cubra os caminhos de exceção (`NotFoundException`, `ForbiddenException`,
  `BadRequestException`) com `await expect(...).rejects.toThrow(...)`.

---

## 5. O que JÁ está implementado (24 testes)

### 5.1 `auth.service.spec.ts` — 8 testes · fluxo §4 (sessão/RBAC)
`pae-hub-api/src/modules/auth/auth.service.spec.ts`

- `login`: sucesso retorna accessToken/refreshToken/user; `linkId` espelha `terminalId`.
- `login`: normaliza e-mail para minúsculas.
- `login`: `UnauthorizedException` quando usuário não existe / senha errada / conta
  não-ACTIVE (suspensa).
- `refreshTokens`: `UnauthorizedException` quando token inexistente / expirado / revogado.

> Mapeia casos do plano E2E: **S1.1, S1.2, S1.4, S1.5**.
> Substituiu um spec antigo que testava `AuthService.validateUser` — método que
> **não existe** (o service inlina a validação no `login`).

### 5.2 `emergency.service.spec.ts` — 16 testes · fluxo §6.2/§6.3/§6.5 (coração)
`pae-hub-api/src/modules/emergency/emergency.service.spec.ts`

- **create:** semeia timeline "ocorrência registrada" + checklist de 8 passos;
  defaults (`status='aberto'`, `criticality='média'`); **INC-#### sequencial** com
  padding; persiste `severity`/`criticality` do despacho; emite
  `OCCURRENCE_CREATED`.
- **create (guardas):** `BadRequestException` sem terminal; `ForbiddenException`
  quando o terminal não é da organização; `ForbiddenException` para tipo de
  ocorrência fora dos permitidos (Níveis de Acesso).
- **Acionamento automático (NotificationRule × Permission):** aciona quando regra
  casa o tipo E a Permission cobre o terminal (cria `EntityNotification` +
  timeline "entidade notificada" + `NOTIFICATION_CREATED`); **não** aciona quando a
  Permission não cobre o terminal ou a entidade está Inativa.
- **updateStatus:** `NotFoundException` quando não existe; ao resolver grava
  `resolvedAt` + "ocorrência resolvida" + `STATUS_CHANGED`; transição não-final
  registra "atualização de status" sem `resolvedAt`.
- **findOne/remove:** `NotFoundException`; `remove` faz soft-delete (`isActive=false`).

> Mapeia casos do plano E2E: **S4.2, S4.3, S4.4, S4.9, S5.3, S5.4, S5.8, S6.5**.
> Substituiu um spec antigo/desatualizado (chamava `updateStatus` com assinatura
> antiga e não injetava o `RealtimeGateway`).

---

## 6. O que FALTA implementar (roadmap)

Marcado por prioridade em relação à Fase 1. `[P0]` bloqueia confiança na entrega,
`[P1]` importante, `[P2]` desejável / Fase 2.

### 6.1 Funções puras — alto valor, baixo custo (fazer primeiro)

- [ ] **`[P0]` Isolamento multi-tenant** — `src/common/helpers/tenant-scope.ts`
  Criar `tenant-scope.spec.ts` cobrindo:
  - `terminalIdsForUser(user)` — terminal → casa + `allowedTerminals` (dedup);
    entity → só `allowedTerminals`.
  - `userCanAccessTerminal(user, terminalId)` — admin (tudo/estreitado), terminal
    (casa + adicionais), entity (só whitelist), `terminalId` nulo.
  - `tenantScope(prisma, user)` — admin (org, ou org+`terminalId in`), terminal
    (`terminalId in [casa,...]`), entity (whitelist; testar fallback que consulta
    `prisma.user.findUnique`).
  - `resolveTerminalId(prisma, user, requested)` — admin usa requisitado; terminal
    força o próprio; valida posse pela organização.
  > Cobre S10.1/S10.2 (isolamento). Funções puras (algumas `async` com prisma
  > mockado só no ramo entity).

- [ ] **`[P1]` Helpers de RBAC** — `src/domain/enums.ts`
  Criar `domain-authz.spec.ts` para `canManage`, `canViewManagement`,
  `isPersonalOnly` (admin / terminal+tático / operacional / entity).
  > Espelham `pae-app/src/lib/access-control.ts`. Cobre S1.6/S1.7.

### 6.2 Serviços do núcleo (Fase 1) — CRUD + isolamento

Para cada um: CRUD feliz, validação de entrada, exceções, e **filtro por
`terminalId`/`organizationId`** (isolamento). Verifique se cada service injeta
`RealtimeGateway` (mocke se sim).

- [ ] **`[P0]` Terminais** — `src/modules/terminals/terminals.service.ts`
  (CRUD, geocodificação/coords, status, soft-delete).
- [ ] **`[P0]` Usuários** — `src/modules/users/users.service.ts`
  (create/update, `setStatus` ACTIVE/INACTIVE/SUSPENDED, `contacts` para o Crachá,
  hierarquia `getVisibleUsers` via `tacticalManagerId`). Cobre S2.5/S2.6, S8.1.
- [ ] **`[P0]` Entidades** — `src/modules/entities/entities.service.ts`
  (CRUD, status Ativo/Inativo). Cobre S2.4.
- [ ] **`[P0]` Permissões** — `src/modules/permissions/permissions.service.ts`
  (set Entity↔Terminais; bridge N:N). Cobre S2.7 — **pré-requisito do acionamento**.
- [ ] **`[P0]` Acionamento de Entidades** —
  `src/modules/notification-rules/notification-rules.service.ts`
  (CRUD de regra por tipo, `setMandatory`). Cobre S2.9 — junto com Permissões
  determina o acionamento automático (já testado no lado do emergency).
- [ ] **`[P1]` Dashboard / COP** — `src/modules/dashboard/dashboard.service.ts`
  (KPIs e indicadores agregados; comportamento com zero dados sem quebrar).
  Cobre S3.1/S3.2 (entrega parcial).

### 6.3 PAE / operação (Fase 1)

- [ ] **`[P1]` Riscos** — `src/modules/risks/risks.service.ts` (CRUD + isolamento). S7.4.
- [ ] **`[P1]` Planos de Ação** — `src/modules/emergency-plans/…` (CRUD, checklist,
  status ativo/inativo/em revisão). S7.5.
- [ ] **`[P1]` Mapa** — `src/modules/map-elements/…` (CRUD de MapElement por camada
  e terminal). S7.1/S7.2.
- [ ] **`[P1]` Notificações de entidade (status)** —
  `src/modules/entity-notifications/…` (transições
  Notificada→Em Atendimento→Confirmada). S6.2.
- [ ] **`[P1]` Chat da ocorrência** — no `EmergencyService`
  (`getChatMessages`/`addChatMessage` já existem; falta spec). S4.7/S6.3.
- [ ] **`[P2]` Timeline extra / checklist / evidências** — no `EmergencyService`
  (`addTimelineEvent`, `addChecklistItem`, `updateChecklistItem`, `addEvidence`);
  reforça a imutabilidade da timeline. S4.5/S4.6.

### 6.4 Front-end (Vitest) — regras de UII

Base já configurada (`pae-hub-app/vitest.config.ts`, só há `example.test.ts`).

- [ ] **`[P0]` Ocultação Fase 1** — `src/lib/nav-config.ts`
  Assertar que `NAV_CONFIG` **não** contém `my-panel`, `documents`, `safety`,
  `trainings`, `epis`, `compliance`; que nenhum item tem
  `section === 'Segurança Operacional'`; e presença dos itens do núcleo. Cobre
  S9.1/S9.2. Testar também `defaultPathForUser`, `navItemForPath`, `menuIdForPath`
  (Sala de Situação herda `occurrences`), `headerLabelForPath`, `situationRoomPath`.
- [ ] **`[P1]` RBAC de menu** — `src/lib/access-control.ts`
  (`isMenuAllowedForUser`, `getVisibleTerminalIds`, `getVisibleUsers`, `canManage`).
- [ ] **`[P1]` Licenciamento** — `src/lib/modules.ts` (`isMenuItemAccessible`,
  `getPackageLabel`).
- [ ] **`[P1]` Presentation Mode** — `src/lib/presentation-mode.tsx`
  (`maskName`, `maskEmail`, `maskPhone`, `maskContact`). Cobre S8.6.
- [ ] **`[P1]` Crachá → WhatsApp** — `src/modules/emergency/pages/BadgePage.tsx`
  A função `whatsappUrl` está **inline e não exportada**. Para testar:
  **extrair** para `src/lib/whatsapp.ts` (`export function whatsappUrl(phone)`) e
  importar no BadgePage; então testar `wa.me/55…`. Cobre S8.2 (requisito Fase 1).
- [ ] **`[P2]` Detecção de emergência ativa** — `useActiveEmergencies`
  (`src/api/hooks.ts`): render do hook com `QueryClientProvider` + mock de
  `occurrencesApi.list`, assertando o filtro `status === 'emergência ativa'`. S5.5.

### 6.5 E2E de verdade (futuro)

- [ ] **`[P2]` E2E de API (supertest)** — criar harness `test/jest-e2e.json`
  (referenciado pelo script `test:e2e`, **hoje inexistente**) + banco Postgres de
  teste (efêmero/Docker) + seed. Exercitar os endpoints reais ponta a ponta
  (login → cria terminal/entidade/usuário → permission/regra → dispara emergência →
  acionamento → resolução). Espelha o roteiro E2E da seção 6 do plano.
- [ ] **`[P2]` E2E de browser (Playwright)** — front + back no ar; valida a jornada
  crítica completa com UI. Não há nada configurado hoje.

### 6.6 Fase 2 (não priorizar agora)

- [ ] Segurança Operacional: `trainings`, `epis`, `compliance` services.
- [ ] AI Command (`src/modules/ai-command`), Alerts, War Room, PAE Documents.
- [ ] Meu Painel (front).

---

## 7. Mapa de cobertura (fluxo → testes)

| Área do fluxo | Casos E2E | Status back-end | Status front-end |
|---------------|-----------|-----------------|------------------|
| §4 Sessão / login / RBAC | S1.* | ✅ auth (parcial) | 🔲 |
| §3 Isolamento multi-tenant | S10.1/S10.2 | 🔲 tenant-scope | 🔲 access-control |
| §5 Cadastros base | S2.* | 🔲 services | — |
| §6.1 COP / indicadores | S3.* | 🔲 dashboard | 🔲 |
| §6.2/6.3 Ocorrências + Despacho | S4/S5.* | ✅ emergency | — |
| §6.4/6.5 Sala de Situação / resolução | S6.* | ✅ status; 🔲 chat/notif | — |
| §6.6–6.8 Mapa / Riscos / Planos | S7.* | 🔲 services | — |
| §6.9 Crachá / WhatsApp | S8.* | 🔲 users.contacts | 🔲 whatsapp |
| §2 Ocultação Fase 1 | S9.* | — | 🔲 nav-config |

---

## 8. Dívidas / decisões pendentes

- **CI:** rodar `npm test` (back) e `npm test` (front) em pipeline; hoje é manual.
- **Harness E2E de API:** decidir estratégia de banco (Docker efêmero vs. schema de
  teste) antes de escrever `*.e2e-spec.ts`.
- **`whatsappUrl`:** extrair para `src/lib/whatsapp.ts` (front) para virar testável
  sem renderizar a página.
- **Cobertura:** definir meta (ex.: `npm run test:cov`) para os serviços de núcleo.

---

_© M1 — Guia vivo. Atualize as caixas `[ ]` conforme os testes forem implementados._

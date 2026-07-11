# Runbook — Remoção total do "War Room"

> **Decisão:** o **War Room** será **removido por completo** do sistema. Ele foi um
> **erro de entendimento do Manus** — não existe na documentação oficial
> (`M1_PAE_Hub_Documentacao_Funcional.pdf` e `..._DER.pdf`), que definem apenas o
> **"Situation Room" (Sala de Situação)**. O conceito correto **já está implementado**
> no front-end (`SituationRoomPage`, rota `/ocorrencias/:id/sala-de-situacao`) e no
> back (timeline + checklist de 8 passos + chat via `ChatMessage`).
>
> Este documento é o **passo a passo** para eliminar o War Room sem quebrar o resto.

## Por que remover

- **Não está nos PDFs oficiais:** busca por "war room" nos dois documentos = 0
  ocorrências. Eles só citam "Situation Room" (Funcional §3.3/§4.1, DER §4.3).
- **Não está no DER:** a lista de entidades (§6.1) inclui `ChatMessage`, mas **nenhum**
  `WarRoom*`.
- **Sem consumidor no front:** `pae-hub-app` não tem **nenhuma** referência a War Room.
- **Redundante:** duplica o papel da Sala de Situação (sala de crise por ocorrência,
  com mensagens/decisões). O chat oficial já é o `ChatMessage`.

> ✅ **O que fica:** a **Sala de Situação** (Situation Room) — não mexa nela.
> ❌ **O que sai:** todo o módulo War Room (código, modelos, migração, seed, eventos).

---

## Inventário completo dos pontos de contato

| # | Arquivo | O que há de War Room |
|---|---------|----------------------|
| 1 | `src/modules/war-room/` (pasta inteira) | `war-room.controller.ts`, `war-room.service.ts`, `war-room.module.ts` |
| 2 | `src/app.module.ts` | `import { WarRoomModule }` + registro em `imports: [...]` |
| 3 | `src/main.ts` | `.addTag('War Room', 'Salas de crise')` (Swagger) |
| 4 | `src/modules/realtime/realtime.gateway.ts` | 4 eventos `WAR_ROOM_*` no enum `CopEventType`; handlers `join:warroom`/`leave:warroom`; método `emitToWarRoom(...)` |
| 5 | `prisma/schema.prisma` | `enum WarRoomStatus`; back-relations no `User` e no `Occurrence`; 4 models |
| 6 | `prisma/seed.ts` | bloco de seed que cria a War Room de exemplo |
| 7 | `prisma/migrations/…_init/migration.sql` | tabelas/enum (histórico — **não editar**; resolver via nova migração) |
| 8 | `src/modules/ai-command/ai-command.service.ts` | texto de prompt "Coordenação de War Room" (cosmético — opcional) |
| 9 | `src/modules/emergency/emergency.service.spec.ts` | mock `emitToWarRoom: jest.fn()` (inofensivo — opcional) |

> Verificação prévia feita: `emitToWarRoom` e os eventos `WAR_ROOM_*` **não são
> chamados por nenhum service** (nem o próprio War Room injeta o gateway). A remoção
> é segura.

---

## Passo a passo

### Passo 1 — Deletar o módulo War Room
Remova a pasta inteira:
```
src/modules/war-room/
├── war-room.controller.ts
├── war-room.service.ts
└── war-room.module.ts
```

### Passo 2 — Desregistrar no `src/app.module.ts`
Remova as duas linhas:
```ts
import { WarRoomModule } from './modules/war-room/war-room.module';   // ← apagar
// ...
imports: [
  // ...
  WarRoomModule,   // ← apagar
]
```

### Passo 3 — Remover o tag do Swagger em `src/main.ts`
Apague a linha:
```ts
.addTag('War Room', 'Salas de crise')
```

### Passo 4 — Limpar o `src/modules/realtime/realtime.gateway.ts`
Remova **três** blocos:

1. Os 4 membros do enum `CopEventType` (e o comentário `// War Room`):
   ```ts
   // War Room
   WAR_ROOM_OPENED = 'warroom:opened',
   WAR_ROOM_MESSAGE = 'warroom:message',
   WAR_ROOM_DECISION = 'warroom:decision',
   WAR_ROOM_CLOSED = 'warroom:closed',
   ```
2. Os dois handlers de socket:
   ```ts
   @SubscribeMessage('join:warroom')
   async handleJoinWarRoom(...) { ... }

   @SubscribeMessage('leave:warroom')
   async handleLeaveWarRoom(...) { ... }
   ```
3. O método de emissão:
   ```ts
   emitToWarRoom(warRoomId: string, event: CopEventType, data: any) {
     this.server.to(`warroom:${warRoomId}`).emit(event, { ...data, timestamp: new Date() });
   }
   ```

### Passo 5 — Limpar o `prisma/schema.prisma`
Remova, nesta ordem:

1. O **enum**:
   ```prisma
   enum WarRoomStatus {
     ACTIVE
     CLOSED
   }
   ```
2. No model **User**, as 3 back-relations:
   ```prisma
   warRoomParticipants  WarRoomParticipant[]
   warRoomMessages      WarRoomMessage[]
   warRoomDecisions     WarRoomDecision[]
   ```
3. No model **Occurrence**, a back-relation:
   ```prisma
   warRooms            WarRoom[]
   ```
4. Os **4 models** (seção `// ─── War Room ───`): `WarRoom`, `WarRoomParticipant`,
   `WarRoomMessage`, `WarRoomDecision`.

> ⚠️ Se esquecer as back-relations (2 e 3), o `prisma validate`/`migrate` falha —
> relação sem o outro lado.

### Passo 6 — Limpar o `prisma/seed.ts`
Remova o bloco `// ─── War Room (idempotente …)` inteiro — a criação de `warRoom`
(participants/messages/decisions) e o `console.log('✅ War Room: …')`.

### Passo 7 — Gerar a migração de remoção (banco)
**Não edite** a migração histórica `…_init`. Gere uma nova a partir do schema já
limpo:
```bash
cd pae-hub-api
npx prisma format          # normaliza o schema
npx prisma validate        # deve passar sem relação órfã
npx prisma migrate dev --name remove_war_room
```
O Prisma cria uma migração que faz `DROP TABLE` de `war_rooms`,
`war_room_participants`, `war_room_messages`, `war_room_decisions` e `DROP TYPE
"WarRoomStatus"`. Depois:
```bash
npx prisma generate        # regenera o Prisma Client sem os modelos
```

> Ambientes já provisionados: rode `npx prisma migrate deploy` para aplicar o DROP.
> Os dados de War Room existentes serão **descartados** (é o objetivo).

### Passo 8 — Limpezas opcionais (cosméticas)
- `src/modules/ai-command/ai-command.service.ts` (linha ~58): trocar/retirar o texto
  "Coordenação de War Room" no prompt. (AI Command é Fase 2; sem impacto funcional.)
- `src/modules/emergency/emergency.service.spec.ts`: remover a chave
  `emitToWarRoom: jest.fn()` do `mockRealtime` (leftover inofensivo).
- **`TimelineEventType`** (enum na migração `_init` com valores `WAR_ROOM_OPENED/CLOSED`):
  o schema atual **não usa** esse enum (a timeline usa `String` pt-BR). **Não requer
  ação** — são valores dormentes num enum legado.

---

## Verificação (depois de remover)

```bash
cd pae-hub-api

# 1) Nenhuma referência deve sobrar (exceto migração histórica _init e, se optar por
#    manter, o prompt do ai-command):
grep -rinE "warroom|war[ -]room|war_room|emitToWarRoom" src prisma/schema.prisma prisma/seed.ts

# 2) Schema válido e client regenerado
npx prisma validate && npx prisma generate

# 3) Compila e testes verdes
npx tsc -p tsconfig.build.json --noEmit
npm test
```

**Critérios de aceite:**
- ✅ `grep` acima retorna vazio (fora `migrations/…_init` e o prompt opcional).
- ✅ `prisma validate` passa; client regenera sem `WarRoom*`.
- ✅ Back-end sobe (`npm run start:dev`) e o Swagger não mostra mais o tag "War Room".
- ✅ `npm test` continua verde (24 testes — ajuste o mock do emergency se limpar o Passo 8).
- ✅ A **Sala de Situação** continua funcionando normalmente (não foi tocada).

---

## Checklist de execução

- [ ] Passo 1 — pasta `src/modules/war-room/` removida
- [ ] Passo 2 — `app.module.ts` sem `WarRoomModule`
- [ ] Passo 3 — `main.ts` sem o tag Swagger
- [ ] Passo 4 — `realtime.gateway.ts` sem eventos/handlers/método War Room
- [ ] Passo 5 — `schema.prisma` sem enum, back-relations e models
- [ ] Passo 6 — `seed.ts` sem o bloco War Room
- [ ] Passo 7 — migração `remove_war_room` gerada e aplicada + `prisma generate`
- [ ] Passo 8 — limpezas opcionais (ai-command / spec)
- [ ] Verificação — grep vazio, `prisma validate`, build e `npm test` ok

---

_© M1 — Runbook de remoção. Relacionado: divergência de conceito Manus
(War Room ≠ Sala de Situação/Situation Room)._

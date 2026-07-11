# Acionamento de Entidades — como a notificação funciona (estado atual + roadmap)

> Documenta **como o acionamento/notificação de entidades está implementado hoje** e
> **o que faltaria** para que a notificação **realmente alcance** a entidade por um
> canal externo (WhatsApp/SMS/e-mail). Serve como registro de decisão + guia de
> implementação.
>
> Contexto: verificado no código em 2026-07-11.

---

## 1. TL;DR

- Ao **criar uma ocorrência**, o sistema cruza **NotificationRule × Permission** e
  cria, para cada entidade que casa: **(1)** um registro `EntityNotification`
  (status "Notificada"), **(2)** um evento de timeline "entidade notificada", e
  **(3)** um evento **Socket.IO** em tempo real para a organização.
- **NÃO existe envio externo.** Nenhum e-mail, SMS, WhatsApp ou push é disparado. O
  contato da entidade é apenas **armazenado e exibido**.
- A entidade "recebe" a notificação **dentro do sistema**: ao vivo (se estiver
  logada, via WebSocket) ou quando entrar no app.
- O **único canal externo** é **manual**: o botão **WhatsApp** do **Crachá do PAE**
  (`wa.me`), acionado por uma pessoa — não pelo fluxo automático.

---

## 2. Estado atual (as-is)

### 2.1 Gatilho e regra
`EmergencyService.create()` ([../src/modules/emergency/emergency.service.ts](../src/modules/emergency/emergency.service.ts))
grava a ocorrência e chama `autoDispatchEntities()`. A regra de quem é acionado:

```
NotificationRule (occurrenceType == tipo da ocorrência)
        ✕
Permission da entidade (terminalIds inclui o terminal da ocorrência)
        +
entity.status == 'Ativo'
```

Só as entidades que satisfazem as **três** condições são acionadas. (Por isso a
Permissão e a Regra de Acionamento precisam existir **antes** de abrir a ocorrência.)

### 2.2 O que é criado (tudo interno)

| # | Artefato | Detalhe |
|---|----------|---------|
| 1 | **`EntityNotification`** (banco) | `status: 'Notificada'`, `mandatory`, `dispatchedBy: 'Sistema'` |
| 2 | **Evento de timeline** | tipo `'entidade notificada'` — ex.: *"Corpo de Bombeiros – 15º GB notificada automaticamente via (13) 3226-1933 [OBRIGATÓRIA]"* |
| 3 | **Evento realtime** | `RealtimeGateway.emitToOrganization(orgId, NOTIFICATION_CREATED, …)` → Socket.IO `notification:created` |

`EntityNotificationStatus` (ciclo): **Notificada → Em Atendimento → Confirmada**
(também existe `Pendente`). O contato da entidade (`entity.contact`) é só um dado —
**não é chamado**.

### 2.3 Como a entidade "recebe" (front)
A ponte de tempo real ([../../pae-hub-app/src/api/realtime.tsx](../../pae-hub-app/src/api/realtime.tsx))
mantém um WebSocket aberto e, ao receber `notification:created`, invalida as queries
(`entity-notifications`, `occurrences`) → o React Query recarrega → a UI atualiza.

- Entidade **logada** → vê a notificação **ao vivo** (Orquestração/Dashboard/ocorrência).
- Entidade **deslogada** → vê **quando entrar** no sistema.
- A entidade atualiza o status (`PATCH /entity-notifications/:id`), que emite
  `notification:updated` de volta.

### 2.4 Diagrama (as-is)
```
POST /occurrences
  └─ EmergencyService.create
       ├─ cria Occurrence (INC-####, timeline, checklist)
       └─ autoDispatchEntities
            ├─ para cada NotificationRule×Permission que casa:
            │    ├─ cria EntityNotification (status "Notificada")   [BANCO]
            │    ├─ cria timeline "entidade notificada"             [BANCO]
            │    └─ emitToOrganization("notification:created")      [SOCKET.IO]
            └─ (nenhuma mensagem sai do sistema)
                              │
        front (RealtimeBridge) ouve "notification:created"
                              └─ recarrega → entidade vê SE estiver no app
```

---

## 3. Gap / limitação

**A notificação automática não alcança a entidade fora do sistema.** Na prática, a
brigada/os Bombeiros só ficam sabendo se **abrirem o app**. Para uma plataforma de
emergência, o esperado normalmente é que o acionamento **chegue ao celular** do
responsável (push/WhatsApp/SMS) — isso **não existe hoje**.

> Alinhado à documentação funcional (a entidade "vê e atualiza o status dentro do
> sistema"), mas provavelmente **aquém da expectativa de operação real** de
> emergência. É uma decisão de produto/roadmap.

---

## 4. O que faltaria para envio externo real

### 4.1 Escolha de canal

| Canal | Prós | Contras / requisitos |
|-------|------|----------------------|
| **WhatsApp** (Cloud API da Meta, ou BSP: Twilio, Zenvia, 360dialog) | Alta taxa de leitura; já coletamos telefone; combina com o Crachá | Precisa de **templates aprovados** para mensagens iniciadas pela empresa fora da janela de 24h; opt-in; custo por template |
| **SMS** (Twilio/Zenvia) | Simples, universal, não depende de app | Custo por SMS; sem rich content; entregabilidade variável |
| **E-mail** (SMTP/SendGrid) | Barato, bom para registro formal | Baixa urgência; pode cair em spam |
| **Push** (FCM/web-push) | Instantâneo, gratuito | Exige app instalado/pré-cadastro do device; entidades externas raramente têm |

**Recomendação:** **WhatsApp** como canal primário (contexto de emergência + já temos
o telefone), com **SMS como fallback**. E-mail como registro complementar.

### 4.2 Onde plugaria no fluxo atual

Um novo serviço **`NotificationDispatcher`** chamado **dentro do**
`autoDispatchEntities`, **depois** de criar o `EntityNotification`:

```ts
// pseudo — dentro de autoDispatchEntities, após criar a EntityNotification:
await this.notificationDispatcher.dispatch({
  entityNotificationId,
  to: rule.entity.contact,          // telefone/e-mail da entidade
  channel: 'whatsapp',              // ou fallback SMS
  template: 'acionamento_emergencia',
  vars: { entidade: rule.entity.name, inc: occurrence.incNumber,
          terminal: terminalName, severidade: occurrence.severity, link },
});
```

Para **não bloquear** a criação da ocorrência e permitir **retry**, o envio deve ser
**assíncrono** (fila): `autoDispatchEntities` **enfileira** um job; um worker consome,
chama o provedor e atualiza o status de entrega.

### 4.3 Interface de canal (troca de provedor sem mexer no fluxo)
```ts
interface NotificationChannel {
  send(to: string, template: string, vars: Record<string, string>):
    Promise<{ providerMessageId: string }>;
}
// implementações: WhatsAppChannel, SmsChannel, EmailChannel
```

### 4.4 Mudanças no modelo de dados
Registrar a **entrega** (separada do "foi notificada" lógico). Duas opções:

- **Simples:** adicionar campos à `EntityNotification`:
  `channel`, `deliveryStatus` (`pending|sent|delivered|read|failed`),
  `providerMessageId`, `sentAt`, `error`.
- **Completa (recomendada):** tabela `NotificationDelivery` (1 `EntityNotification`
  → N entregas, uma por canal/tentativa) com os campos acima — permite fallback e
  histórico de tentativas.

### 4.5 Recebimento de status (webhooks)
Endpoint novo (ex.: `POST /webhooks/whatsapp`) para receber **recibos de entrega/
leitura** do provedor → atualiza `deliveryStatus` → emite `notification:updated` no
Socket.IO (a UI já reage a esse evento).

### 4.6 Infra, config e conformidade
- **Fila:** BullMQ + Redis (ou similar) para jobs de envio com retry/backoff.
- **Secrets:** token/phone-number-id do provedor (via `.env`, fora do versionamento).
- **Idempotência:** chave por `entityNotificationId` para não enviar duplicado.
- **Opt-in / LGPD:** consentimento do contato; registrar base legal.
- **WhatsApp:** cadastrar e **aprovar os templates** de mensagem na Meta/BSP antes de
  usar (mensagens fora da janela de 24h exigem template aprovado).
- **Rate limit / custo:** monitorar volume (cada template WhatsApp tem custo).

### 4.7 Diagrama (to-be)
```
autoDispatchEntities
   ├─ cria EntityNotification ("Notificada")        [BANCO]
   └─ enfileira job de envio                        [FILA]
             │
        worker → NotificationDispatcher → WhatsAppChannel → provedor ──▶ 📱 entidade
             └─ grava NotificationDelivery (sent)   [BANCO]
                          ▲
   webhook do provedor (delivered/read) ────────────┘ → atualiza status → Socket.IO
```

---

## 5. Decisões pendentes (para acionistas/produto)

1. O acionamento automático **precisa** alcançar a entidade fora do sistema no v1, ou
   o registro interno + tempo real é suficiente para esta entrega?
2. Canal primário: **WhatsApp**? Com **SMS** de fallback?
3. Provedor: **Cloud API da Meta** (direto) ou um **BSP** (Twilio/Zenvia/360dialog)?
4. Quem é o destinatário: o **contato da entidade** (institucional) e/ou os
   **usuários** vinculados a ela (telefones individuais)?
5. Orçamento e responsável pela conta/aprovação de templates do provedor.

---

## 6. Impacto no teste atual (cenário guiado)

No [../../pae-hub-app/docs/cenario-teste-guiado.md](../../pae-hub-app/docs/cenario-teste-guiado.md),
ao "notificar" os Bombeiros, **nada sai do sistema** — o usuário da entidade
(Sgt. Ricardo) precisa **entrar no app** para ver e responder. Isso é o comportamento
esperado **hoje**; o envio externo é o item de roadmap acima.

---

_© M1 — Registro de estado + roadmap do acionamento de entidades. Relacionado:
`emergency.service.ts` (autoDispatchEntities), `realtime.gateway.ts`,
`entity-notifications`._

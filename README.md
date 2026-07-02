# M1 PAE Hub — Back-end de Domínio

**Stack:** NestJS 10 + Prisma ORM + PostgreSQL + Socket.IO + JWT

Este é o back-end real do M1 PAE Hub, substituindo completamente o BFF/proxy Node.js com mocks. Implementa persistência real, autenticação JWT com RBAC, WebSocket com Socket.IO e todos os módulos de domínio da plataforma.

---

## Pré-requisitos

| Ferramenta | Versão mínima |
|---|---|
| Node.js | 20.x LTS |
| npm | 10.x |
| PostgreSQL | 15.x |

---

## Instalação Rápida

```bash
# 1. Clonar / extrair o projeto
cd m1-pae-api

# 2. Instalar dependências
npm install

# 3. Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas credenciais

# 4. Criar banco de dados
createdb m1_pae_hub

# 5. Executar migrations
npx prisma migrate dev --name init

# 6. Popular com dados de exemplo
npm run seed

# 7. Iniciar em desenvolvimento
npm run start:dev
```

A API estará disponível em `http://localhost:3001/api`.
O Swagger estará em `http://localhost:3001/api/docs`.

---

## Variáveis de Ambiente

```env
# Banco de dados
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/m1_pae_hub"

# JWT
JWT_SECRET="sua_chave_secreta_aqui"
JWT_EXPIRES_IN="1h"
JWT_REFRESH_EXPIRES_IN="7d"

# OpenAI (opcional — AI Command)
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="gpt-4o"

# CORS
CORS_ORIGINS="http://localhost:3000,http://localhost:5173"

# Servidor
PORT=3001
NODE_ENV=development
```

---

## Credenciais de Desenvolvimento (após seed)

| Perfil | E-mail | Senha |
|---|---|---|
| Administrador | admin@paehub.com | Pae@2026! |
| Gerente | gerente@paehub.com | Pae@2026! |
| Operador | operador1@paehub.com | Pae@2026! |

---

## Endpoints Principais

### Autenticação
```
POST   /api/auth/login          → Login com e-mail e senha
POST   /api/auth/refresh        → Renovar access token
POST   /api/auth/logout         → Encerrar sessão
GET    /api/auth/me             → Perfil do usuário autenticado
```

### Ocorrências / Emergências
```
GET    /api/occurrences         → Listar com filtros (status, severity, type, page)
GET    /api/occurrences/:id     → Buscar por ID (com timeline, alertas, war room)
POST   /api/occurrences         → Criar nova ocorrência
PUT    /api/occurrences/:id/status → Alterar status (OPEN → IN_PROGRESS → RESOLVED → CLOSED)
POST   /api/occurrences/:id/timeline → Adicionar evento à timeline
GET    /api/emergency-types     → Listar tipos de emergência
```

### Alertas
```
GET    /api/alerts              → Listar alertas
POST   /api/alerts              → Criar alerta manual
PUT    /api/alerts/:id/acknowledge → Reconhecer alerta
PUT    /api/alerts/:id/resolve  → Resolver alerta
```

### War Room
```
GET    /api/war-rooms           → Listar war rooms
GET    /api/war-rooms/:id       → Buscar com mensagens e decisões
POST   /api/war-rooms           → Abrir nova war room
POST   /api/war-rooms/:id/messages → Enviar mensagem
POST   /api/war-rooms/:id/decisions → Registrar decisão
PUT    /api/war-rooms/:id/close → Encerrar war room
```

### Dashboard / KPIs
```
GET    /api/dashboard/kpis      → KPIs gerais
GET    /api/dashboard/cop-indicators → Indicadores em tempo real para o COP
```

### AI Command
```
POST   /api/ai/chat             → Enviar mensagem ao AI Command
GET    /api/ai/insights         → Listar insights dos agentes
GET    /api/ai/knowledge        → Buscar na base de conhecimento
```

### Usuários
```
GET    /api/users               → Listar usuários (MANAGER+)
GET    /api/users/:id           → Buscar por ID
POST   /api/users               → Criar usuário (ADMIN+)
PUT    /api/users/:id           → Atualizar usuário
PUT    /api/users/:id/status    → Ativar/suspender
```

### Segurança
```
GET    /api/safety              → Listar itens de segurança
GET    /api/safety/summary      → Resumo por status
POST   /api/safety              → Criar item
PUT    /api/safety/:id          → Atualizar item
```

---

## WebSocket (Socket.IO)

Conectar com autenticação JWT:

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001', {
  auth: { token: 'seu_access_token_jwt' }
});

// Eventos emitidos pelo servidor
socket.on('occurrence:created', (data) => { ... });
socket.on('occurrence:status_changed', (data) => { ... });
socket.on('alert:created', (data) => { ... });
socket.on('alert:acknowledged', (data) => { ... });
socket.on('warroom:message', (data) => { ... });
socket.on('kpi:update', (data) => { ... });

// Entrar em uma War Room
socket.emit('join:warroom', { warRoomId: 'uuid' });
```

---

## Estrutura do Projeto

```
src/
  app.module.ts              ← Módulo raiz
  main.ts                    ← Bootstrap (Swagger, CORS, pipes)
  prisma/
    prisma.service.ts        ← Conexão com banco
    prisma.module.ts
  common/
    guards/                  ← JwtAuthGuard, RolesGuard
    decorators/              ← @CurrentUser, @Roles
    filters/                 ← AllExceptionsFilter
    interceptors/            ← TransformInterceptor
  modules/
    auth/                    ← Login, refresh token, JWT, RBAC
    users/                   ← CRUD de usuários
    emergency/               ← Ocorrências, timeline, tipos
    alerts/                  ← Alertas operacionais
    war-room/                ← Salas de crise
    safety/                  ← Segurança do trabalho
    dashboard/               ← KPIs e indicadores
    ai-command/              ← AI Command + base de conhecimento
    realtime/                ← Gateway Socket.IO
prisma/
  schema.prisma              ← Schema completo do banco
  seed.ts                    ← Dados de exemplo
```

---

## Scripts

```bash
npm run start:dev      # Desenvolvimento com hot reload
npm run start:prod     # Produção
npm run build          # Compilar TypeScript
npm run test           # Testes unitários
npm run test:cov       # Testes com cobertura
npm run seed           # Popular banco com dados de exemplo
npx prisma studio      # Interface visual do banco
npx prisma migrate dev # Criar nova migration
```

---

## Integração com o Frontend

Para conectar o Hub Web (BFF) a este back-end, configure no `.env` do projeto `m1_pae_hub_frontend`:

```env
PAE_API_URL=http://localhost:3001
```

O `paeProxy.ts` do BFF encaminhará automaticamente todas as requisições `/api/*` para este back-end em vez de usar os mocks.

---

## RBAC — Hierarquia de Roles

| Role | Permissões |
|---|---|
| `VIEWER` | Leitura apenas |
| `OPERATOR` | Criar/atualizar ocorrências, alertas, mensagens |
| `MANAGER` | Tudo do OPERATOR + fechar war rooms, decisões, relatórios |
| `ADMIN` | Tudo do MANAGER + gestão de usuários |
| `SUPER_ADMIN` | Acesso total, multi-organização |

import 'dotenv/config';
import { PrismaClient, UserStatus, OccurrenceType, OccurrenceSeverity, OccurrenceCriticality, OccurrenceStatus, AlertType, AlertSeverity, AlertStatus, SafetyItemType, SafetyItemStatus, TimelineEventType, KnowledgeEntryType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  // ─── Organization ─────────────────────────────────────────────────────────
  const org = await prisma.organization.upsert({
    where: { slug: 'terminal-santos' },
    update: {},
    create: {
      name: 'Terminal Santos S.A.',
      slug: 'terminal-santos',
      description: 'Terminal portuário de Santos — operações 24/7',
      isActive: true,
    },
  });
  console.log(`✅ Organização: ${org.name}`);

  // ─── Terminals ────────────────────────────────────────────────────────────
  const terminal1 = await prisma.terminal.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'T01' } },
    update: {},
    create: {
      organizationId: org.id,
      name: 'Terminal Norte (TECON)',
      code: 'T01',
      location: 'Cais 1 - Berço 101, Santos/SP',
      isActive: true,
    },
  });

  const terminal2 = await prisma.terminal.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'T02' } },
    update: {},
    create: {
      organizationId: org.id,
      name: 'Terminal Químico Sul',
      code: 'T02',
      location: 'Cais 4 - Berço 402, Santos/SP',
      isActive: true,
    },
  });
  console.log(`✅ Terminais: ${terminal1.name}, ${terminal2.name}`);

  // ─── Usuários (perfis oficiais — Funcional §2.1 / DER §3.2) ─────────────────
  const hash = (senha: string) => bcrypt.hash(senha, 12);

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@paehub.com' },
    update: {},
    create: {
      organizationId: org.id, terminalId: null,
      name: 'Administrador Geral', email: 'admin@paehub.com',
      passwordHash: await hash('admin123'),
      role: 'admin', accessLevel: null, status: UserStatus.ACTIVE,
      department: 'TI / Operações',
    },
  });

  const diretorUser = await prisma.user.upsert({
    where: { email: 'diretor@tecon.com' },
    update: {},
    create: {
      organizationId: org.id, terminalId: terminal1.id,
      name: 'Diretor Portuário', email: 'diretor@tecon.com',
      passwordHash: await hash('estrategico123'),
      role: 'terminal', accessLevel: 'estratégico', status: UserStatus.ACTIVE,
      department: 'Diretoria',
    },
  });

  const carlosUser = await prisma.user.upsert({
    where: { email: 'carlos@tecon.com' },
    update: {},
    create: {
      organizationId: org.id, terminalId: terminal1.id,
      name: 'Carlos Silva', email: 'carlos@tecon.com',
      passwordHash: await hash('terminal123'),
      role: 'terminal', accessLevel: 'tático', status: UserStatus.ACTIVE,
      department: 'Operações', phone: '(13) 9982-1122',
    },
  });

  const joaoUser = await prisma.user.upsert({
    where: { email: 'joao@tecon.com' },
    update: {},
    create: {
      organizationId: org.id, terminalId: terminal1.id,
      name: 'Supervisor João', email: 'joao@tecon.com',
      passwordHash: await hash('tatico123'),
      role: 'terminal', accessLevel: 'tático', status: UserStatus.ACTIVE,
      department: 'Supervisão',
    },
  });

  const pedroUser = await prisma.user.upsert({
    where: { email: 'pedro@tecon.com' },
    update: {},
    create: {
      organizationId: org.id, terminalId: terminal1.id,
      name: 'Operador Pedro', email: 'pedro@tecon.com',
      passwordHash: await hash('operacional123'),
      role: 'terminal', accessLevel: 'operacional', status: UserStatus.ACTIVE,
      department: 'Campo', tacticalManagerId: joaoUser.id,
    },
  });

  const bombeiroUser = await prisma.user.upsert({
    where: { email: 'bombeiro@gov.br' },
    update: {},
    create: {
      organizationId: org.id, terminalId: null,
      name: 'Oficial Bombeiro', email: 'bombeiro@gov.br',
      passwordHash: await hash('entity123'),
      role: 'entity', accessLevel: null, status: UserStatus.ACTIVE,
      department: 'Corpo de Bombeiros',
    },
  });
  console.log('✅ Usuários oficiais: admin, diretor (estratégico), carlos + joão (tático), pedro (operacional), bombeiro (entity)');

  // ─── Emergency Types ──────────────────────────────────────────────────────
  const emergencyTypes = [
    { code: 'FIRE', name: 'Incêndio', color: '#FF4444', icon: 'flame' },
    { code: 'SPILL', name: 'Derramamento', color: '#FF8800', icon: 'droplets' },
    { code: 'MEDICAL', name: 'Emergência Médica', color: '#FF0066', icon: 'heart-pulse' },
    { code: 'STRUCTURAL', name: 'Falha Estrutural', color: '#8800FF', icon: 'building' },
    { code: 'SECURITY', name: 'Segurança Patrimonial', color: '#0044FF', icon: 'shield' },
    { code: 'ENVIRONMENTAL', name: 'Ambiental', color: '#00AA44', icon: 'leaf' },
  ];
  for (const et of emergencyTypes) {
    await prisma.emergencyType.upsert({ where: { code: et.code }, update: {}, create: { ...et, isActive: true } });
  }
  console.log(`✅ Tipos de emergência: ${emergencyTypes.length}`);

  // ─── Sample Occurrences ───────────────────────────────────────────────────
  const fireType = await prisma.emergencyType.findUnique({ where: { code: 'FIRE' } });
  const medicalType = await prisma.emergencyType.findUnique({ where: { code: 'MEDICAL' } });

  const occ1 = await prisma.occurrence.create({
    data: {
      code: 'OCC-2026-0001',
      terminalId: terminal1.id,
      emergencyTypeId: fireType!.id,
      title: 'Princípio de incêndio na correia transportadora C-07',
      description: 'Fumaça detectada na correia transportadora C-07, próximo ao silo 3. Acionado sistema de sprinklers automático.',
      type: OccurrenceType.FIRE,
      severity: OccurrenceSeverity.HIGH,
      criticality: OccurrenceCriticality.EMERGENCY,
      status: OccurrenceStatus.IN_PROGRESS,
      location: 'Correia C-07, Silo 3',
      latitude: -23.9618,
      longitude: -46.3322,
      reportedByUserId: pedroUser.id,
      assignedToUserId: carlosUser.id,
      slaDeadline: new Date(Date.now() + 4 * 60 * 60 * 1000),
      timeline: {
        create: [
          { userId: pedroUser.id, eventType: TimelineEventType.CREATED, description: 'Ocorrência criada por Operador Pedro' },
          { userId: carlosUser.id, eventType: TimelineEventType.ASSIGNED, description: 'Ocorrência atribuída a Carlos Silva' },
          { userId: carlosUser.id, eventType: TimelineEventType.STATUS_CHANGED, description: 'Brigada de incêndio acionada. Status alterado para Em Andamento.', metadata: { previousStatus: 'OPEN', newStatus: 'IN_PROGRESS' } },
        ],
      },
    },
  });

  const occ2 = await prisma.occurrence.create({
    data: {
      code: 'OCC-2026-0002',
      terminalId: terminal1.id,
      emergencyTypeId: medicalType!.id,
      title: 'Trabalhador com suspeita de insolação — Pátio 2',
      description: 'Operador encontrado inconsciente no pátio 2. SAMU acionado. Temperatura ambiente 38°C.',
      type: OccurrenceType.MEDICAL,
      severity: OccurrenceSeverity.CRITICAL,
      criticality: OccurrenceCriticality.CRISIS,
      status: OccurrenceStatus.OPEN,
      location: 'Pátio 2, Terminal Norte',
      reportedByUserId: pedroUser.id,
      slaDeadline: new Date(Date.now() + 1 * 60 * 60 * 1000),
      timeline: {
        create: [{ userId: pedroUser.id, eventType: TimelineEventType.CREATED, description: 'Ocorrência criada. SAMU acionado.' }],
      },
    },
  });
  console.log(`✅ Ocorrências de exemplo: ${occ1.code}, ${occ2.code}`);

  // ─── Sample Alerts ────────────────────────────────────────────────────────
  await prisma.alert.createMany({
    data: [
      { terminalId: terminal1.id, occurrenceId: occ1.id, title: 'Incêndio detectado — Correia C-07', message: 'Sistema de detecção automática acionado. Temperatura acima de 80°C na correia C-07.', type: AlertType.SAFETY, severity: AlertSeverity.CRITICAL, status: AlertStatus.ACTIVE, source: 'sensor_fire_c07' },
      { terminalId: terminal1.id, title: 'SLA em risco — OCC-2026-0001', message: 'Ocorrência OCC-2026-0001 com SLA vencendo em menos de 2 horas.', type: AlertType.OPERATIONAL, severity: AlertSeverity.HIGH, status: AlertStatus.ACTIVE, source: 'sla_monitor' },
      { terminalId: terminal2.id, title: 'Manutenção preventiva vencida — Guindaste G-03', message: 'Guindaste G-03 com manutenção preventiva vencida há 5 dias.', type: AlertType.OPERATIONAL, severity: AlertSeverity.MEDIUM, status: AlertStatus.ACTIVE, source: 'maintenance_scheduler' },
    ],
  });
  console.log(`✅ Alertas de exemplo: 3`);

  // ─── Safety Items ─────────────────────────────────────────────────────────
  await prisma.safetyItem.createMany({
    data: [
      { terminalId: terminal1.id, assignedToId: pedroUser.id, type: SafetyItemType.EPI, title: 'Renovação de EPIs — Brigada de Incêndio', description: 'Capacetes, luvas e roupas de aproximação com validade vencida.', status: SafetyItemStatus.PENDING, dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
      { terminalId: terminal1.id, assignedToId: carlosUser.id, type: SafetyItemType.TRAINING, title: 'Treinamento de combate a incêndio — Turma B', description: 'Reciclagem anual obrigatória para operadores do Terminal Norte.', status: SafetyItemStatus.IN_PROGRESS, dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) },
      { terminalId: terminal1.id, type: SafetyItemType.INSPECTION, title: 'Inspeção mensal — Extintores Pátio 1 e 2', description: 'Verificação de carga, validade e acessibilidade dos extintores.', status: SafetyItemStatus.OVERDUE, dueDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
    ],
  });
  console.log(`✅ Itens de segurança: 3`);

  // ─── Knowledge Base ───────────────────────────────────────────────────────
  await prisma.knowledgeEntry.createMany({
    data: [
      { authorId: adminUser.id, type: KnowledgeEntryType.PROCEDURE, title: 'Procedimento de Combate a Incêndio em Correias Transportadoras', content: `## Procedimento PAE-001\n\n### Ações Imediatas\n1. Acionar alarme de incêndio\n2. Ligar para brigada: ramal 190\n3. Desligar correia afetada\n4. Não usar água em equipamentos elétricos`, tags: ['incêndio', 'correia', 'procedimento', 'brigada'], isPublished: true },
      { authorId: carlosUser.id, type: KnowledgeEntryType.LESSON_LEARNED, title: 'Lição Aprendida: Insolação em Operações de Verão', content: `## Contexto\nDurante o verão de 2025, registramos 3 casos de insolação em operadores de pátio.\n\n## Ações Corretivas\n1. Instalação de 4 bebedouros no pátio 2\n2. Pausas obrigatórias de 10min a cada 2h`, tags: ['insolação', 'verão', 'saúde', 'lição aprendida'], isPublished: true },
    ],
  });
  console.log(`✅ Base de conhecimento: 2 entradas`);

  // ─── War Room ─────────────────────────────────────────────────────────────
  const warRoom = await prisma.warRoom.create({
    data: {
      occurrenceId: occ1.id,
      title: `War Room — OCC-2026-0001 (Incêndio C-07)`,
      status: 'ACTIVE',
      participants: { create: [{ userId: adminUser.id }, { userId: carlosUser.id }, { userId: pedroUser.id }] },
      messages: {
        create: [
          { userId: adminUser.id, content: 'War Room aberta. Todos os envolvidos foram notificados.', isSystem: true },
          { userId: carlosUser.id, content: 'Brigada no local. Fogo controlado. Aguardando resfriamento.' },
          { userId: pedroUser.id, content: 'Correia C-07 desligada. Área isolada com fita zebrada.' },
        ],
      },
      decisions: {
        create: [
          { userId: carlosUser.id, description: 'Suspender operação da correia C-07 até laudo técnico.' },
          { userId: carlosUser.id, description: 'Acionar seguradora e equipe de manutenção especializada.' },
        ],
      },
    },
  });
  console.log(`✅ War Room: ${warRoom.id}`);

  console.log('\n🎉 Seed concluído com sucesso!');
  console.log('\n📋 Credenciais de acesso (oficiais):');
  console.log('   Admin:        admin@paehub.com    / admin123');
  console.log('   Estratégico:  diretor@tecon.com   / estrategico123');
  console.log('   Tático:       carlos@tecon.com    / terminal123');
  console.log('   Tático:       joao@tecon.com      / tatico123');
  console.log('   Operacional:  pedro@tecon.com     / operacional123');
  console.log('   Entidade:     bombeiro@gov.br     / entity123');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

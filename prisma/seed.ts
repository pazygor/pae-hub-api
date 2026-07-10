import 'dotenv/config';
import { PrismaClient, UserStatus, AlertType, AlertSeverity, AlertStatus, SafetyItemType, SafetyItemStatus, KnowledgeEntryType } from '@prisma/client';
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
  // Endereço estruturado (cep/rua/número/bairro/cidade/UF) — usado no CEP-autofill
  // e na geocodificação. Mantido também no `update` p/ backfillar bancos já semeados.
  const terminal1Address = {
    location: 'Avenida Engenheiro Augusto Barata, 100, Saboó, Santos, SP',
    cep: '11085-000', street: 'Avenida Engenheiro Augusto Barata', number: '100',
    neighborhood: 'Saboó', city: 'Santos', state: 'SP',
  };
  const terminal2Address = {
    location: 'Avenida Cônego Domênico Rangoni, 402, Alemoa, Santos, SP',
    cep: '11095-650', street: 'Avenida Cônego Domênico Rangoni', number: '402',
    neighborhood: 'Alemoa', city: 'Santos', state: 'SP',
  };
  const terminal3Address = {
    location: 'Estrada da Alemoa, 701, Alemoa, Santos, SP',
    cep: '11095-000', street: 'Estrada da Alemoa', number: '701',
    neighborhood: 'Alemoa', city: 'Santos', state: 'SP',
  };

  const terminal1 = await prisma.terminal.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'T01' } },
    update: { ...terminal1Address },
    create: {
      organizationId: org.id,
      name: 'Terminal Norte (TECON)',
      code: 'T01',
      ...terminal1Address,
      responsible: 'Carlos Silva',
      contact: '(13) 9982-1122',
      latitude: -23.9618,
      longitude: -46.3322,
      status: 'Ativo',
      isActive: true,
    },
  });

  const terminal2 = await prisma.terminal.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'T02' } },
    update: { ...terminal2Address },
    create: {
      organizationId: org.id,
      name: 'Terminal Químico Sul',
      code: 'T02',
      ...terminal2Address,
      responsible: 'Ana Paula Mendes',
      contact: '(13) 9971-3344',
      latitude: -23.9720,
      longitude: -46.3280,
      status: 'Revisão',
      isActive: true,
    },
  });
  const terminal3 = await prisma.terminal.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'T03' } },
    update: { ...terminal3Address },
    create: {
      organizationId: org.id,
      name: 'Terminal de Granéis Líquidos',
      code: 'T03',
      ...terminal3Address,
      responsible: 'Roberto Almeida',
      contact: '(13) 9965-5566',
      latitude: -23.9550,
      longitude: -46.3400,
      status: 'Ativo',
      isActive: true,
    },
  });
  console.log(`✅ Terminais: ${terminal1.name}, ${terminal2.name}, ${terminal3.name}`);

  // ─── Entidades externas + Permissões + Regras de acionamento (Fase 4b) ──────
  const entitySpecs = [
    { key: 'bombeiros', name: 'Corpo de Bombeiros', type: 'Emergência', contact: '193' },
    { key: 'autoridade', name: 'Autoridade Portuária de Santos', type: 'Autoridade Portuária', contact: '(13) 3202-6565' },
    { key: 'defesa', name: 'Defesa Civil', type: 'Emergência', contact: '199' },
    { key: 'ibama', name: 'Órgão Ambiental (IBAMA)', type: 'Ambiental', contact: '0800-618-080' },
  ];
  const ent: Record<string, { id: string }> = {};
  for (const e of entitySpecs) {
    const existing = await prisma.entity.findFirst({ where: { organizationId: org.id, name: e.name } });
    ent[e.key] = existing ?? await prisma.entity.create({
      data: { organizationId: org.id, name: e.name, type: e.type, contact: e.contact, status: 'Ativo' },
    });
  }
  // Permissões (entidade → terminais que atende)
  const permSpecs: [string, string[]][] = [
    ['bombeiros', [terminal1.id, terminal2.id, terminal3.id]],
    ['autoridade', [terminal1.id, terminal2.id]],
    ['defesa', [terminal1.id, terminal3.id]],
    ['ibama', [terminal2.id, terminal3.id]],
  ];
  for (const [key, terminalIds] of permSpecs) {
    await prisma.permission.upsert({
      where: { entityId: ent[key].id },
      update: { terminalIds },
      create: { entityId: ent[key].id, terminalIds },
    });
  }
  // Regras de acionamento por tipo de ocorrência
  const ruleSpecs: [string, string, boolean][] = [
    ['Princípio de incêndio', 'bombeiros', true],
    ['Princípio de incêndio', 'defesa', false],
    ['Vazamento', 'ibama', true],
    ['Vazamento', 'defesa', false],
    ['Emergência', 'bombeiros', true],
    ['Emergência', 'autoridade', true],
    ['Emergência', 'defesa', true],
    ['Emergência', 'ibama', false],
    ['Explosão', 'bombeiros', true],
    ['Explosão', 'defesa', true],
    ['Contaminação ambiental', 'ibama', true],
  ];
  for (const [occurrenceType, key, mandatory] of ruleSpecs) {
    const existing = await prisma.notificationRule.findFirst({
      where: { organizationId: org.id, occurrenceType, entityId: ent[key].id },
    });
    if (!existing) {
      await prisma.notificationRule.create({
        data: { organizationId: org.id, occurrenceType, entityId: ent[key].id, mandatory },
      });
    }
  }
  console.log(`✅ Entidades: ${entitySpecs.length} · Permissões: ${permSpecs.length} · Regras: ${ruleSpecs.length}`);

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
      department: 'TI / Operações', phone: '(13) 99900-0001',
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
      department: 'Diretoria', phone: '(13) 99900-0002',
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
      department: 'Supervisão', phone: '(13) 99900-0003',
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
      department: 'Campo', phone: '(13) 99900-0004', tacticalManagerId: joaoUser.id,
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

  // ─── Sample Occurrences (Fase 2 — vocabulário pt/DER, idempotente) ─────────
  const CHECKLIST_TEMPLATE = [
    'Ocorrência validada', 'Equipe acionada', 'Plano de emergência ativado',
    'Autoridade notificada', 'Evacuação iniciada', 'Área isolada',
    'Comunicação registrada', 'Ocorrência encerrada',
  ];
  const checklistCreate = { create: CHECKLIST_TEMPLATE.map((text, i) => ({ title: text, order: i })) };

  let occ1 = await prisma.occurrence.findFirst({ where: { organizationId: org.id, incNumber: 'INC-0001' } });
  if (!occ1) {
    occ1 = await prisma.occurrence.create({
      data: {
        organizationId: org.id,
        incNumber: 'INC-0001',
        terminalId: terminal1.id,
        type: 'Princípio de incêndio',
        description: 'Fumaça detectada na correia transportadora C-07, próximo ao silo 3. Acionado sistema de sprinklers automático.',
        status: 'em atendimento',
        criticality: 'alta',
        severity: 'alta',
        responsible: 'Carlos Silva',
        team: 'Brigada de Incêndio',
        location: 'Correia C-07, Silo 3',
        latitude: -23.9618,
        longitude: -46.3322,
        reportedByUserId: pedroUser.id,
        timeline: {
          create: [
            { userId: pedroUser.id, eventType: 'ocorrência registrada', description: 'Fumaça detectada na correia C-07. Sprinklers acionados automaticamente.' },
            { userId: carlosUser.id, eventType: 'equipe acionada', description: 'Brigada de incêndio acionada por Carlos Silva.' },
            { userId: carlosUser.id, eventType: 'atualização de status', description: 'Status alterado de "aberto" para "em atendimento".', metadata: { previousStatus: 'aberto', newStatus: 'em atendimento' } },
          ],
        },
        checklist: checklistCreate,
      },
    });
  }

  let occ2 = await prisma.occurrence.findFirst({ where: { organizationId: org.id, incNumber: 'INC-0002' } });
  if (!occ2) {
    occ2 = await prisma.occurrence.create({
      data: {
        organizationId: org.id,
        incNumber: 'INC-0002',
        terminalId: terminal1.id,
        type: 'Acidente de trabalho',
        description: 'Operador encontrado inconsciente no pátio 2. SAMU acionado. Temperatura ambiente 38°C.',
        status: 'aberto',
        criticality: 'crítica',
        severity: 'alta',
        responsible: 'Operador Pedro',
        team: 'SST',
        location: 'Pátio 2, Terminal Norte',
        reportedByUserId: pedroUser.id,
        timeline: {
          create: [{ userId: pedroUser.id, eventType: 'ocorrência registrada', description: 'Operador encontrado inconsciente. SAMU acionado.' }],
        },
        checklist: checklistCreate,
      },
    });
  }

  // Contador do INC-#### nunca regride (banco pode ter mais ocorrências)
  await prisma.organization.updateMany({
    where: { id: org.id, occurrenceSeq: { lt: 2 } },
    data: { occurrenceSeq: 2 },
  });
  console.log(`✅ Ocorrências de exemplo: ${occ1.incNumber}, ${occ2.incNumber}`);

  // ─── Fase 5a — Riscos, Planos, Mapa e Documentos (idempotente por nome) ─────
  const t = { t1: terminal1.id, t2: terminal2.id, t3: terminal3.id };

  const riskSpecs = [
    { terminalId: t.t1, type: 'Incêndio', description: 'Risco de incêndio em área de armazenamento de contêineres', level: 'alto', affectedArea: 'Pátio de contêineres', date: '2026-03-01' },
    { terminalId: t.t2, type: 'Vazamento Químico', description: 'Possibilidade de vazamento em tanques de amônia', level: 'alto', affectedArea: 'Tanques 3 e 4', date: '2026-03-05' },
    { terminalId: t.t1, type: 'Queda de carga', description: 'Risco de queda durante operação de guindastes', level: 'médio', affectedArea: 'Berço 101', date: '2026-03-10' },
  ];
  for (const r of riskSpecs) {
    const exists = await prisma.risk.findFirst({ where: { organizationId: org.id, terminalId: r.terminalId, type: r.type } });
    if (!exists) {
      await prisma.risk.create({ data: { organizationId: org.id, ...r, date: new Date(r.date) } });
    }
  }

  const planSpecs = [
    { terminalId: t.t1, name: 'PAE Incêndio TECON', description: 'Plano de ação para combate a incêndios no terminal norte', responsible: 'Carlos Silva', checklist: [{ text: 'Acionar alarme', done: true }, { text: 'Evacuar área', done: false }, { text: 'Contatar bombeiros', done: false }], status: 'ativo' },
    { terminalId: t.t2, name: 'PAE Vazamento Químico', description: 'Procedimentos em caso de vazamento de produtos químicos', responsible: 'Ana Paula Mendes', checklist: [{ text: 'Isolar área', done: true }, { text: 'Ativar sistema de contenção', done: true }, { text: 'Notificar IBAMA', done: false }], status: 'ativo' },
  ];
  for (const p of planSpecs) {
    const exists = await prisma.emergencyPlan.findFirst({ where: { organizationId: org.id, name: p.name } });
    if (!exists) {
      await prisma.emergencyPlan.create({ data: { organizationId: org.id, ...p } });
    }
  }

  const docSpecs = [
    { terminalId: t.t1, title: 'PAE Incêndio - Terminal Norte', docType: 'Plano de Ação de Emergência', description: 'Plano completo de ação para combate a incêndios no TECON', fileName: 'pae-incendio-tecon.pdf', uploadedBy: 'Carlos Silva' },
    { terminalId: t.t1, title: 'Rota de Evacuação - Cais 1', docType: 'Rotas de evacuação', description: 'Mapa de evacuação do berço 101 e áreas adjacentes', fileName: 'rota-evacuacao-cais1.pdf', uploadedBy: 'Carlos Silva' },
    { terminalId: t.t2, title: 'Contatos de Emergência Atualizados', docType: 'Contatos de emergência', description: 'Lista de contatos de emergência do Terminal Químico Sul', fileName: 'contatos-emergencia-tqs.pdf', uploadedBy: 'Ana Paula Mendes' },
    { terminalId: t.t2, title: 'Procedimento de Contenção Química', docType: 'Procedimentos operacionais', description: 'Procedimento padrão para contenção de vazamentos químicos', fileName: 'proc-contencao-quimica.pdf', uploadedBy: 'Ana Paula Mendes' },
    { terminalId: t.t3, title: 'Planta Operacional - Granéis', docType: 'Plantas operacionais', description: 'Planta operacional do Terminal de Granéis Líquidos', fileName: 'planta-graneis.dwg', uploadedBy: 'Roberto Almeida' },
  ];
  for (const d of docSpecs) {
    const exists = await prisma.pAEDocument.findFirst({ where: { organizationId: org.id, title: d.title } });
    if (!exists) {
      await prisma.pAEDocument.create({ data: { organizationId: org.id, ...d } });
    }
  }

  const mapSpecs = [
    { terminalId: t.t1, name: 'Extintor CO2 - Pátio A', layerType: 'fire_equipment', latitude: -23.9615, longitude: -46.3318, description: 'Extintor de CO2 próximo ao pátio de contêineres A3' },
    { terminalId: t.t1, name: 'Extintor PQS - Berço 101', layerType: 'fire_equipment', latitude: -23.9622, longitude: -46.3326, description: 'Extintor de pó químico seco no berço 101' },
    { terminalId: t.t1, name: 'Hidrante H-01', layerType: 'hydrant', latitude: -23.9612, longitude: -46.3330, description: 'Hidrante de coluna junto ao portão principal' },
    { terminalId: t.t1, name: 'Hidrante H-02', layerType: 'hydrant', latitude: -23.9625, longitude: -46.3315, description: 'Hidrante subterrâneo no pátio de cargas' },
    { terminalId: t.t1, name: 'Rota Evacuação Norte', layerType: 'evacuation_route', latitude: -23.9608, longitude: -46.3322, description: 'Rota de evacuação pela saída norte do terminal' },
    { terminalId: t.t2, name: 'Área de Risco - Tanques', layerType: 'risk_area', latitude: -23.9718, longitude: -46.3275, description: 'Área de armazenamento de produtos químicos' },
    { terminalId: t.t2, name: 'Área de Risco - Amônia', layerType: 'risk_area', latitude: -23.9725, longitude: -46.3285, description: 'Perímetro de segurança dos tanques de amônia' },
    { terminalId: t.t1, name: 'Ponto de Encontro Alpha', layerType: 'meeting_point', latitude: -23.9605, longitude: -46.3335, description: 'Ponto de encontro principal para evacuação do TECON' },
    { terminalId: t.t2, name: 'Ponto de Encontro Bravo', layerType: 'meeting_point', latitude: -23.9730, longitude: -46.3270, description: 'Ponto de encontro do Terminal Químico Sul' },
    { terminalId: t.t3, name: 'Hidrante H-03', layerType: 'hydrant', latitude: -23.9548, longitude: -46.3395, description: 'Hidrante no acesso principal do terminal de granéis' },
    { terminalId: t.t3, name: 'Extintor Espuma - Dique', layerType: 'fire_equipment', latitude: -23.9555, longitude: -46.3405, description: 'Extintor de espuma mecânica junto ao dique de contenção' },
    { terminalId: t.t2, name: 'Rota Evacuação Cais 4', layerType: 'evacuation_route', latitude: -23.9715, longitude: -46.3290, description: 'Rota de evacuação pelo cais 4 do terminal químico' },
  ];
  for (const el of mapSpecs) {
    const exists = await prisma.mapElement.findFirst({ where: { organizationId: org.id, name: el.name } });
    if (!exists) {
      await prisma.mapElement.create({ data: { organizationId: org.id, ...el } });
    }
  }
  console.log(`✅ 5a: ${riskSpecs.length} riscos · ${planSpecs.length} planos · ${docSpecs.length} documentos · ${mapSpecs.length} elementos de mapa`);

  // ─── Fase 5b — Segurança Operacional (idempotente por nome) ─────────────────
  const trainingSpecs = [
    { terminalId: t.t1, name: 'Combate a Incêndio', description: 'Treinamento básico de combate a incêndios em área portuária', mandatory: true, materialFileName: 'manual-combate-incendio.pdf', videoUrl: 'https://www.youtube.com/watch?v=example1' },
    { terminalId: t.t1, name: 'Primeiros Socorros', description: 'Atendimento de emergência e primeiros socorros', mandatory: true, videoUrl: 'https://www.youtube.com/watch?v=example2' },
    { terminalId: t.t2, name: 'Manuseio de Produtos Químicos', description: 'Procedimentos para manuseio seguro de produtos químicos', mandatory: false, materialFileName: 'guia-produtos-quimicos.pptx' },
    { terminalId: t.t1, name: 'Evacuação de Emergência', description: 'Procedimentos de evacuação e uso de rotas de fuga', mandatory: true },
  ];
  const trn: Record<string, { id: string }> = {};
  for (const spec of trainingSpecs) {
    const existing = await prisma.training.findFirst({ where: { organizationId: org.id, name: spec.name } });
    trn[spec.name] = existing ?? await prisma.training.create({ data: { organizationId: org.id, ...spec } });
  }
  if ((await prisma.userTraining.count({ where: { training: { organizationId: org.id } } })) === 0) {
    await prisma.userTraining.createMany({
      data: [
        { trainingId: trn['Combate a Incêndio'].id, userId: carlosUser.id, completedDate: new Date('2025-06-15'), expiryDate: new Date('2026-08-20') },
        { trainingId: trn['Combate a Incêndio'].id, userId: joaoUser.id, completedDate: new Date('2025-06-15'), expiryDate: new Date('2026-08-20') },
        { trainingId: trn['Primeiros Socorros'].id, userId: carlosUser.id, completedDate: new Date('2025-01-10'), expiryDate: new Date('2027-01-10') },
        { trainingId: trn['Evacuação de Emergência'].id, userId: carlosUser.id, completedDate: new Date('2025-12-01'), expiryDate: new Date('2026-07-20') },
      ],
    });
  }

  const epiSpecs = [
    { terminalId: t.t1, name: 'Capacete de Segurança', description: 'Capacete com aba frontal para proteção contra impactos', epiType: 'proteção_cabeça' },
    { terminalId: t.t1, name: 'Luvas Nitrílicas', description: 'Luvas de proteção química em nitrila', epiType: 'proteção_mãos', expiryDate: new Date('2026-09-15') },
    { terminalId: t.t2, name: 'Respirador PFF2', description: 'Máscara de proteção respiratória PFF2', epiType: 'proteção_respiratória', expiryDate: new Date('2026-05-01') },
    { terminalId: t.t1, name: 'Óculos de Proteção', description: 'Óculos ampla visão contra respingos', epiType: 'proteção_ocular' },
    { terminalId: t.t2, name: 'Roupa de Proteção Química', description: 'Macacão de proteção contra agentes químicos', epiType: 'proteção_corpo', expiryDate: new Date('2026-12-01') },
  ];
  const epiRec: Record<string, { id: string }> = {};
  for (const spec of epiSpecs) {
    const existing = await prisma.epi.findFirst({ where: { organizationId: org.id, name: spec.name } });
    epiRec[spec.name] = existing ?? await prisma.epi.create({ data: { organizationId: org.id, ...spec } });
  }
  if ((await prisma.userEpi.count({ where: { epi: { organizationId: org.id } } })) === 0) {
    await prisma.userEpi.createMany({
      data: [
        { epiId: epiRec['Capacete de Segurança'].id, userId: carlosUser.id, deliveryDate: new Date('2025-03-01'), responsible: 'Coordenador SST', usageStatus: 'em_uso' },
        { epiId: epiRec['Capacete de Segurança'].id, userId: joaoUser.id, deliveryDate: new Date('2025-04-10'), responsible: 'Supervisor Área', usageStatus: 'entregue' },
        { epiId: epiRec['Luvas Nitrílicas'].id, userId: carlosUser.id, deliveryDate: new Date('2025-09-15'), expiryDate: new Date('2026-03-15'), responsible: 'Coordenador SST', observations: 'Tamanho M', usageStatus: 'vencido' },
        { epiId: epiRec['Respirador PFF2'].id, userId: pedroUser.id, deliveryDate: new Date('2025-11-01'), expiryDate: new Date('2026-05-01'), responsible: 'Coordenador SST', usageStatus: 'em_uso' },
      ],
    });
  }

  const complianceSpecs = [
    { terminalId: t.t1, name: 'Inspeção de extintores', responsible: 'Coordenador SST', status: 'conforme', expiryDate: new Date('2026-08-01'), notes: 'Última inspeção realizada em Jan/2026', area: 'Pátio de contêineres', verificationDate: new Date('2026-01-15') },
    { terminalId: t.t2, name: 'Licença ambiental', responsible: 'Gerência Ambiental', status: 'atencao', expiryDate: new Date('2026-05-15'), notes: 'Renovação em andamento', area: 'Administração', verificationDate: new Date('2026-03-01') },
    { terminalId: t.t1, name: 'Certificação NR-29', responsible: 'Supervisor Portuário', status: 'nao_conforme', expiryDate: new Date('2026-01-10'), userId: carlosUser.id, notes: 'Aguardando agendamento', area: 'Berço 101' },
  ];
  for (const spec of complianceSpecs) {
    const existing = await prisma.complianceItem.findFirst({ where: { organizationId: org.id, name: spec.name } });
    if (!existing) {
      await prisma.complianceItem.create({ data: { organizationId: org.id, ...spec } });
    }
  }
  console.log(`✅ 5b: ${trainingSpecs.length} treinamentos · ${epiSpecs.length} EPIs · ${complianceSpecs.length} itens de conformidade`);

  // ─── Padrão de "Tipos de Ocorrência": usuário não-admin vê TODOS por padrão ──
  // (vazio = não vê nenhuma). Idempotente — só toca os que estão vazios.
  const OCC_TYPES = ['Princípio de incêndio', 'Vazamento', 'Emergência', 'Explosão', 'Queda de carga', 'Acidente de trabalho', 'Contaminação ambiental', 'Outros'];
  await prisma.user.updateMany({
    where: { organizationId: org.id, role: { not: 'admin' }, allowedOccurrenceTypes: { isEmpty: true } },
    data: { allowedOccurrenceTypes: OCC_TYPES },
  });

  // ─── Sample Alerts (idempotente por título) ────────────────────────────────
  const alertSpecs = [
    { terminalId: terminal1.id, occurrenceId: occ1.id, title: 'Incêndio detectado — Correia C-07', message: 'Sistema de detecção automática acionado. Temperatura acima de 80°C na correia C-07.', type: AlertType.SAFETY, severity: AlertSeverity.CRITICAL, status: AlertStatus.ACTIVE, source: 'sensor_fire_c07' },
    { terminalId: terminal1.id, title: 'SLA em risco — INC-0001', message: 'Ocorrência INC-0001 com SLA vencendo em menos de 2 horas.', type: AlertType.OPERATIONAL, severity: AlertSeverity.HIGH, status: AlertStatus.ACTIVE, source: 'sla_monitor' },
    { terminalId: terminal2.id, title: 'Manutenção preventiva vencida — Guindaste G-03', message: 'Guindaste G-03 com manutenção preventiva vencida há 5 dias.', type: AlertType.OPERATIONAL, severity: AlertSeverity.MEDIUM, status: AlertStatus.ACTIVE, source: 'maintenance_scheduler' },
  ];
  for (const a of alertSpecs) {
    const exists = await prisma.alert.findFirst({ where: { terminalId: a.terminalId, title: a.title } });
    if (!exists) await prisma.alert.create({ data: a });
  }
  console.log(`✅ Alertas de exemplo: ${alertSpecs.length}`);

  // ─── Safety Items (idempotente por título) ─────────────────────────────────
  const safetySpecs = [
    { terminalId: terminal1.id, assignedToId: pedroUser.id, type: SafetyItemType.EPI, title: 'Renovação de EPIs — Brigada de Incêndio', description: 'Capacetes, luvas e roupas de aproximação com validade vencida.', status: SafetyItemStatus.PENDING, dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    { terminalId: terminal1.id, assignedToId: carlosUser.id, type: SafetyItemType.TRAINING, title: 'Treinamento de combate a incêndio — Turma B', description: 'Reciclagem anual obrigatória para operadores do Terminal Norte.', status: SafetyItemStatus.IN_PROGRESS, dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) },
    { terminalId: terminal1.id, type: SafetyItemType.INSPECTION, title: 'Inspeção mensal — Extintores Pátio 1 e 2', description: 'Verificação de carga, validade e acessibilidade dos extintores.', status: SafetyItemStatus.OVERDUE, dueDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
  ];
  for (const s of safetySpecs) {
    const exists = await prisma.safetyItem.findFirst({ where: { terminalId: s.terminalId, title: s.title } });
    if (!exists) await prisma.safetyItem.create({ data: s });
  }
  console.log(`✅ Itens de segurança: ${safetySpecs.length}`);

  // ─── Knowledge Base (idempotente por título) ───────────────────────────────
  const knowledgeSpecs = [
    { authorId: adminUser.id, type: KnowledgeEntryType.PROCEDURE, title: 'Procedimento de Combate a Incêndio em Correias Transportadoras', content: `## Procedimento PAE-001\n\n### Ações Imediatas\n1. Acionar alarme de incêndio\n2. Ligar para brigada: ramal 190\n3. Desligar correia afetada\n4. Não usar água em equipamentos elétricos`, tags: ['incêndio', 'correia', 'procedimento', 'brigada'], isPublished: true },
    { authorId: carlosUser.id, type: KnowledgeEntryType.LESSON_LEARNED, title: 'Lição Aprendida: Insolação em Operações de Verão', content: `## Contexto\nDurante o verão de 2025, registramos 3 casos de insolação em operadores de pátio.\n\n## Ações Corretivas\n1. Instalação de 4 bebedouros no pátio 2\n2. Pausas obrigatórias de 10min a cada 2h`, tags: ['insolação', 'verão', 'saúde', 'lição aprendida'], isPublished: true },
  ];
  for (const k of knowledgeSpecs) {
    const exists = await prisma.knowledgeEntry.findFirst({ where: { title: k.title } });
    if (!exists) await prisma.knowledgeEntry.create({ data: k });
  }
  console.log(`✅ Base de conhecimento: ${knowledgeSpecs.length} entradas`);

  // ─── War Room (idempotente — uma War Room por ocorrência) ───────────────────
  let warRoom = await prisma.warRoom.findFirst({ where: { occurrenceId: occ1.id } });
  if (!warRoom) {
    warRoom = await prisma.warRoom.create({
      data: {
        occurrenceId: occ1.id,
        title: `War Room — INC-0001 (Incêndio C-07)`,
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
  }
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

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AiAgentType, AiInsightSeverity } from '@prisma/client';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

@Injectable()
export class AiCommandService {
  private readonly logger = new Logger(AiCommandService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async chat(dto: { message: string; occurrenceId?: string; context?: string }, user: any) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    const model = this.configService.get<string>('OPENAI_MODEL', 'gpt-4o');

    // Build context from occurrence if provided
    let occurrenceContext = '';
    if (dto.occurrenceId) {
      const occurrence = await this.prisma.occurrence.findUnique({
        where: { id: dto.occurrenceId },
        include: {
          timeline: { orderBy: { createdAt: 'desc' }, take: 5 },
          alerts: { where: { status: 'ACTIVE' }, take: 3 },
        },
      });

      if (occurrence) {
        occurrenceContext = `
OCORRÊNCIA ATIVA:
- Código: ${occurrence.code}
- Título: ${occurrence.title}
- Severidade: ${occurrence.severity}
- Status: ${occurrence.status}
- Criticidade: ${occurrence.criticality}
- Localização: ${occurrence.location || 'N/A'}
- Criada em: ${occurrence.createdAt.toISOString()}
- Alertas ativos: ${occurrence.alerts.length}
`;
      }
    }

    const systemPrompt = `Você é o M1 PAE AI Command, um assistente especializado em gestão de emergências e operações de campo para o M1 PAE Hub.

Seu papel é auxiliar operadores e gestores com:
- Análise de ocorrências em andamento
- Recomendações de ações imediatas
- Análise de causa raiz (RCA)
- Gestão de SLA e priorização
- Procedimentos de segurança
- Coordenação de War Room

Usuário atual: ${user.name} (${user.role})
Terminal: ${user.terminalId || 'N/A'}
${occurrenceContext}

Seja direto, objetivo e use linguagem técnica apropriada para operações de emergência. 
Quando relevante, cite procedimentos específicos e escalas de prioridade.`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: dto.message },
    ];

    if (!apiKey) {
      // Fallback when no API key configured
      this.logger.warn('OpenAI API key not configured, returning placeholder response');
      return {
        message: `[AI Command] Recebido: "${dto.message}". Configure OPENAI_API_KEY para respostas reais.`,
        model: 'mock',
        tokens: 0,
      };
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: this.configService.get<number>('OPENAI_MAX_TOKENS', 2048),
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} ${error}`);
      }

      const data = await response.json() as any;
      const aiMessage = data.choices[0].message.content;

      // Save insight to DB if occurrence context
      if (dto.occurrenceId) {
        await this.prisma.agentInsight.create({
          data: {
            userId: user.id,
            occurrenceId: dto.occurrenceId,
            agentType: AiAgentType.RECOMMENDATION,
            insightType: 'ai_command_response',
            severity: AiInsightSeverity.INFO,
            title: `AI Command: ${dto.message.substring(0, 80)}`,
            content: aiMessage,
            metadata: { userMessage: dto.message, model },
          },
        });
      }

      return {
        message: aiMessage,
        model: data.model,
        tokens: data.usage?.total_tokens ?? 0,
      };
    } catch (error) {
      this.logger.error(`AI Command error: ${error.message}`);
      throw error;
    }
  }

  async getInsights(query: { occurrenceId?: string; agentType?: AiAgentType; page?: number; limit?: number }, user: any) {
    const { occurrenceId, agentType, page = 1, limit = 20 } = query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {};
    if (occurrenceId) where.occurrenceId = occurrenceId;
    if (agentType) where.agentType = agentType;

    const [items, total] = await Promise.all([
      this.prisma.agentInsight.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true } } },
      }),
      this.prisma.agentInsight.count({ where }),
    ]);

    return { data: items, meta: { total, page: Number(page), limit: Number(limit) } };
  }

  async getKnowledge(query: { type?: string; search?: string; page?: number; limit?: number }) {
    const { type, search, page = 1, limit = 20 } = query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = { isPublished: true };
    if (type) where.type = type;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.knowledgeEntry.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: { author: { select: { id: true, name: true } } },
      }),
      this.prisma.knowledgeEntry.count({ where }),
    ]);

    return { data: items, meta: { total, page: Number(page), limit: Number(limit) } };
  }
}

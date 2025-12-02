import { BadRequestException, Injectable, Logger, NotFoundException, Inject, forwardRef, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { URL } from 'url';
import { LLMRouterService } from '@ai-visibility/shared';
import { 
  EntityExtractorService, 
  CompetitorDetectorService, 
  DiagnosticInsightsService,
  // Premium services
  IndustryDetectorService,
  PremiumBusinessSummaryService,
  EvidenceBackedPromptGeneratorService,
  PremiumCompetitorDetectorService,
  EvidenceBackedShareOfVoiceService,
  PremiumCitationService,
  PremiumGEOScoreService,
  EvidenceCollectorService,
  EEATCalculatorService,
  GEOIntelligenceOrchestrator,
  // Types
  PremiumResponse,
  PremiumBusinessSummary,
  PremiumPrompt,
  PremiumCompetitor,
  PremiumShareOfVoice,
  PremiumCitation,
  PremiumGEOScore,
} from '@ai-visibility/geo';
import { IntentClustererService } from '@ai-visibility/prompts';
import { PrismaService } from '../database/prisma.service';
import { DemoCompetitorsRequestDto, DemoPromptsRequestDto, DemoRunRequestDto, DemoSummaryRequestDto } from './dto/demo.dto';

type DemoRunRecord = {
  id: string;
  workspaceId: string | null;
  domain: string | null;
  brand: string | null;
  summary: string | null;
  competitors: string[] | null;
  analysisJobsTotal: number | null;
  analysisJobsCompleted: number | null;
  analysisJobsFailed: number | null;
  status: string;
  progress: number;
  updatedAt: Date;
};

type DemoEntityInfo = {
  key: string;
  label: string;
  domain?: string | null;
};

type DemoRunMetrics = {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  successRate: number;
  failRate: number;
  totalCostCents: number;
  avgCostCents: number;
};

type DemoShareOfVoiceRow = {
  entityKey: string;
  entity: string;
  mentions: number;
  positiveMentions: number;
  neutralMentions: number;
  negativeMentions: number;
  sharePercentage: number;
};

type DemoEnginePerformanceRow = {
  engine: string;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  successRate: number;
  totalCostCents: number;
};

type DemoCitationStat = {
  domain: string;
  references: number;
  sharePercentage: number;
};

type DemoRecommendationItem = {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  category: 'visibility' | 'sentiment' | 'citations' | 'execution' | 'coverage';
  relatedMetric?: string;
  actionItems: string[];
};

type DemoAnalysisData = {
  demoRun: DemoRunRecord;
  brand: DemoEntityInfo;
  brandDomain?: string | null;
  competitors: DemoEntityInfo[];
  metrics: DemoRunMetrics;
  shareOfVoice: DemoShareOfVoiceRow[];
  enginePerformance: DemoEnginePerformanceRow[];
  citations: DemoCitationStat[];
  generatedAt: Date;
};

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);
  private readonly statusOrder: Record<string, number> = {
    pending: 0,
    summary_ready: 1,
    prompts_ready: 2,
    competitors_ready: 3,
    analysis_running: 4,
    analysis_complete: 5,
    analysis_failed: 5,
  };

  private readonly engineEnvRequirements: Record<string, string[]> = {
    PERPLEXITY: ['PERPLEXITY_API_KEY'],
    BRAVE: ['BRAVE_API_KEY'],
    AIO: ['AIO_ENABLED'],
    OPENAI: ['OPENAI_API_KEY'],
    ANTHROPIC: ['ANTHROPIC_API_KEY'],
    GEMINI: ['GOOGLE_AI_API_KEY'],
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmRouter: LLMRouterService,
    private readonly entityExtractor: EntityExtractorService,
    private readonly competitorDetector: CompetitorDetectorService,
    private readonly intentClusterer: IntentClustererService,
    private readonly diagnosticInsights: DiagnosticInsightsService,
    // Premium services
    private readonly industryDetector: IndustryDetectorService,
    private readonly premiumSummary: PremiumBusinessSummaryService,
    private readonly evidenceBackedPrompts: EvidenceBackedPromptGeneratorService,
    private readonly premiumCompetitors: PremiumCompetitorDetectorService,
    private readonly evidenceBackedSOV: EvidenceBackedShareOfVoiceService,
    private readonly premiumCitations: PremiumCitationService,
    private readonly premiumGEOScore: PremiumGEOScoreService,
    private readonly evidenceCollector: EvidenceCollectorService,
    private readonly eeatCalculator: EEATCalculatorService,
    @InjectQueue('runPrompt') private readonly runPromptQueue: Queue,
    // Inject orchestrator for full intelligence endpoint (optional via forwardRef)
    @Inject(forwardRef(() => GEOIntelligenceOrchestrator))
    @Optional()
    private readonly orchestrator?: GEOIntelligenceOrchestrator,
  ) {}

  private readonly defaultEngines = ['PERPLEXITY', 'BRAVE', 'AIO'];

  async prepareSummary(payload: DemoSummaryRequestDto): Promise<{ ok: boolean; data: any }> {
    const normalized = this.normalizeDomain(payload.domain);
    const brand = (payload.brand ?? this.deriveBrandFromHost(normalized.host)).trim();
    const workspaceId = this.generateWorkspaceId(normalized.host);

    await this.ensureWorkspace(workspaceId, brand);

    const summaryResult = await this.generateSummary(workspaceId, normalized.href, brand, payload.summaryOverride);
    await this.upsertWorkspaceProfile(workspaceId, brand, summaryResult.summary);

    const demoRun = await this.createDemoRun({
      workspaceId,
      domain: normalized.href,
      brand,
      summary: summaryResult.summary,
      status: 'summary_ready',
      progress: 10,
    });

    return {
      ok: true,
      data: {
        demoRunId: demoRun.id,
        workspaceId,
        domain: normalized.href,
        brand,
        summary: summaryResult.summary,
        summarySource: summaryResult.source,
        entityData: summaryResult.entityData, // Include comprehensive entity data
      },
    };
  }

  async preparePrompts(payload: DemoPromptsRequestDto): Promise<{ ok: boolean; data: any }> {
    const demoRun = await this.loadDemoRun(payload.demoRunId);

    if (!demoRun.workspaceId) {
      throw new BadRequestException('Demo run is missing workspace context. Re-run the summary step.');
    }

    this.ensureStatusAtLeast(demoRun, 'summary_ready', 'Complete the summary step before generating prompts.');

    const seedPrompts = this.normalizePromptList(payload.seedPrompts, 'seed');
    if (seedPrompts.length === 0) {
      throw new BadRequestException('Provide at least one seed prompt.');
    }

    let finalPrompts: Array<{ text: string; source: 'seed' | 'llm' | 'user' }> = [];

    const confirmed = this.normalizePromptList(payload.confirmedPrompts ?? [], 'user');
    if (confirmed.length > 0) {
      finalPrompts = this.mergePromptSources(confirmed);
    } else {
      const generated = await this.generatePromptSuggestions(
        demoRun.workspaceId,
        demoRun.brand ?? 'Brand',
        demoRun.summary ?? '',
        seedPrompts.map(p => p.text),
        demoRun.domain
      );
      finalPrompts = this.mergePromptSources([...seedPrompts, ...generated]);
    }

    if (finalPrompts.length === 0) {
      throw new BadRequestException('Unable to determine prompts. Try providing confirmedPrompts.');
    }

    await this.replaceWorkspacePrompts(demoRun.workspaceId, finalPrompts);
    await this.updateDemoRun(demoRun.id, {
      status: 'prompts_ready',
      progress: Math.max(40, demoRun.progress ?? 0),
    });

    return {
      ok: true,
      data: {
        demoRunId: demoRun.id,
        workspaceId: demoRun.workspaceId,
        prompts: finalPrompts,
        total: finalPrompts.length,
      },
    };
  }

  async prepareCompetitors(payload: DemoCompetitorsRequestDto): Promise<{ ok: boolean; data: any }> {
    const demoRun = await this.loadDemoRun(payload.demoRunId);

    if (!demoRun.workspaceId) {
      throw new BadRequestException('Demo run is missing workspace context. Re-run the summary step.');
    }

    this.ensureStatusAtLeast(demoRun, 'prompts_ready', 'Complete the prompt step before selecting competitors.');

    const promptRecords = await this.getDemoPrompts(demoRun.workspaceId);
    if (promptRecords.length === 0) {
      throw new BadRequestException('Prompts are not ready. Complete the prompt step first.');
    }

    const promptTexts = promptRecords.map((record) => record.text);

    const confirmed = this.normalizeDomainList(payload.competitorDomains ?? []);
    let finalCompetitors: string[] = confirmed;
    let suggestedCompetitors: string[] = [];

    if (finalCompetitors.length === 0) {
      suggestedCompetitors = await this.generateCompetitorSuggestions(
        demoRun.workspaceId,
        demoRun.brand ?? 'Brand',
        demoRun.summary ?? '',
        promptTexts,
        demoRun.domain,
      );
      finalCompetitors = suggestedCompetitors;
    } else {
      suggestedCompetitors = finalCompetitors;
    }

    if (finalCompetitors.length === 0) {
      throw new BadRequestException('Unable to determine competitor list. Provide competitorDomains.');
    }

    await this.updateDemoRun(demoRun.id, {
      status: 'competitors_ready',
      progress: Math.max(60, demoRun.progress ?? 0),
      competitors: finalCompetitors,
    });

    return {
      ok: true,
      data: {
        demoRunId: demoRun.id,
        workspaceId: demoRun.workspaceId,
        finalCompetitors,
        suggestedCompetitors,
      },
    };
  }

  async runDemo(payload: DemoRunRequestDto): Promise<{ ok: boolean; data: any }> {
    const demoRun = await this.loadDemoRun(payload.demoRunId);

    if (!demoRun.workspaceId) {
      throw new BadRequestException('Demo run is missing workspace context. Re-run the summary step.');
    }

    this.ensureStatusAtLeast(demoRun, 'competitors_ready', 'Complete the competitor step before running the analysis.');

    const promptRecords = await this.getDemoPrompts(demoRun.workspaceId);
    if (promptRecords.length === 0) {
      throw new BadRequestException('Prompts are not ready. Complete the prompt step first.');
    }

    const engines = this.normalizeEngines(payload.engines);
    this.validateDemoConfiguration(engines);
    await this.ensureEngines(demoRun.workspaceId, engines);

    const jobs = promptRecords.flatMap((prompt) =>
      engines.map((engine) => {
        const idempotencyKey = `${demoRun.workspaceId}:${prompt.id}:${engine}`;
        return {
          name: 'runPrompt',
          data: {
            workspaceId: demoRun.workspaceId!,
            promptId: prompt.id,
            engineKey: engine,
            idempotencyKey,
            demoRunId: demoRun.id,
            userId: 'demo-user',
          },
          opts: {
            removeOnComplete: { count: 200 },
            removeOnFail: { count: 50 },
          },
        };
      })
    );

    if (jobs.length === 0) {
      throw new BadRequestException('No analysis jobs were created. Check prompts and engines.');
    }

    await this.runPromptQueue.addBulk(jobs);

    await this.updateDemoRun(demoRun.id, {
      status: 'analysis_running',
      progress: Math.max(80, demoRun.progress ?? 0),
      analysisJobsTotal: jobs.length,
      analysisJobsCompleted: 0,
      analysisJobsFailed: 0,
    });

    return {
      ok: true,
      data: {
        demoRunId: demoRun.id,
        workspaceId: demoRun.workspaceId,
        engines,
        queuedJobs: jobs.length,
      },
    };
  }

  async getStatus(demoRunId: string): Promise<{ ok: boolean; data: any }> {
    const demoRun = await this.loadDemoRun(demoRunId);

    const total = demoRun.analysisJobsTotal ?? 0;
    const completed = demoRun.analysisJobsCompleted ?? 0;
    const failed = demoRun.analysisJobsFailed ?? 0;
    const finished = completed + failed;
    const remaining = total > finished ? total - finished : 0;

    const progress = this.computeProgress(demoRun.progress, total, finished);

    // Get engine visibility - which engines have successful runs with answers
    // Changed: No longer requires mentions - just needs successful runs with answers
    let engines: Array<{ key: string; visible: boolean }> = [];
    if (demoRun.workspaceId && completed > 0) {
      try {
        const engineRows = await this.prisma.$queryRaw<{ engineKey: string }>(
          `SELECT DISTINCT e."key" AS "engineKey"
           FROM "prompt_runs" pr
           JOIN "prompts" p ON p.id = pr."promptId"
           JOIN "engines" e ON e.id = pr."engineId"
           JOIN "answers" a ON a."promptRunId" = pr.id
           WHERE pr."workspaceId" = $1
             AND pr."status" = 'SUCCESS'
             AND 'demo' = ANY(p."tags")
           GROUP BY e."key"`,
          [demoRun.workspaceId],
        );

        const enginesWithAnswers = new Set(engineRows.map((r) => r.engineKey));
        engines = this.defaultEngines.map((engineKey) => ({
          key: engineKey,
          visible: enginesWithAnswers.has(engineKey),
        }));
      } catch (error) {
        this.logger.warn(`Failed to get engine visibility for demoRun ${demoRunId}: ${error instanceof Error ? error.message : String(error)}`);
        // Fallback to all false if query fails
        engines = this.defaultEngines.map((engineKey) => ({
          key: engineKey,
          visible: false,
        }));
      }
    } else {
      // No completed jobs yet, all engines are not visible
      engines = this.defaultEngines.map((engineKey) => ({
        key: engineKey,
        visible: false,
      }));
    }

    return {
      ok: true,
      data: {
        demoRunId: demoRun.id,
        workspaceId: demoRun.workspaceId,
        status: demoRun.status,
        progress,
        totalJobs: total,
        completedJobs: completed,
        failedJobs: failed,
        remainingJobs: remaining,
        engines, // Include engine visibility
        updatedAt: demoRun.updatedAt.toISOString(),
      },
    };
  }

  async getInsights(demoRunId: string): Promise<{ ok: boolean; data: any }> {
    const demoRun = await this.loadDemoRun(demoRunId);

    if (!demoRun.workspaceId) {
      throw new BadRequestException('Demo run is missing workspace context. Re-run the summary step.');
    }

    this.ensureStatusAtLeast(
      demoRun,
      'analysis_complete',
      `Insights are only available after analysis completes (current status: ${demoRun.status}).`,
    );

    const analysis = await this.collectAnalysisData(demoRun);
    const insightHighlights = await this.buildInsightHighlights(
      analysis,
      demoRun.workspaceId!,
      analysis.brand.label,
      demoRun.domain,
      analysis.competitors.map(c => c.label)
    );

    return {
      ok: true,
      data: {
        demoRunId: analysis.demoRun.id,
        workspaceId: analysis.demoRun.workspaceId,
        status: analysis.demoRun.status,
        progress: analysis.demoRun.progress,
        totals: analysis.metrics,
        shareOfVoice: analysis.shareOfVoice.map(({ entity, mentions, positiveMentions, neutralMentions, negativeMentions, sharePercentage }) => ({
          entity,
          mentions,
          positiveMentions,
          neutralMentions,
          negativeMentions,
          sharePercentage,
        })),
        enginePerformance: analysis.enginePerformance.map(({ engine, totalRuns, successfulRuns, failedRuns, successRate, totalCostCents }) => ({
          engine,
          totalRuns,
          successfulRuns,
          failedRuns,
          successRate,
          totalCostCents,
        })),
        topCitations: analysis.citations,
        insightHighlights,
        generatedAt: analysis.generatedAt.toISOString(),
      },
    };
  }

  async getRecommendations(demoRunId: string): Promise<{ ok: boolean; data: any }> {
    const demoRun = await this.loadDemoRun(demoRunId);

    if (!demoRun.workspaceId) {
      throw new BadRequestException('Demo run is missing workspace context. Re-run the summary step.');
    }

    this.ensureStatusAtLeast(
      demoRun,
      'analysis_complete',
      `Recommendations are only available after analysis completes (current status: ${demoRun.status}).`,
    );

    const analysis = await this.collectAnalysisData(demoRun);
    const recommendations = await this.generateRecommendations(
      analysis,
      demoRun.workspaceId!,
      analysis.brand.label,
      demoRun.domain,
      analysis.competitors.map(c => c.label)
    );

    return {
      ok: true,
      data: {
        demoRunId: analysis.demoRun.id,
        workspaceId: analysis.demoRun.workspaceId,
        status: analysis.demoRun.status,
        progress: analysis.demoRun.progress,
        recommendations,
        shareOfVoice: analysis.shareOfVoice.map(({ entity, mentions, positiveMentions, neutralMentions, negativeMentions, sharePercentage }) => ({
          entity,
          mentions,
          positiveMentions,
          neutralMentions,
          negativeMentions,
          sharePercentage,
        })),
        enginePerformance: analysis.enginePerformance.map(({ engine, totalRuns, successfulRuns, failedRuns, successRate, totalCostCents }) => ({
          engine,
          totalRuns,
          successfulRuns,
          failedRuns,
          successRate,
          totalCostCents,
        })),
        generatedAt: analysis.generatedAt.toISOString(),
      },
    };
  }

  private async collectAnalysisData(demoRun: DemoRunRecord): Promise<DemoAnalysisData> {
    if (!demoRun.workspaceId) {
      throw new BadRequestException('Demo run is missing workspace context. Re-run the summary step.');
    }

    const workspaceId = demoRun.workspaceId;
    const normalizedDomain = demoRun.domain ? this.normalizeDomain(demoRun.domain) : { href: '', host: '' };
    const brandDomain = normalizedDomain.host || null;
    const brandLabelCandidate = (demoRun.brand ?? (brandDomain ? this.deriveBrandFromHost(brandDomain) : '')).trim();
    const brandLabel = brandLabelCandidate || 'Demo Brand';
    const brand: DemoEntityInfo = {
      key: this.normalizeEntityKey(brandLabel),
      label: brandLabel,
      domain: brandDomain,
    };

    const competitors: DemoEntityInfo[] = (demoRun.competitors ?? []).map((competitor) => {
      const normalized = this.normalizeDomain(competitor);
      const derivedLabel = this.deriveBrandFromHost(normalized.host);
      const label = this.formatEntityLabel(derivedLabel || normalized.host || competitor || 'Competitor');
      return {
        key: this.normalizeEntityKey(label),
        label,
        domain: normalized.host || competitor || null,
      };
    });

    const [runMetricsRow] = await this.prisma.$queryRaw<{
      totalRuns: number;
      completedRuns: number;
      failedRuns: number;
      totalCostCents: number;
    }>(
      `SELECT
         COUNT(*)::int AS "totalRuns",
         SUM(CASE WHEN pr."status" = 'SUCCESS' THEN 1 ELSE 0 END)::int AS "completedRuns",
         SUM(CASE WHEN pr."status" = 'FAILED' THEN 1 ELSE 0 END)::int AS "failedRuns",
         COALESCE(SUM(pr."costCents"), 0)::int AS "totalCostCents"
       FROM "prompt_runs" pr
       JOIN "prompts" p ON p.id = pr."promptId"
       WHERE pr."workspaceId" = $1
         AND 'demo' = ANY(p."tags")`,
      [workspaceId],
    );

    const totalRuns = Number(runMetricsRow?.totalRuns ?? 0);
    const completedRuns = Number(runMetricsRow?.completedRuns ?? 0);
    const failedRuns = Number(runMetricsRow?.failedRuns ?? 0);
    const totalCostCents = Number(runMetricsRow?.totalCostCents ?? 0);
    const successRate = totalRuns > 0 ? this.toPercentage(completedRuns / totalRuns) : 0;
    const failRate = totalRuns > 0 ? this.toPercentage(failedRuns / totalRuns) : 0;
    const avgCostCents = totalRuns > 0 ? Math.round(totalCostCents / totalRuns) : 0;

    const metrics: DemoRunMetrics = {
      totalRuns,
      completedRuns,
      failedRuns,
      successRate,
      failRate,
      totalCostCents,
      avgCostCents,
    };

    const mentionRows = await this.prisma.$queryRaw<{
      entityKey: string | null;
      entityLabel: string | null;
      mentions: number;
      positiveMentions: number;
      neutralMentions: number;
      negativeMentions: number;
    }>(
      `SELECT
         LOWER(m."brand") AS "entityKey",
         MIN(m."brand") AS "entityLabel",
         COUNT(*)::int AS "mentions",
         SUM(CASE WHEN m."sentiment" = 'POS' THEN 1 ELSE 0 END)::int AS "positiveMentions",
         SUM(CASE WHEN m."sentiment" = 'NEU' THEN 1 ELSE 0 END)::int AS "neutralMentions",
         SUM(CASE WHEN m."sentiment" = 'NEG' THEN 1 ELSE 0 END)::int AS "negativeMentions"
       FROM "mentions" m
       JOIN "answers" a ON a.id = m."answerId"
       JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
       JOIN "prompts" p ON p.id = pr."promptId"
       WHERE pr."workspaceId" = $1
         AND 'demo' = ANY(p."tags")
       GROUP BY LOWER(m."brand")
       ORDER BY COUNT(*) DESC`,
      [workspaceId],
    );

    const mentionStatsMap = new Map<string, DemoShareOfVoiceRow>();

    for (const row of mentionRows) {
      const rawKey = row.entityKey || row.entityLabel || 'Other';
      const key = this.normalizeEntityKey(rawKey);
      const isOther = !row.entityKey && !row.entityLabel;
      const label = isOther ? 'Other' : this.formatEntityLabel(row.entityLabel || rawKey);

      const mentions = Number(row.mentions ?? 0);
      const positiveMentions = Number(row.positiveMentions ?? 0);
      const neutralMentions = Number(row.neutralMentions ?? 0);
      const negativeMentions = Number(row.negativeMentions ?? 0);

      const existing = mentionStatsMap.get(key);
      if (existing) {
        existing.mentions += mentions;
        existing.positiveMentions += positiveMentions;
        existing.neutralMentions += neutralMentions;
        existing.negativeMentions += negativeMentions;
      } else {
        mentionStatsMap.set(key, {
          entityKey: key,
          entity: label,
          mentions,
          positiveMentions,
          neutralMentions,
          negativeMentions,
          sharePercentage: 0,
        });
      }
    }

    const ensureEntityRow = (info: DemoEntityInfo) => {
      if (!info.key) return;
      if (!mentionStatsMap.has(info.key)) {
        mentionStatsMap.set(info.key, {
          entityKey: info.key,
          entity: info.label,
          mentions: 0,
          positiveMentions: 0,
          neutralMentions: 0,
          negativeMentions: 0,
          sharePercentage: 0,
        });
      }
    };

    ensureEntityRow(brand);
    competitors.forEach(ensureEntityRow);

    const shareOfVoiceArray = Array.from(mentionStatsMap.values()).sort((a, b) => b.mentions - a.mentions);
    const totalMentions = shareOfVoiceArray.reduce((sum, row) => sum + row.mentions, 0);
    const shareOfVoice: DemoShareOfVoiceRow[] = shareOfVoiceArray.map((row) => ({
      ...row,
      sharePercentage: totalMentions > 0 ? this.toPercentage(row.mentions / totalMentions) : 0,
    }));

    const citationRows = await this.prisma.$queryRaw<{
      domain: string | null;
      references: number;
    }>(
      `SELECT
         LOWER(c."domain") AS "domain",
         COUNT(*)::int AS "references"
       FROM "citations" c
       JOIN "answers" a ON a.id = c."answerId"
       JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
       JOIN "prompts" p ON p.id = pr."promptId"
       WHERE pr."workspaceId" = $1
         AND 'demo' = ANY(p."tags")
       GROUP BY LOWER(c."domain")
       ORDER BY COUNT(*) DESC
       LIMIT 10`,
      [workspaceId],
    );

    const totalCitations = citationRows.reduce((sum, row) => sum + Number(row.references ?? 0), 0);
    const citations: DemoCitationStat[] = citationRows
      .filter((row) => (row.domain || '').trim().length > 0)
      .map((row) => {
        const domain = (row.domain || '').trim();
        const references = Number(row.references ?? 0);
        return {
          domain,
          references,
          sharePercentage: totalCitations > 0 ? this.toPercentage(references / totalCitations) : 0,
        };
      });

    const engineRows = await this.prisma.$queryRaw<{
      engine: string | null;
      totalRuns: number;
      successfulRuns: number;
      totalCostCents: number;
    }>(
      `SELECT
         e."key" AS "engine",
         COUNT(*)::int AS "totalRuns",
         SUM(CASE WHEN pr."status" = 'SUCCESS' THEN 1 ELSE 0 END)::int AS "successfulRuns",
         COALESCE(SUM(pr."costCents"), 0)::int AS "totalCostCents"
       FROM "prompt_runs" pr
       JOIN "prompts" p ON p.id = pr."promptId"
       JOIN "engines" e ON e.id = pr."engineId"
       WHERE pr."workspaceId" = $1
         AND 'demo' = ANY(p."tags")
       GROUP BY e."key"
       ORDER BY e."key"`,
      [workspaceId],
    );

    const enginePerformance: DemoEnginePerformanceRow[] = engineRows.map((row) => {
      const engineKey = (row.engine || 'UNKNOWN').toUpperCase();
      const engineTotalRuns = Number(row.totalRuns ?? 0);
      const successfulRuns = Number(row.successfulRuns ?? 0);
      const failedRunsComputed = Math.max(0, engineTotalRuns - successfulRuns);
      const totalEngineCost = Number(row.totalCostCents ?? 0);

      return {
        engine: engineKey,
        totalRuns: engineTotalRuns,
        successfulRuns,
        failedRuns: failedRunsComputed,
        successRate: engineTotalRuns > 0 ? this.toPercentage(successfulRuns / engineTotalRuns) : 0,
        totalCostCents: totalEngineCost,
      };
    });

    return {
      demoRun,
      brand,
      brandDomain,
      competitors,
      metrics,
      shareOfVoice,
      enginePerformance,
      citations,
      generatedAt: new Date(),
    };
  }

  private async buildInsightHighlights(
    analysis: DemoAnalysisData,
    workspaceId: string,
    brandName: string,
    domain?: string | null,
    competitors: string[] = []
  ): Promise<string[]> {
    const highlights: string[] = [];

    try {
      // Use DiagnosticInsightsService for comprehensive, evidence-backed insights
      const diagnosticResult = await this.diagnosticInsights.generateInsights(
        workspaceId,
        brandName,
        domain || undefined,
        competitors
      );

      // Extract top insights from diagnostic service
      const topInsights = diagnosticResult.topIssues.slice(0, 5);
      for (const insight of topInsights) {
        // Format insight as a highlight
        let highlight = insight.title;
        if (insight.description) {
          highlight += `: ${insight.description}`;
        }
        highlights.push(highlight);
      }

      // If we have fewer than 5 insights, supplement with basic analysis
      if (highlights.length < 5) {
        const brandRow = analysis.shareOfVoice.find((row) => row.entityKey === analysis.brand.key);
        const competitorRows = analysis.shareOfVoice
          .filter((row) => row.entityKey !== analysis.brand.key)
          .sort((a, b) => b.sharePercentage - a.sharePercentage);

        const topCompetitor = competitorRows[0];

        if (brandRow) {
          if (topCompetitor && topCompetitor.sharePercentage - brandRow.sharePercentage >= 5) {
            highlights.push(
              `${topCompetitor.entity} leads share of voice by ${(topCompetitor.sharePercentage - brandRow.sharePercentage).toFixed(1)} pts over ${analysis.brand.label}.`,
            );
          } else if (brandRow.sharePercentage >= 40) {
            highlights.push(`${analysis.brand.label} leads share of voice at ${brandRow.sharePercentage.toFixed(1)}%.`);
          } else if (brandRow.sharePercentage > 0) {
            highlights.push(`${analysis.brand.label} holds ${brandRow.sharePercentage.toFixed(1)}% share of voice across demo prompts.`);
          }
        }

        if (analysis.citations.length === 0) {
          highlights.push('No citations captured yet—focus on landing authoritative sources in follow-up runs.');
        } else {
          const citationLeader = analysis.citations[0];
          highlights.push(
            `${citationLeader.domain} contributes the most references (${citationLeader.sharePercentage.toFixed(1)}% of citations).`,
          );
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to generate diagnostic insights, using fallback: ${error instanceof Error ? error.message : String(error)}`);
      
      // Fallback to original logic
      const brandRow = analysis.shareOfVoice.find((row) => row.entityKey === analysis.brand.key);
      if (brandRow && brandRow.sharePercentage > 0) {
        highlights.push(`${analysis.brand.label} holds ${brandRow.sharePercentage.toFixed(1)}% share of voice across demo prompts.`);
      }
      if (analysis.citations.length === 0) {
        highlights.push('No citations captured yet—focus on landing authoritative sources in follow-up runs.');
      }
    }

    const unique = Array.from(new Set(highlights));
    return unique.slice(0, 8); // Return top 8 insights
  }

  private async generateRecommendations(
    analysis: DemoAnalysisData,
    workspaceId: string,
    brandName: string,
    domain?: string | null,
    competitors: string[] = []
  ): Promise<DemoRecommendationItem[]> {
    const recommendations: DemoRecommendationItem[] = [];
    const { metrics, demoRun: demoRunRecord } = analysis;
    
    try {
      // Use DiagnosticInsightsService for evidence-based recommendations
      const diagnosticResult = await this.diagnosticInsights.generateInsights(
        workspaceId,
        brandName,
        domain || undefined,
        competitors
      );

      // Convert diagnostic insights to recommendations
      for (const insight of diagnosticResult.insights.slice(0, 10)) {
        const priorityMap: Record<string, 'high' | 'medium' | 'low'> = {
          critical: 'high',
          high: 'high',
          medium: 'medium',
          low: 'low',
        };

        const categoryMap: Record<string, 'visibility' | 'sentiment' | 'citations' | 'execution' | 'coverage'> = {
          visibility_blocker: 'visibility',
          trust_gap: 'citations',
          schema_gap: 'visibility',
          listing_inconsistency: 'citations',
          reputation_weakness: 'sentiment',
          content_gap: 'citations',
          competitor_advantage: 'visibility',
          hallucination_risk: 'citations',
          missing_fact: 'visibility',
        };

        recommendations.push({
          title: insight.title,
          description: insight.description,
          priority: priorityMap[insight.severity] || 'medium',
          category: categoryMap[insight.type] || 'visibility',
          relatedMetric: this.getRelatedMetric(insight.type),
          actionItems: insight.recommendations.slice(0, 3),
        });
      }
    } catch (error) {
      this.logger.warn(`Failed to generate diagnostic recommendations, using fallback: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Supplement with basic analysis if needed
    const brandRow = analysis.shareOfVoice.find((row) => row.entityKey === analysis.brand.key);
    const competitorRows = analysis.shareOfVoice
      .filter((row) => row.entityKey !== analysis.brand.key)
      .sort((a, b) => b.sharePercentage - a.sharePercentage);
    const topCompetitor = competitorRows[0];

    if (brandRow && topCompetitor && topCompetitor.sharePercentage - brandRow.sharePercentage >= 5) {
      const diff = topCompetitor.sharePercentage - brandRow.sharePercentage;
      recommendations.push({
        title: `Close visibility gap with ${topCompetitor.entity}`,
        description: `${topCompetitor.entity} outpaces ${analysis.brand.label} by ${diff.toFixed(1)} pts in share of voice across demo prompts.`,
        priority: 'high',
        category: 'visibility',
        relatedMetric: 'shareOfVoice',
        actionItems: [
          `Add prompts comparing ${analysis.brand.label} vs ${topCompetitor.entity} on pricing, trust, and feature depth.`,
          `Highlight recent wins and customer proof points where ${analysis.brand.label} beats ${topCompetitor.entity}.`,
        ],
      });
    } else if (brandRow && brandRow.sharePercentage < 35) {
      recommendations.push({
        title: 'Expand brand visibility footprint',
        description: `${analysis.brand.label} captures only ${brandRow.sharePercentage.toFixed(1)}% of share of voice—boost coverage with broader prompt variety.`,
        priority: 'medium',
        category: 'visibility',
        relatedMetric: 'shareOfVoice',
        actionItems: [
          'Spin up prompts covering new use cases, industries, and comparative angles.',
          'Repurpose high-performing prompts with fresh messaging to capture additional impressions.',
        ],
      });
    }

    if (brandRow && brandRow.mentions > 0) {
      const positiveShare = this.toPercentage(brandRow.positiveMentions / brandRow.mentions);
      if (positiveShare < 35) {
        recommendations.push({
          title: 'Elevate positive sentiment signals',
          description: `${analysis.brand.label} positive sentiment is only ${positiveShare.toFixed(1)}%. Reinforce proof points and address objections surfaced in negative snippets.`,
          priority: 'medium',
          category: 'sentiment',
          relatedMetric: 'sentiment',
          actionItems: [
            'Highlight social proof, awards, and customer outcomes in prompt answers.',
            'Draft objection-handling prompts that tackle common negative narratives head-on.',
          ],
        });
      }
    }

    if (analysis.citations.length === 0) {
      recommendations.push({
        title: 'Land authoritative citations',
        description: 'No authoritative sources were captured during the demo run. Prioritize trusted publications to back your answers.',
        priority: 'high',
        category: 'citations',
        relatedMetric: 'citations',
        actionItems: [
          'Pitch or source content from tier-one publications covering your category.',
          'Incorporate product documentation or analyst reports that can be cited in AI answers.',
        ],
      });
    } else {
      const citationLeader = analysis.citations[0];
      const brandDomainKey = analysis.brandDomain ? this.normalizeDomain(analysis.brandDomain).host : null;
      if (brandDomainKey && citationLeader.domain !== brandDomainKey) {
        recommendations.push({
          title: 'Increase branded citation coverage',
          description: `${citationLeader.domain} currently leads citation volume. Secure more references pointing to ${analysis.brand.label}'s owned assets.`,
          priority: 'medium',
          category: 'citations',
          relatedMetric: 'citations',
          actionItems: [
            'Publish or refresh cornerstone content that AI agents can cite confidently.',
            'Build schema and metadata to improve discoverability of owned resources.',
          ],
        });
      }
    }

    const strugglingEngines = analysis.enginePerformance.filter((engine) => engine.successRate < 70);
    if (strugglingEngines.length > 0) {
      const engineList = strugglingEngines.map((engine) => engine.engine).join(', ');
      recommendations.push({
        title: `Stabilize performance on ${engineList}`,
        description: `Success rates on ${engineList} fall below 70%. Address provider errors or adjust prompts to improve completion.`,
        priority: 'medium',
        category: 'execution',
        relatedMetric: 'enginePerformance',
        actionItems: [
          'Review provider logs for rate limits or auth issues and re-run failed jobs.',
          'Adjust prompt wording to better align with each engine’s strengths.',
        ],
      });
    }

    const totalPlannedJobs = Number(demoRunRecord.analysisJobsTotal ?? metrics.totalRuns);
    const finishedJobs = metrics.completedRuns + metrics.failedRuns;
    if (totalPlannedJobs > finishedJobs) {
      const remaining = totalPlannedJobs - finishedJobs;
      recommendations.push({
        title: 'Resume pending demo jobs',
        description: `${remaining} queued jobs are still outstanding—complete them to unlock full insight coverage.`,
        priority: 'medium',
        category: 'coverage',
        relatedMetric: 'analysisProgress',
        actionItems: [
          'Verify background workers are running and connected to Redis.',
          'Re-run /v1/demo/run after resolving provider limits to finish the workload.',
        ],
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        title: 'Maintain momentum',
        description: 'The demo run is performing well—extend coverage with additional competitor comparisons to keep gaining insights.',
        priority: 'low',
        category: 'visibility',
        relatedMetric: 'shareOfVoice',
        actionItems: [
          'Add prompts covering emerging competitors and adjacent categories.',
          'Schedule periodic re-runs to monitor shifts in citations and sentiment.',
        ],
      });
    }

    // Sort by priority and impact
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    recommendations.sort((a, b) => {
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.title.localeCompare(b.title);
    });

    return recommendations.slice(0, 10); // Return top 10 recommendations
  }

  /**
   * Get related metric for insight type
   */
  private getRelatedMetric(insightType: string): string {
    const metricMap: Record<string, string> = {
      visibility_blocker: 'shareOfVoice',
      trust_gap: 'citations',
      schema_gap: 'structuralScore',
      listing_inconsistency: 'citations',
      reputation_weakness: 'sentiment',
      content_gap: 'citations',
      competitor_advantage: 'shareOfVoice',
      hallucination_risk: 'citations',
      missing_fact: 'entityStrength',
    };
    return metricMap[insightType] || 'shareOfVoice';
  }

  private normalizeEntityKey(value: string | null | undefined): string {
    if (!value) {
      return '';
    }
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  private formatEntityLabel(raw: string | null | undefined): string {
    if (!raw) {
      return 'Unknown';
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      return 'Unknown';
    }
    return trimmed
      .split(/\s+/)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ');
  }

  private toPercentage(value: number, precision = 2): number {
    if (!Number.isFinite(value) || value <= 0) {
      return 0;
    }
    const multiplier = 10 ** precision;
    return Math.round(value * 100 * multiplier) / multiplier;
  }

  private ensureStatusAtLeast(demoRun: DemoRunRecord, requiredStatus: string, errorMessage: string): void {
    const currentRank = this.statusOrder[demoRun.status] ?? -1;
    const requiredRank = this.statusOrder[requiredStatus] ?? Number.MAX_SAFE_INTEGER;
    if (currentRank < requiredRank) {
      throw new BadRequestException(errorMessage);
    }
  }

  private validateDemoConfiguration(engines: string[]): void {
    if (process.env.MOCK_PROVIDERS === 'true') {
      throw new BadRequestException('Turn off MOCK_PROVIDERS to run the live demo workflow.');
    }

    const missingCredentials: string[] = [];
    for (const engine of engines) {
      const requirements = this.engineEnvRequirements[engine];
      if (!requirements) continue;

      const missingForEngine = requirements.filter((variable) => {
        const value = process.env[variable];
        if (value === undefined || value === null || value.toString().trim().length === 0) {
          return true;
        }
        return false;
      });

      if (missingForEngine.length > 0) {
        missingCredentials.push(`${engine}: ${missingForEngine.join(', ')}`);
      }
    }

    if (missingCredentials.length > 0) {
      throw new BadRequestException(
        `Missing provider credentials for engines: ${missingCredentials.join('; ')}. Set the required environment variables and retry.`,
      );
    }
  }

  private async loadDemoRun(demoRunId: string): Promise<DemoRunRecord> {
    const rows = await this.prisma.$queryRaw<DemoRunRecord>(
      `SELECT "id", "workspaceId", "domain", "brand", "summary", "competitors",
              "analysisJobsTotal", "analysisJobsCompleted", "analysisJobsFailed",
              "status", "progress", "updatedAt"
       FROM "demo_runs"
       WHERE "id" = $1
       LIMIT 1`,
      [demoRunId]
    );

    if (rows.length === 0) {
      throw new NotFoundException(`Demo run ${demoRunId} not found.`);
    }

    return rows[0];
  }

  private computeProgress(currentProgress: number, totalJobs: number, finishedJobs: number): number {
    const base = currentProgress ?? 0;
    if (totalJobs <= 0) {
      return Math.min(100, Math.max(base, 80));
    }

    const ratio = Math.min(1, Math.max(0, finishedJobs / totalJobs));
    const target = ratio >= 1 ? 100 : Math.max(80, Math.round(80 + ratio * 20));
    return Math.min(100, Math.max(base, target));
  }

  private normalizeDomain(domain: string): { href: string; host: string } {
    try {
      const url = new URL(domain.startsWith('http') ? domain : `https://${domain}`);
      return { href: url.origin, host: url.hostname.replace(/^www\./, '') };
    } catch (error) {
      this.logger.warn(`Invalid domain supplied (${domain}), using fallback.`);
      const sanitized = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
      return { href: `https://${sanitized}`, host: sanitized.split('/')[0].replace(/^www\./, '') };
    }
  }

  private deriveBrandFromHost(host: string): string {
    if (!host) return 'Demo Brand';
    const parts = host.split('.');
    const primary = parts[0];
    return primary.charAt(0).toUpperCase() + primary.slice(1);
  }

  private generateWorkspaceId(host: string): string {
    const safeHost = host.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    return `demo_${safeHost || randomUUID()}`;
  }

  private async ensureWorkspace(workspaceId: string, name: string): Promise<void> {
    // Create workspace with onboarding defaults
    // Demo workspaces use 'instant_summary' entry type since they're created from the free funnel
    await this.prisma.$executeRaw(
      `INSERT INTO "workspaces" ("id", "name", "tier", "onboardingStatus", "onboardingEntryType", "createdAt")
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name"`,
      [workspaceId, name, 'INSIGHTS', 'not_started', 'instant_summary']
    );
  }

  private async generateSummary(
    workspaceId: string,
    domain: string,
    brand: string,
    override?: string,
  ): Promise<{ summary: string; source: 'user' | 'llm' | 'fallback'; entityData?: any }> {
    if (override && override.trim().length > 0) {
      return { summary: override.trim(), source: 'user' };
    }

    try {
      // Use EntityExtractorService for comprehensive entity-first extraction
      const entityData = await this.entityExtractor.extractEntityFromDomain(workspaceId, domain);
      
      // Use the LLM-optimized summary from entity extraction
      if (entityData.summary && entityData.summary.length > 0) {
        return {
          summary: entityData.summary,
          source: 'llm',
          entityData: {
            businessName: entityData.businessName,
            category: entityData.category,
            vertical: entityData.vertical,
            services: entityData.services,
            geography: entityData.geography,
            pricePositioning: entityData.pricePositioning,
            valueProps: entityData.valueProps,
            credibilityMarkers: entityData.credibilityMarkers,
            structuredSummary: entityData.structuredSummary,
            metadata: entityData.metadata,
          },
        };
      }
    } catch (error) {
      this.logger.warn(`Entity extraction failed, falling back to simple summary: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Fallback to simple LLM generation if entity extraction fails
    const prompt = `Analyze the brand hosted at ${domain}.
Provide a concise 2-3 sentence overview describing what ${brand} does, who it serves, and its value proposition.
Keep the tone factual and neutral.`;

    try {
      const response = await this.llmRouter.routeLLMRequest(workspaceId, prompt);
      const text = (response.content || response.text || '').trim();
      if (text.length > 0) {
        return { summary: text, source: 'llm' };
      }
    } catch (error) {
      this.logger.warn(`LLM summary generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    const fallback = `${brand} operates at ${domain} and provides digital services for its customers.`;
    return { summary: fallback, source: 'fallback' };
  }

  private async upsertWorkspaceProfile(workspaceId: string, brand: string, summary: string): Promise<void> {
    const existing = await this.prisma.$queryRaw<{ id: string }>(
      'SELECT "id" FROM "workspace_profiles" WHERE "workspaceId" = $1 LIMIT 1',
      [workspaceId]
    );

    if (existing.length > 0) {
      await this.prisma.$executeRaw(
        `UPDATE "workspace_profiles"
         SET "businessName" = $1,
             "description" = $2,
             "updatedAt" = NOW()
         WHERE "workspaceId" = $3`,
        [brand, summary, workspaceId]
      );
      return;
    }

    const profileId = `profile_${randomUUID()}`;
    await this.prisma.$executeRaw(
      `INSERT INTO "workspace_profiles"
        ("id", "workspaceId", "businessName", "services", "description", "verified", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, false, NOW(), NOW())`,
      [profileId, workspaceId, brand, [], summary]
    );
  }

  private async createDemoRun(params: {
    workspaceId: string;
    domain: string;
    brand: string;
    summary: string;
    status: string;
    progress: number;
  }): Promise<{ id: string }> {
    const demoRunId = randomUUID();
    const rows = await this.prisma.$queryRaw<{ id: string }>(
      `INSERT INTO "demo_runs"
        ("id", "workspaceId", "domain", "brand", "summary", "competitors",
         "analysisJobsTotal", "analysisJobsCompleted", "analysisJobsFailed",
         "status", "progress", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
       RETURNING "id"`,
      [
        demoRunId,
        params.workspaceId,
        params.domain,
        params.brand,
        params.summary,
        [],
        null,
        0,
        0,
        params.status,
        params.progress,
      ]
    );

    return rows[0];
  }

  private normalizePromptList(
    prompts: string[],
    source: 'seed' | 'llm' | 'user'
  ): Array<{ text: string; source: 'seed' | 'llm' | 'user' }> {
    if (!prompts) return [];
    const seen = new Set<string>();
    const normalized: Array<{ text: string; source: 'seed' | 'llm' | 'user' }> = [];

    for (const prompt of prompts) {
      const trimmed = (prompt || '').replace(/\s+/g, ' ').trim();
      if (trimmed.length === 0) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.push({ text: trimmed, source });
    }

    return normalized;
  }

  private mergePromptSources(
    prompts: Array<{ text: string; source: 'seed' | 'llm' | 'user' }>
  ): Array<{ text: string; source: 'seed' | 'llm' | 'user' }> {
    const seen = new Set<string>();
    const merged: Array<{ text: string; source: 'seed' | 'llm' | 'user' }> = [];

    for (const prompt of prompts) {
      const key = prompt.text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(prompt);
    }

    return merged;
  }

  private async generatePromptSuggestions(
    workspaceId: string,
    brand: string,
    summary: string,
    seedPrompts: string[],
    domain?: string | null,
  ): Promise<Array<{ text: string; source: 'llm' | 'seed' | 'user' }>> {
    // Get entity data if available for better context (declare outside try block for fallback use)
    let entityData: any = null;
    if (domain) {
      try {
        const profile = await this.prisma.$queryRaw<{ businessName: string; description: string; services: any[] }>(
          'SELECT "businessName", "description", "services" FROM "workspace_profiles" WHERE "workspaceId" = $1 LIMIT 1',
          [workspaceId]
        );
        if (profile.length > 0) {
          try {
            entityData = await this.entityExtractor.extractEntityFromDomain(workspaceId, domain);
          } catch (error) {
            // Continue without entity data
          }
        }
      } catch (error) {
        // Continue without entity data
      }
    }

    // Extract category and industry for use throughout the function
    const category = entityData?.category || 'business services';
    const industry = entityData?.vertical || category;

    try {
      // Use IntentClustererService for intent-based prompt generation
      // Focus on industry/category for competitive benchmarking
      
      const intentBasedPrompts = await this.intentClusterer.generateIntentBasedPrompts(
        workspaceId,
        {
          brandName: brand, // For reference only - prompts should focus on industry
          category: category,
          vertical: industry, // This is the key field for industry-focused prompts
          summary: summary || entityData?.summary || '',
          services: entityData?.services || [],
          geography: entityData?.geography || undefined,
        },
        ['BEST', 'ALTERNATIVES', 'HOWTO', 'PRICING', 'COMPARISON'] // Target intents - these will be industry-focused
      );

      // Convert to expected format
      const suggestions = intentBasedPrompts.map(p => ({
        text: p.text,
        source: 'llm' as const,
      }));

      // Include seed prompts and merge
      const allPrompts = this.mergePromptSources([
        ...this.normalizePromptList(seedPrompts, 'seed'),
        ...suggestions,
      ]);

      if (allPrompts.length > 0) {
        return allPrompts;
      }
    } catch (error) {
      this.logger.warn(`Intent-based prompt generation failed, falling back to simple generation: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Fallback to simple LLM generation - industry-focused
    // category and industry are already declared above, reuse them
    const prompt = `You are helping an analyst evaluate businesses in the ${industry} industry.
Use the business summary below and the provided seed prompts to suggest additional high-impact prompts that capture how AI search users might research this industry and compare options.

Business Context:
- Industry: ${industry}
- Category: ${category}
- Brand: ${brand} (for reference, but focus on industry-level queries)
- Summary: ${summary || 'No summary available.'}

Seed prompts:
${seedPrompts.map((p, idx) => `${idx + 1}. ${p}`).join('\n')}

IMPORTANT: Generate INDUSTRY-FOCUSED prompts that enable competitive benchmarking:
- Focus on the ${industry} industry/category, NOT the specific brand
- These queries should surface multiple competitors and enable comparison
- Examples: "best ${industry} platforms", "top ${industry} solutions", "${industry} comparison"
- Avoid brand-specific queries - use industry terms instead

Return a JSON array of 3 to 6 concise prompts (strings). Each prompt should be unique and focus on industry-level comparisons, alternatives, pricing, or how-to guides for ${industry}.`;

    try {
      const response = await this.llmRouter.routeLLMRequest(workspaceId, prompt, {
        temperature: 0.3,
        maxTokens: 256,
      });

      const raw = (response.content || response.text || '').trim();
      const parsed = JSON.parse(raw) as string[];
      const suggestions = this.normalizePromptList(parsed, 'llm');
      if (suggestions.length > 0) {
        return this.mergePromptSources([
          ...this.normalizePromptList(seedPrompts, 'seed'),
          ...suggestions,
        ]);
      }
    } catch (error) {
      this.logger.warn(`Prompt expansion failed, falling back to heuristics: ${error instanceof Error ? error.message : String(error)}`);
    }

    return this.normalizePromptList(this.buildPromptFallbacks(brand, seedPrompts), 'llm');
  }

  private buildPromptFallbacks(brand: string, seedPrompts: string[]): string[] {
    // Extract industry from seed prompts if possible
    const industryMatch = seedPrompts[0]?.match(/best\s+(\w+)/i) || seedPrompts[0]?.match(/top\s+(\w+)/i);
    const industry = industryMatch ? industryMatch[1] : 'business services';
    
    const base = seedPrompts.slice(0, 2);
    const variations = [
      `Best ${industry} platforms`,
      `Top ${industry} solutions comparison`,
      `${industry} pricing guide`,
      `How to choose ${industry} platform`,
      `Compare ${industry} services`,
    ];
    return [...base, ...variations];
  }

  private async replaceWorkspacePrompts(
    workspaceId: string,
    prompts: Array<{ text: string; source: 'seed' | 'llm' | 'user' }>,
  ): Promise<void> {
    await this.prisma.$executeRaw(
      `DELETE FROM "prompts"
       WHERE "workspaceId" = $1
         AND $2 = ANY("tags")`,
      [workspaceId, 'demo']
    );

    for (const prompt of prompts) {
      const id = `prompt_${randomUUID()}`;
      await this.prisma.$executeRaw(
        `INSERT INTO "prompts"
          ("id", "workspaceId", "text", "canonicalText", "intent", "vertical", "active", "tags", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, true, $7, NOW())`,
        [
          id,
          workspaceId,
          prompt.text,
          prompt.text,
          this.inferIntent(prompt.text),
          null,
          ['demo'],
        ]
      );
    }
  }

  private inferIntent(prompt: string): string {
    const text = prompt.toLowerCase();
    if (text.includes('vs ') || text.includes(' versus ') || text.includes('compare')) {
      return 'VS';
    }
    if (text.includes('alternative') || text.includes('instead of')) {
      return 'ALTERNATIVES';
    }
    if (text.includes('price') || text.includes('pricing') || text.includes('cost')) {
      return 'PRICING';
    }
    if (text.includes('how to') || text.startsWith('how do')) {
      return 'HOWTO';
    }
    return 'BEST';
  }

  private async updateDemoRun(
    demoRunId: string,
    update: {
      status?: string;
      progress?: number;
      competitors?: string[];
      analysisJobsTotal?: number | null;
      analysisJobsCompleted?: number;
      analysisJobsFailed?: number;
    },
  ): Promise<void> {
    const fields: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (update.status) {
      fields.push(`"status" = $${idx++}`);
      params.push(update.status);
    }
    if (typeof update.progress === 'number') {
      fields.push(`"progress" = $${idx++}`);
      params.push(update.progress);
    }
    if (update.competitors !== undefined) {
      fields.push(`"competitors" = $${idx++}`);
      params.push(update.competitors);
    }
    if (update.analysisJobsTotal !== undefined) {
      fields.push(`"analysisJobsTotal" = $${idx++}`);
      params.push(update.analysisJobsTotal);
    }
    if (update.analysisJobsCompleted !== undefined) {
      fields.push(`"analysisJobsCompleted" = $${idx++}`);
      params.push(update.analysisJobsCompleted);
    }
    if (update.analysisJobsFailed !== undefined) {
      fields.push(`"analysisJobsFailed" = $${idx++}`);
      params.push(update.analysisJobsFailed);
    }

    if (fields.length === 0) return;

    params.push(demoRunId);

    await this.prisma.$executeRaw(
      `UPDATE "demo_runs"
       SET ${fields.join(', ')}, "updatedAt" = NOW()
       WHERE "id" = $${idx}`,
      params
    );
  }

  private async getDemoPrompts(workspaceId: string): Promise<Array<{ id: string; text: string }>> {
    return this.prisma.$queryRaw(
      `SELECT "id", "text"
       FROM "prompts"
       WHERE "workspaceId" = $1
         AND 'demo' = ANY("tags")
       ORDER BY "createdAt" ASC`,
      [workspaceId]
    );
  }

  private normalizeDomainList(domains: string[]): string[] {
    if (!domains) return [];
    const seen = new Set<string>();
    const normalized: string[] = [];

    for (const domain of domains) {
      const cleaned = this.cleanDomain(domain);
      if (!cleaned) continue;
      if (seen.has(cleaned)) continue;
      seen.add(cleaned);
      normalized.push(cleaned);
    }

    return normalized;
  }

  private cleanDomain(domain: string): string | null {
    const trimmed = (domain || '').trim().toLowerCase();
    if (!trimmed) return null;

    try {
      const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
      return url.hostname.replace(/^www\./, '');
    } catch {
      return trimmed.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    }
  }

  private normalizeEngines(engines?: string[]): string[] {
    const allowed = new Set(['PERPLEXITY', 'AIO', 'BRAVE', 'OPENAI', 'ANTHROPIC', 'GEMINI']);
    const normalized = (engines && engines.length > 0 ? engines : this.defaultEngines)
      .map((engine) => (engine || '').toUpperCase().trim())
      .filter((engine) => allowed.has(engine));

    return normalized.length > 0 ? normalized : this.defaultEngines;
  }

  private async ensureEngines(workspaceId: string, engines: string[]): Promise<void> {
    const rows = await this.prisma.$queryRaw<{ key: string }>(
      `SELECT "key" FROM "engines" WHERE "workspaceId" = $1`,
      [workspaceId]
    );
    const existing = new Set(rows.map((row) => row.key));

    for (const engine of engines) {
      if (existing.has(engine)) continue;
      const id = `engine_${randomUUID()}`;
      await this.prisma.$executeRaw(
        `INSERT INTO "engines"
          ("id", "workspaceId", "key", "enabled", "config", "dailyBudgetCents", "concurrency", "createdAt")
         VALUES ($1, $2, $3, true, $4, $5, $6, NOW())`,
        [id, workspaceId, engine, {}, 500, 1]
      );
    }
  }

  private async generateCompetitorSuggestions(
    workspaceId: string,
    brand: string,
    summary: string,
    promptTexts: string[],
    domain?: string | null,
  ): Promise<string[]> {
    try {
      // Get entity data if available (from workspace profile or extract it)
      let entityData: any = null;
      try {
        const profile = await this.prisma.$queryRaw<{ businessName: string; description: string; services: any[] }>(
          'SELECT "businessName", "description", "services" FROM "workspace_profiles" WHERE "workspaceId" = $1 LIMIT 1',
          [workspaceId]
        );
        if (profile.length > 0 && domain) {
          // Try to extract entity data if we have domain
          try {
            entityData = await this.entityExtractor.extractEntityFromDomain(workspaceId, domain);
          } catch (error) {
            this.logger.warn('Entity extraction for competitor detection failed, using summary only');
          }
        }
      } catch (error) {
        // Continue without entity data
      }

      // Get existing mentions and citations from database (if any analysis has run)
      const [existingMentions, citationDomains] = await Promise.all([
        this.getExistingMentions(workspaceId, brand),
        this.getCitationDomains(workspaceId),
      ]);

      // Build competitor detection context
      const context = {
        brandName: brand,
        domain: domain || '',
        category: entityData?.category || 'General Business',
        vertical: entityData?.vertical || 'General',
        geography: entityData?.geography || undefined,
        services: entityData?.services || [],
        pricePositioning: entityData?.pricePositioning || undefined,
        summary: summary || entityData?.summary || '',
        promptTexts: promptTexts || [],
        existingMentions: existingMentions,
        citationDomains: citationDomains,
      };

      // Use CompetitorDetectorService for comprehensive detection
      const detectionResult = await this.competitorDetector.detectCompetitors(workspaceId, context);

      // Combine all competitors and return domains
      const allCompetitors = detectionResult.all;
      const domains = allCompetitors
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 8) // Limit to top 8
        .map(c => c.domain);

      if (domains.length > 0) {
        return this.normalizeDomainList(domains);
      }
    } catch (error) {
      this.logger.warn(`Competitor detection failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Fallback to simple LLM-based detection
    const prompt = `You are analyzing competitors for ${brand}.
Use the brand summary and prompts below to identify likely competitors.

Brand summary:
${summary || 'No summary provided.'}

Research prompts:
${promptTexts.map((p, idx) => `${idx + 1}. ${p}`).join('\n')}

Return a JSON array of 3 to 6 competitor domains (only the domain, e.g., "paypal.com").`;

    try {
      const response = await this.llmRouter.routeLLMRequest(workspaceId, prompt, {
        temperature: 0.2,
        maxTokens: 256,
      });

      const raw = (response.content || response.text || '').trim();
      const parsed = JSON.parse(raw) as string[];
      const normalized = this.normalizeDomainList(parsed);
      if (normalized.length > 0) {
        return normalized;
      }
    } catch (error) {
      this.logger.warn(`Competitor suggestion generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    const host = domain ? this.normalizeDomain(domain).host : undefined;
    return this.getDefaultCompetitors(brand, host);
  }

  /**
   * Get existing mentions from database for competitor detection
   */
  private async getExistingMentions(
    workspaceId: string,
    brandName: string
  ): Promise<Array<{ brand: string; domain?: string }>> {
    try {
      const mentions = await this.prisma.$queryRaw<{ brand: string }>(
        `SELECT DISTINCT m."brand"
         FROM "mentions" m
         JOIN "answers" a ON a.id = m."answerId"
         JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
         JOIN "prompts" p ON p.id = pr."promptId"
         WHERE pr."workspaceId" = $1
           AND LOWER(m."brand") != LOWER($2)
           AND 'demo' = ANY(p."tags")
         LIMIT 20`,
        [workspaceId, brandName]
      );

      return mentions.map(m => ({ brand: m.brand }));
    } catch (error) {
      this.logger.warn('Failed to get existing mentions:', error);
      return [];
    }
  }

  /**
   * Get citation domains from database
   */
  private async getCitationDomains(workspaceId: string): Promise<string[]> {
    try {
      const citations = await this.prisma.$queryRaw<{ domain: string }>(
        `SELECT DISTINCT c."domain"
         FROM "citations" c
         JOIN "answers" a ON a.id = c."answerId"
         JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
         JOIN "prompts" p ON p.id = pr."promptId"
         WHERE pr."workspaceId" = $1
           AND 'demo' = ANY(p."tags")
         LIMIT 30`,
        [workspaceId]
      );

      return citations.map(c => c.domain).filter(Boolean);
    } catch (error) {
      this.logger.warn('Failed to get citation domains:', error);
      return [];
    }
  }

  private getDefaultCompetitors(brand: string, host?: string): string[] {
    const generic = ['paypal.com', 'adyen.com', 'squareup.com', 'stripe.com', 'checkout.com'];
    const brandWords = (brand || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const brandHost = (host || '').toLowerCase();
    return generic.filter(comp => comp !== brandHost && !comp.includes(brandWords));
  }

  /**
   * Premium instant summary using new quality layer services
   * Pipeline: Industry Detection → Business Summary → Prompts → Competitors → Analysis → Evidence Collection
   */
  async getInstantSummary(domain: string): Promise<{ ok: boolean; data: any }> {
    const normalized = this.normalizeDomain(domain);
    const brand = this.deriveBrandFromHost(normalized.host);
    const workspaceId = this.generateWorkspaceId(normalized.host);
    
    await this.ensureWorkspace(workspaceId, brand);

    const allEvidence: any[] = [];
    const allWarnings: string[] = [];
    let overallConfidence = 1.0;

    try {
      // STEP 1: Detect Industry (CRITICAL - foundation for all analysis)
      this.logger.log(`[Premium] Step 1: Detecting industry for ${domain}`);
      const industryClassification = await this.industryDetector.detectIndustry(
        workspaceId,
        normalized.href
      );
      
      const industry = industryClassification.primaryIndustry;
      const industryContext = await this.industryDetector.getIndustryContext(workspaceId, normalized.href);
      
      if (industryClassification.confidence < 0.5) {
        allWarnings.push(`Low confidence industry detection (${Math.round(industryClassification.confidence * 100)}%)`);
        overallConfidence *= 0.8;
      }
      if (industryClassification.missingData.length > 0) {
        allWarnings.push(`Industry detection missing: ${industryClassification.missingData.join(', ')}`);
      }

      // STEP 2: Generate Premium Business Summary
      this.logger.log(`[Premium] Step 2: Generating premium business summary`);
      const premiumSummary = await this.premiumSummary.generatePremiumSummary(
        workspaceId,
        normalized.href,
        brand
      );
      
      allEvidence.push(...premiumSummary.evidence.map(e => ({
        type: 'summary' as const,
        confidence: premiumSummary.confidence,
        reasoning: e,
      })));
      allWarnings.push(...premiumSummary.missingData);
      overallConfidence = Math.min(overallConfidence, premiumSummary.confidence);

      // STEP 3: Generate Industry-Specific, Evidence-Backed Prompts
      this.logger.log(`[Premium] Step 3: Generating industry-specific prompts`);
      const promptContext = {
        industry: industryContext.industry,
        category: industryContext.category,
        vertical: industryContext.vertical,
        brandName: brand,
        services: premiumSummary.structuredSummary.valueProps || [],
        geography: { primary: premiumSummary.structuredSummary.where },
        marketType: industryContext.marketType,
        serviceType: industryContext.serviceType,
      };
      
      const premiumPrompts = await this.evidenceBackedPrompts.generateEvidenceBackedPrompts(
        workspaceId,
        promptContext,
        false // Don't test prompts yet (will test after analysis)
      );
      
      const promptTexts = premiumPrompts.map(p => p.text);
      
      // Create demo run
      const demoRun = await this.createDemoRun({
        workspaceId,
        domain: normalized.href,
        brand,
        summary: premiumSummary.summary,
        status: 'summary_ready',
        progress: 20,
      });
      
      const demoRunId = demoRun.id;

      // Save prompts to database
      await this.replaceWorkspacePrompts(
        workspaceId,
        promptTexts.map(text => ({ text, source: 'llm' as const }))
      );

      // STEP 4: Detect Premium Competitors
      this.logger.log(`[Premium] Step 4: Detecting premium competitors`);
      const premiumCompetitors = await this.premiumCompetitors.detectPremiumCompetitors(
        workspaceId,
        normalized.href,
        brand,
        industry
      );
      
      const competitorDomains = premiumCompetitors.map(c => c.domain);
      await this.updateDemoRun(demoRunId, {
        competitors: competitorDomains,
        status: 'competitors_ready',
      });

      // STEP 5: Start Analysis in Background
      this.logger.log(`[Premium] Step 5: Starting analysis`);
      const runResult = await this.runDemo({
        demoRunId,
        engines: undefined,
      });

      // STEP 6: Get Current Status
      const statusResult = await this.getStatus(demoRunId);
      const currentStatus = statusResult.data.status;
      const engines = statusResult.data.engines || this.defaultEngines.map(key => ({ key, visible: false }));

      // STEP 7: Collect Evidence & Calculate Premium Metrics
      let premiumSOV: PremiumShareOfVoice[] = [];
      let premiumCitations: PremiumCitation[] = [];
      let premiumGEOScore: PremiumGEOScore | null = null;
      let eeatScore: any = null;

      // Always calculate GEO Score (works with partial data)
      this.logger.log(`[Premium] Calculating GEO Score for ${brand}`);
      try {
        premiumGEOScore = await this.premiumGEOScore.calculatePremiumGEOScore(
          workspaceId,
          normalized.href,
          brand,
          premiumCompetitors.map(c => c.brandName),
          industry
        );
        
        this.logger.log(`[Premium] GEO Score calculated: ${premiumGEOScore.total}/100`);
        overallConfidence = Math.min(overallConfidence, premiumGEOScore.confidence);
        allWarnings.push(...premiumGEOScore.warnings);
      } catch (error) {
        this.logger.error(`GEO Score calculation failed: ${error instanceof Error ? error.message : String(error)}`);
        // Create a default GEO score structure if calculation fails
        premiumGEOScore = {
          total: 0,
          breakdown: {
            aiVisibility: { score: 0, weight: 0.35, points: 0, details: { perEngine: [], perPrompt: [] }, evidence: [], explanation: 'GEO Score calculation failed', missing: ['GEO Score calculation failed'] },
            eeat: { score: 0, weight: 0.25, points: 0, breakdown: { expertise: 0, authoritativeness: 0, trustworthiness: 0, experience: 0 }, evidence: [], explanation: 'GEO Score calculation failed', missing: ['GEO Score calculation failed'] },
            citations: { score: 0, weight: 0.15, points: 0, details: { totalCitations: 0, licensedPublisherCitations: 0, averageAuthority: 0, citationCategories: {} }, evidence: [], explanation: 'GEO Score calculation failed', missing: ['GEO Score calculation failed'] },
            competitorComparison: { score: 0, weight: 0.15, points: 0, details: { shareOfVoice: 0, competitorCount: 0, relativePosition: 0 }, evidence: [], explanation: 'GEO Score calculation failed', missing: ['GEO Score calculation failed'] },
            schemaTechnical: { score: 0, weight: 0.10, points: 0, details: { schemaTypes: [], schemaCompleteness: 0, structuredDataQuality: 0 }, evidence: [], explanation: 'GEO Score calculation failed', missing: ['GEO Score calculation failed'] },
          },
          confidence: 0.1,
          warnings: ['GEO Score calculation failed'],
          recommendations: [],
        };
        allWarnings.push('GEO Score calculation failed - using default structure');
      }

      if (currentStatus === 'analysis_complete' || statusResult.data.completedJobs > 0) {
        // Calculate Share of Voice with Evidence
        const allEntities = [brand, ...premiumCompetitors.map(c => c.brandName)];
        premiumSOV = await this.evidenceBackedSOV.calculateEvidenceBackedSOV(workspaceId, allEntities);
        
        // Get Premium Citations
        premiumCitations = await this.premiumCitations.getPremiumCitations(workspaceId, normalized.href);
        
        // Calculate EEAT Score
        try {
          eeatScore = await this.eeatCalculator.calculateEEATScore(workspaceId);
        } catch (error) {
          this.logger.warn(`EEAT calculation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // STEP 8: Generate Diagnostic Intelligence (NEW)
      this.logger.log(`[Premium] Step 8: Generating diagnostic intelligence`);
      const allInsights: any[] = [];
      const allStrengths: any[] = [];
      const allWeaknesses: any[] = [];
      const allRisks: any[] = [];
      const allRecommendations: any[] = [];
      const allEngineReasoning: any[] = [];
      const allOpportunities: any[] = [];
      const allCompetitiveThreats: any[] = [];

      try {
        // Generate summary diagnostics
        const summaryDiagnostics = await this.premiumSummary.generateSummaryDiagnostics(
          workspaceId,
          premiumSummary,
          premiumCompetitors,
          engines.map((e: { key: string }) => e.key)
        );
        allInsights.push(...summaryDiagnostics.insights);
        allStrengths.push(...summaryDiagnostics.strengths);
        allWeaknesses.push(...summaryDiagnostics.weaknesses);
        allRisks.push(...summaryDiagnostics.risks);
        allRecommendations.push(...summaryDiagnostics.recommendations);
        allEngineReasoning.push(...summaryDiagnostics.engineReasoning);

        // Generate prompt opportunities and diagnostics
        const promptOpportunities = await this.evidenceBackedPrompts.generatePromptOpportunities(
          workspaceId,
          premiumPrompts,
          premiumCompetitors
        );
        allOpportunities.push(...promptOpportunities);

        const promptDiagnostics = await this.evidenceBackedPrompts.generatePromptDiagnostics(
          workspaceId,
          premiumPrompts,
          promptOpportunities
        );
        allInsights.push(...promptDiagnostics.insights);
        allRecommendations.push(...promptDiagnostics.recommendations);

        // Generate competitor diagnostics
        const ownVisibility = premiumSOV.find(s => s.entity.toLowerCase() === brand.toLowerCase())?.sharePercentage || 0;
        const competitorDiagnostics = await this.premiumCompetitors.generateCompetitorDiagnostics(
          workspaceId,
          premiumCompetitors,
          ownVisibility
        );
        allInsights.push(...competitorDiagnostics.insights);
        allCompetitiveThreats.push(...competitorDiagnostics.threats);
        allRecommendations.push(...competitorDiagnostics.recommendations);

        // Generate GEO score diagnostics
        if (premiumGEOScore) {
          const geoScoreDiagnostics = await this.premiumGEOScore.generateGEOScoreDiagnostics(
            workspaceId,
            premiumGEOScore,
            industry
          );
          allInsights.push(...geoScoreDiagnostics.insights);
          allRecommendations.push(...geoScoreDiagnostics.recommendations);
        }

        // Generate Share of Voice diagnostics
        if (premiumSOV.length > 0) {
          const competitorBrands = premiumCompetitors.map(c => c.brandName);
          const sovDiagnostics = await this.evidenceBackedSOV.generateSOVDiagnostics(
            workspaceId,
            premiumSOV,
            brand,
            competitorBrands
          );
          allInsights.push(...sovDiagnostics.insights);
          allRecommendations.push(...sovDiagnostics.recommendations);
        }

        // Generate Citation diagnostics
        if (premiumCitations.length > 0) {
          const citationDiagnostics = await this.premiumCitations.generateCitationDiagnostics(
            workspaceId,
            premiumCitations
          );
          allInsights.push(...citationDiagnostics.insights);
          allRecommendations.push(...citationDiagnostics.recommendations);
        }
      } catch (error) {
        this.logger.warn(`Diagnostic intelligence generation failed: ${error instanceof Error ? error.message : String(error)}`);
        // Continue without diagnostics rather than failing
      }

      // Build premium response with diagnostic intelligence
      const response: PremiumResponse<any> = {
        data: {
          demoRunId,
          workspaceId,
          domain: normalized.href,
          brand,
          industry: {
            primary: industry,
            category: industryContext.category,
            vertical: industryContext.vertical,
            confidence: industryClassification.confidence,
            reasoning: industryClassification.reasoning,
          },
          summary: premiumSummary,
          prompts: premiumPrompts.map(p => ({
            text: p.text,
            intent: p.intent,
            industryRelevance: p.industryRelevance,
            commercialIntent: p.commercialIntent,
            reasoning: p.reasoning,
            evidence: p.evidence,
          })),
          competitors: premiumCompetitors.map(c => ({
            domain: c.domain,
            brandName: c.brandName,
            type: c.type,
            confidence: c.confidence,
            reasoning: c.reasoning,
            visibility: c.visibility,
            ranking: c.ranking,
          })),
          shareOfVoice: premiumSOV,
          citations: premiumCitations,
          geoScore: premiumGEOScore,
          eeatScore,
          engines,
          status: currentStatus,
          progress: statusResult.data.progress || 0,
          totalJobs: statusResult.data.totalJobs || 0,
          completedJobs: statusResult.data.completedJobs || 0,
        },
        evidence: allEvidence,
        confidence: overallConfidence,
        warnings: allWarnings,
        explanation: `Premium analysis for ${brand} in the ${industry} industry. ` +
          `Industry detected with ${Math.round(industryClassification.confidence * 100)}% confidence. ` +
          `${premiumPrompts.length} industry-specific prompts generated. ` +
          `${premiumCompetitors.length} competitors detected. ` +
          (premiumGEOScore ? `GEO Score: ${premiumGEOScore.total}/100. ` : 'Analysis in progress. '),
        // Diagnostic intelligence layer
        diagnostics: {
          insights: allInsights,
          strengths: allStrengths,
          weaknesses: allWeaknesses,
          risks: allRisks,
          recommendations: allRecommendations,
          engineReasoning: allEngineReasoning,
          opportunities: allOpportunities,
          competitiveThreats: allCompetitiveThreats,
        },
        metadata: {
          generatedAt: new Date(),
          industry,
          missingData: allWarnings.filter(w => w.includes('missing') || w.includes('Missing')),
        },
      };

      return {
        ok: true,
        data: response,
      };
    } catch (error) {
      this.logger.error(`Premium instant summary failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error instanceof BadRequestException
        ? error
        : new BadRequestException(`Failed to generate premium instant summary: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Instant Summary V2 - Lightweight summary for public/free funnel
   * 
   * Uses a simplified 5-step pipeline (NOT the full 15-step orchestrator):
   * 1. Industry Detection
   * 2. Business Summary
   * 3. Prompt Generation (limited set)
   * 4. SOV Analysis (brand only)
   * 5. GEO Score Computation
   * 
   * Designed for speed and reliability with graceful degradation.
   */
  async getInstantSummaryV2(domain: string): Promise<{
    demoRunId: string;
    workspaceId: string;
    domain: string;
    brand: string;
    industry: {
      primary: string;
      category: string;
      vertical: string;
      confidence: number;
      reasoning: string;
    };
    summary: {
      summary: string;
      targetAudience: string;
      differentiators: string[];
      confidence: number;
    };
    prompts: Array<{
      id: string;
      text: string;
      intent: string;
      industryRelevance: number;
      commercialIntent: number;
      reasoning: string;
      evidence: {
        hasBeenTested: boolean;
        testedEngines: string[];
        mentions: number;
      };
    }>;
    competitors: any[];
    shareOfVoice: any[];
    citations: any[];
    geoScore: {
      total: number;
      breakdown: {
        aiVisibility: { score: number; explanation: string };
        eeat: { score: number; explanation: string };
        citations: { score: number; explanation: string };
        schemaTechnical: { score: number; explanation: string };
      };
    };
    eeatScore: any;
    engines: Array<{ key: string; visible: boolean }>;
    status: string;
    progress: number;
    totalJobs: number;
    completedJobs: number;
  }> {
    const startTime = Date.now();
    const warnings: string[] = [];
    const normalized = this.normalizeDomain(domain);
    const brand = this.deriveBrandFromHost(normalized.host);
    const workspaceId = this.generateWorkspaceId(normalized.host);

    await this.ensureWorkspace(workspaceId, brand);

    try {
      // Step 1: Industry Detection (with fallback)
      let industryClassification: any;
      try {
        industryClassification = await this.industryDetector.detectIndustry(
          workspaceId,
          normalized.href
        );
        // Validate industry result
        if (!industryClassification?.primaryIndustry) {
          throw new Error('Industry detection returned invalid result');
        }
        if (industryClassification.confidence < 0 || industryClassification.confidence > 1) {
          warnings.push(`Invalid industry confidence: ${industryClassification.confidence}, clamping to 0-1`);
          industryClassification.confidence = Math.max(0, Math.min(1, industryClassification.confidence));
        }
      } catch (error) {
        this.logger.warn(`Industry detection failed: ${error instanceof Error ? error.message : String(error)}`);
        industryClassification = {
          primaryIndustry: 'Unknown',
          secondaryIndustries: [],
          confidence: 0.3,
          evidence: {},
        };
        warnings.push('Industry detection failed, using defaults');
      }

      // Step 2: Business Summary (with fallback)
      let businessSummary: any;
      try {
        businessSummary = await this.premiumSummary.generatePremiumSummary(
          workspaceId,
          normalized.href,
          brand
        );
        // Validate business summary
        if (!businessSummary) {
          businessSummary = { summary: 'Business information unavailable', confidence: 0.3 };
          warnings.push('Business summary returned null, using defaults');
        }
      } catch (error) {
        this.logger.warn(`Business summary failed: ${error instanceof Error ? error.message : String(error)}`);
        businessSummary = { summary: 'Business information unavailable', confidence: 0.3 };
        warnings.push('Business summary failed, using defaults');
      }

      // Step 3: Generate limited prompts (max 10 for speed) and EXECUTE them
      let prompts: any[] = [];
      let promptRecords: Array<{ id: string; text: string }> = [];
      let searchEngines: string[] = [];
      try {
        prompts = await this.evidenceBackedPrompts.generateEvidenceBackedPrompts(
          workspaceId,
          {
            brandName: brand,
            industry: industryClassification.primaryIndustry,
            category: industryClassification.primaryIndustry.split('/')[0]?.trim() || industryClassification.primaryIndustry,
            vertical: industryClassification.secondaryIndustries[0] || industryClassification.primaryIndustry,
            services: [],
            marketType: 'B2C',
            serviceType: 'Service',
          }
        );
        // Limit to 10 prompts for performance
        prompts = prompts.slice(0, 10);
        if (prompts.length === 0) {
          warnings.push('No prompts generated, visibility analysis may be limited');
        } else {
          // Save prompts to database and queue prompt runs
          await this.replaceWorkspacePrompts(
            workspaceId,
            prompts.map(p => ({ text: p.text || p, source: 'llm' as const }))
          );
          
          // Get saved prompt records
          promptRecords = await this.getDemoPrompts(workspaceId);
          
          // Ensure engines exist (use search engines: Perplexity, Brave, AIO)
          searchEngines = ['PERPLEXITY', 'BRAVE', 'AIO'].filter(engine => {
            const requirements = this.engineEnvRequirements[engine];
            return requirements && requirements.every(v => process.env[v]);
          });
          
          if (searchEngines.length > 0 && promptRecords.length > 0) {
            await this.ensureEngines(workspaceId, searchEngines);
            
            // Queue prompt runs asynchronously (don't wait for completion)
            const jobs = promptRecords.flatMap((prompt) =>
              searchEngines.map((engine) => {
                const idempotencyKey = `${workspaceId}:instant_summary:${prompt.id}:${engine}:${Date.now()}`;
                return {
                  name: 'runPrompt',
                  data: {
                    workspaceId,
                    promptId: prompt.id,
                    engineKey: engine,
                    idempotencyKey,
                    userId: 'instant-summary-user',
                  },
                  opts: {
                    removeOnComplete: { count: 100 },
                    removeOnFail: { count: 50 },
                    attempts: 3, // Retry up to 3 times with fallbacks
                  },
                };
              })
            );
            
            if (jobs.length > 0) {
              // Queue jobs asynchronously - don't block response
              this.runPromptQueue.addBulk(jobs).catch(error => {
                this.logger.warn(`Failed to queue instant summary prompt runs: ${error instanceof Error ? error.message : String(error)}`);
              });
              this.logger.log(`[Instant Summary] Queued ${jobs.length} prompt runs for ${promptRecords.length} prompts across ${searchEngines.length} engines`);
            }
          } else {
            warnings.push('No search engines available or no prompts to run');
          }
        }
      } catch (error) {
        this.logger.warn(`Prompt generation failed: ${error instanceof Error ? error.message : String(error)}`);
        warnings.push('Prompt generation failed, visibility analysis will be limited');
      }

      // Step 4: SOV Analysis (brand only, lightweight)
      let sovData: any[] = [];
      try {
        sovData = await this.evidenceBackedSOV.calculateEvidenceBackedSOV(
          workspaceId,
          [brand]
        );
        if (!Array.isArray(sovData)) {
          sovData = [];
          warnings.push('SOV analysis returned invalid format');
        }
      } catch (error) {
        this.logger.warn(`SOV analysis failed: ${error instanceof Error ? error.message : String(error)}`);
        warnings.push('SOV analysis failed, visibility snapshot may be incomplete');
      }

      // Step 5: GEO Score Computation (with fallback)
      let geoScoreResult: any;
      try {
        geoScoreResult = await this.premiumGEOScore.calculatePremiumGEOScore(
          workspaceId,
          normalized.href,
          brand,
          [],
          industryClassification.primaryIndustry
        );
        // Validate GEO Score
        if (!geoScoreResult) {
          throw new Error('GEO Score returned null');
        }
        // Sanitize GEO Score total
        if (typeof geoScoreResult.total !== 'number' || isNaN(geoScoreResult.total)) {
          warnings.push(`Invalid GEO Score total: ${geoScoreResult.total}, using 0`);
          geoScoreResult.total = 0;
        } else {
          geoScoreResult.total = Math.max(0, Math.min(100, geoScoreResult.total));
        }
        // Ensure breakdown exists
        if (!geoScoreResult.breakdown) {
          geoScoreResult.breakdown = {
            aiVisibility: { score: 0 },
            eeat: { score: 0 },
            citations: { score: 0 },
            schemaTechnical: { score: 0 },
          };
        }
      } catch (error) {
        this.logger.warn(`GEO Score computation failed: ${error instanceof Error ? error.message : String(error)}`);
        geoScoreResult = {
          total: 0,
          breakdown: {
            aiVisibility: { score: 0 },
            eeat: { score: 0 },
            citations: { score: 0 },
            schemaTechnical: { score: 0 },
          },
        };
        warnings.push('GEO Score computation failed, using defaults');
      }

      // Build visibility snapshot (with error handling per engine)
      const engines: Array<{
        key: 'chatgpt' | 'claude' | 'gemini' | 'perplexity';
        visible: boolean;
        confidence: number;
        samplePrompt?: string;
        evidenceSnippet?: string;
      }> = [];

      const engineKeys: Array<'chatgpt' | 'claude' | 'gemini' | 'perplexity'> = ['chatgpt', 'claude', 'gemini', 'perplexity'];
      
      // Map frontend engine keys to Prisma enum values
      const engineKeyMap: Record<string, string> = {
        'chatgpt': 'OPENAI',
        'claude': 'ANTHROPIC',
        'gemini': 'GEMINI',
        'perplexity': 'PERPLEXITY',
      };
      
      for (const engineKey of engineKeys) {
        try {
          // Check if brand is visible on this engine
          const mentions = await this.prisma.$queryRaw<{ count: number; snippet: string; promptText: string }>(
            `SELECT 
              COUNT(*) as count,
              MAX(m."snippet") as snippet,
              MAX(p."text") as "promptText"
            FROM "mentions" m
            JOIN "answers" a ON a.id = m."answerId"
            JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
            JOIN "prompts" p ON p.id = pr."promptId"
            JOIN "engines" e ON e.id = pr."engineId"
            WHERE pr."workspaceId" = $1
              AND LOWER(m."brand") = LOWER($2)
              AND e."key" = $3
              AND pr."status" = 'SUCCESS'
            LIMIT 1`,
            [workspaceId, brand, engineKeyMap[engineKey]]
          );

          const row = (mentions as any[])[0];
          const visible = row && parseInt(String(row.count || 0)) > 0;

          engines.push({
            key: engineKey,
            visible,
            confidence: Math.max(0, Math.min(1, visible ? 0.8 : 0.3)),
            samplePrompt: row?.promptText || undefined,
            evidenceSnippet: row?.snippet || undefined,
          });
        } catch (error) {
          this.logger.warn(`Engine visibility check failed for ${engineKey}: ${error instanceof Error ? error.message : String(error)}`);
          engines.push({
            key: engineKey,
            visible: false,
            confidence: 0.2,
          });
        }
      }

      // Build top insights (3-7 items, always meaningful)
      const topInsights: string[] = [];
      
      // GEO Score insight
      if (geoScoreResult.total < 50) {
        topInsights.push(`GEO Score is ${geoScoreResult.total}/100 - significant improvement opportunity`);
      } else if (geoScoreResult.total < 70) {
        topInsights.push(`GEO Score is ${geoScoreResult.total}/100 - good foundation with room for optimization`);
      }

      // Business summary insight
      if (businessSummary) {
        const summary = businessSummary as any;
        if (summary.summary && summary.summary.trim().length > 0) {
          const truncated = summary.summary.substring(0, 100);
          topInsights.push(`Business focus: ${truncated}${summary.summary.length > 100 ? '...' : ''}`);
        }
      }

      // Engine visibility insight
      const visibleEngines = engines.filter(e => e.visible).length;
      if (visibleEngines === 0) {
        topInsights.push('Not currently visible on any AI engines - immediate optimization needed');
      } else if (visibleEngines < 2) {
        topInsights.push(`Only visible on ${visibleEngines} AI engine(s) - expand visibility across engines`);
      } else if (visibleEngines < 4) {
        topInsights.push(`Visible on ${visibleEngines}/4 AI engines - expand to full coverage`);
      }

      // Citation insight
      const citationsScore = geoScoreResult.breakdown?.citations?.score || 0;
      if (citationsScore < 50) {
        topInsights.push('Low citation profile - build citations from authoritative sources');
      } else if (citationsScore < 70) {
        topInsights.push('Citation profile is developing - continue building authoritative citations');
      }

      // EEAT insight
      const eeatScoreValue = geoScoreResult.breakdown?.eeat?.score || 0;
      if (eeatScoreValue < 60) {
        topInsights.push('EEAT score below optimal - improve trust signals');
      }

      // Visibility component insight
      const visibilityScore = geoScoreResult.breakdown?.aiVisibility?.score || 0;
      if (visibilityScore < 50) {
        topInsights.push('AI visibility is low - focus on prompt optimization and content alignment');
      }

      // Ensure we have at least 3 insights, pad if needed
      if (topInsights.length < 3) {
        topInsights.push('Complete analysis available with full GEO Intelligence report');
        if (topInsights.length < 3) {
          topInsights.push('Sign up for detailed visibility opportunities and recommendations');
        }
      }

      // CTA hints (always provide meaningful reasons)
      const shouldSignUp = geoScoreResult.total < 70 || visibleEngines < 2 || warnings.length > 0;
      const reasons: string[] = [];
      
      if (geoScoreResult.total < 70) {
        reasons.push(`GEO Score of ${geoScoreResult.total}/100 indicates optimization opportunities`);
      }
      if (visibleEngines < 2) {
        reasons.push(`Limited visibility across AI engines (${visibleEngines}/4)`);
      }
      if (topInsights.length >= 5) {
        reasons.push(`${topInsights.length} key insights identified for improvement`);
      }
      if (warnings.length > 0) {
        reasons.push('Complete analysis requires full data collection');
      }
      
      // Always have at least one reason
      if (reasons.length === 0) {
        reasons.push('Get detailed recommendations and ongoing monitoring');
      }

      // Calculate overall confidence (degrade based on warnings)
      let overallConfidence = industryClassification.confidence * 0.9;
      if (warnings.length > 2) {
        overallConfidence *= 0.8; // Degrade if many warnings
      }
      overallConfidence = Math.max(0.3, Math.min(1, overallConfidence));

      // Get prompts with evidence status for frontend polling
      const promptRecordsWithEvidence = await Promise.all(
        promptRecords.map(async (prompt) => {
          // Check if any prompt runs have completed successfully for this prompt
          const hasEvidence = await this.prisma.$queryRaw<{ count: number }>(
            `SELECT COUNT(*)::int as count
             FROM "prompt_runs" pr
             WHERE pr."workspaceId" = $1
               AND pr."promptId" = $2
               AND pr."status" = 'SUCCESS'`,
            [workspaceId, prompt.id]
          );
          const hasBeenTested = (hasEvidence as any[])[0]?.count > 0;
          
          return {
            id: prompt.id,
            text: prompt.text,
            intent: 'buyer_intent',
            industryRelevance: 0.8,
            commercialIntent: 0.7,
            reasoning: 'Generated for instant summary analysis',
            evidence: {
              hasBeenTested,
              testedEngines: hasBeenTested ? searchEngines : [],
              mentions: hasBeenTested ? 1 : 0,
            },
          };
        })
      );

      // Get basic competitor data (empty for now, will be populated after jobs complete)
      const competitors: any[] = [];

      // Get share of voice data (empty for now, will be populated after jobs complete)
      const shareOfVoice: any[] = [];

      // Get citations (empty for now, will be populated after jobs complete)
      const citations: any[] = [];

      // Get EEAT score from geoScore breakdown
      const eeatScore = geoScoreResult.breakdown?.eeat ? {
        overall: geoScoreResult.breakdown.eeat.score || 0,
        experience: geoScoreResult.breakdown.eeat.experience || 0,
        expertise: geoScoreResult.breakdown.eeat.expertise || 0,
        authoritativeness: geoScoreResult.breakdown.eeat.authoritativeness || 0,
        trustworthiness: geoScoreResult.breakdown.eeat.trustworthiness || 0,
      } : null;

      // Count total and completed jobs
      const jobCounts = await this.prisma.$queryRaw<{ total: number; completed: number }>(
        `SELECT 
           COUNT(*)::int as total,
           SUM(CASE WHEN pr."status" = 'SUCCESS' THEN 1 ELSE 0 END)::int as completed
         FROM "prompt_runs" pr
         JOIN "prompts" p ON p.id = pr."promptId"
         WHERE pr."workspaceId" = $1
           AND p.id = ANY($2::text[])`,
        [workspaceId, promptRecords.map(p => p.id)]
      );
      const totalJobs = (jobCounts as any[])[0]?.total || 0;
      const completedJobs = (jobCounts as any[])[0]?.completed || 0;
      const progress = totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0;

      const duration = Date.now() - startTime;
      this.logger.log(`[Instant Summary V2] Generated in ${duration}ms with ${warnings.length} warnings`);

      // Return structure matching PremiumInstantSummaryData that frontend expects
      return {
        demoRunId: `instant_summary_${workspaceId}_${Date.now()}`,
        workspaceId,
        domain: normalized.href,
        brand,
        industry: {
          primary: industryClassification.primaryIndustry || 'Unknown',
          category: industryClassification.primaryIndustry?.split('/')[0]?.trim() || industryClassification.primaryIndustry || 'Unknown',
          vertical: industryClassification.secondaryIndustries?.[0] || industryClassification.primaryIndustry || 'Unknown',
          confidence: Math.max(0, Math.min(1, industryClassification.confidence || 0.3)),
          reasoning: industryClassification.reasoning || 'Industry detected from domain analysis',
        },
        summary: {
          summary: businessSummary 
            ? ((businessSummary as any).summary?.substring(0, 500) || 'Business information')
            : 'Business information unavailable',
          targetAudience: (businessSummary as any)?.targetAudience || 'Customers',
          differentiators: (businessSummary as any)?.differentiators || [],
          confidence: (businessSummary as any)?.confidence || 0.5,
        },
        prompts: promptRecordsWithEvidence,
        competitors,
        shareOfVoice,
        citations,
        geoScore: {
          total: Math.max(0, Math.min(100, geoScoreResult.total)), // Frontend expects .total, not .overall
          breakdown: {
            aiVisibility: {
              score: Math.max(0, Math.min(100, geoScoreResult.breakdown?.aiVisibility?.score || 0)),
              explanation: geoScoreResult.breakdown?.aiVisibility?.explanation || 'AI visibility analysis',
            },
            eeat: {
              score: Math.max(0, Math.min(100, geoScoreResult.breakdown?.eeat?.score || 0)),
              explanation: geoScoreResult.breakdown?.eeat?.explanation || 'EEAT analysis',
            },
            citations: {
              score: Math.max(0, Math.min(100, geoScoreResult.breakdown?.citations?.score || 0)),
              explanation: geoScoreResult.breakdown?.citations?.explanation || 'Citation analysis',
            },
            schemaTechnical: {
              score: Math.max(0, Math.min(100, geoScoreResult.breakdown?.schemaTechnical?.score || 0)),
              explanation: geoScoreResult.breakdown?.schemaTechnical?.explanation || 'Schema and technical analysis',
            },
          },
        },
        eeatScore,
        engines: engines.map(e => ({ key: e.key, visible: e.visible })),
        status: completedJobs === totalJobs && totalJobs > 0 ? 'analysis_complete' : 'analysis_running',
        progress,
        totalJobs,
        completedJobs,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`[Instant Summary V2] Failed after ${duration}ms: ${error instanceof Error ? error.message : String(error)}`);
      
      // Return degraded but usable response matching PremiumInstantSummaryData structure
      return {
        demoRunId: `instant_summary_error_${Date.now()}`,
        workspaceId,
        domain: normalized.href,
        brand,
        industry: {
          primary: 'Unknown',
          category: 'Unknown',
          vertical: 'Unknown',
          confidence: 0.2,
          reasoning: 'Analysis failed',
        },
        summary: {
          summary: 'Unable to generate business summary',
          targetAudience: 'Customers',
          differentiators: [],
          confidence: 0.2,
        },
        prompts: [],
        competitors: [],
        shareOfVoice: [],
        citations: [],
        geoScore: {
          total: 0,
          breakdown: {
            aiVisibility: { score: 0, explanation: 'GEO Score unavailable due to data collection issues' },
            eeat: { score: 0, explanation: 'EEAT analysis unavailable' },
            citations: { score: 0, explanation: 'Citation analysis unavailable' },
            schemaTechnical: { score: 0, explanation: 'Schema analysis unavailable' },
          },
        },
        eeatScore: null,
        engines: ['chatgpt', 'claude', 'gemini', 'perplexity'].map(key => ({
          key: key as 'chatgpt' | 'claude' | 'gemini' | 'perplexity',
          visible: false,
        })),
        status: 'error',
        progress: 0,
        totalJobs: 0,
        completedJobs: 0,
      };
    }
  }

  /**
   * Generate GEO Score explanation for Instant Summary
   */
  private generateGEOScoreExplanation(geoScoreResult: any): string {
    const total = geoScoreResult?.total || 0;
    const parts: string[] = [`GEO Score: ${total}/100`];
    
    if (geoScoreResult?.breakdown) {
      const breakdown = geoScoreResult.breakdown;
      const components: string[] = [];
      
      if (breakdown.aiVisibility?.score !== undefined) {
        components.push(`Visibility: ${breakdown.aiVisibility.score}`);
      }
      if (breakdown.eeat?.score !== undefined) {
        components.push(`Trust: ${breakdown.eeat.score}`);
      }
      if (breakdown.citations?.score !== undefined) {
        components.push(`Citations: ${breakdown.citations.score}`);
      }
      
      if (components.length > 0) {
        parts.push(`Components: ${components.join(', ')}`);
      }
    }
    
    return parts.join('. ');
  }

  /**
   * Get Full Intelligence (Public Test Endpoint)
   * Returns the complete GEOIntelligenceResponse for testing without auth
   */
  async getFullIntelligence(domain: string): Promise<any> {
    try {
      if (!this.orchestrator) {
        throw new BadRequestException('Orchestrator not available. This endpoint requires GEO module integration.');
      }

      const normalized = this.normalizeDomain(domain);
      const brandName = this.deriveBrandFromHost(normalized.host);
      const workspaceId = this.generateWorkspaceId(normalized.host);
      
      // Ensure workspace exists
      await this.ensureWorkspace(workspaceId, brandName);

      // Call orchestrator with all intelligence steps
      const intelligence = await this.orchestrator.orchestrateIntelligence(
        workspaceId,
        brandName,
        normalized.href,
        {
          includeOpportunities: true,
          includeRecommendations: true,
          maxOpportunities: 20,
        }
      );

      return intelligence;
    } catch (error) {
      this.logger.error(`Full intelligence failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new BadRequestException(`Failed to generate full intelligence: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}


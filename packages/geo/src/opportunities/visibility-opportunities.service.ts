/**
 * Comprehensive Visibility Opportunities Service
 * 
 * The AI Search Console for any business - identifying WHY they do not appear in AI results,
 * WHO is winning, HOW they're losing, what they need to FIX, and EXACTLY HOW MUCH improvement
 * they can unlock.
 * 
 * This service generates exhaustive, evidence-backed, competitor-aware, industry-contextual,
 * actionable visibility opportunities.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { LLMRouterService } from '@ai-visibility/shared';
import { VisibilityOpportunity, PromptCluster } from '../types/diagnostic.types';
import { IndustryDetectorService, IndustryContext } from '../industry/industry-detector.service';
import { PremiumBusinessSummaryService } from '../summary/premium-business-summary.service';
import { EvidenceCollectorService } from '../evidence/evidence-collector.service';
import { EvidenceBackedPromptGeneratorService } from '../prompts/evidence-backed-prompt-generator.service';
import { PremiumCompetitorDetectorService } from '../competitors/premium-competitor-detector.service';
import { EvidenceBackedShareOfVoiceService } from '../sov/evidence-backed-sov.service';
import { PremiumCitationService } from '../citations/premium-citation-service';
import { PremiumGEOScoreService } from '../scoring/premium-geo-score.service';
import { SchemaAuditorService } from '../structural/schema-auditor';
import { EEATCalculatorService } from '../trust/eeat-calculator.service';
import { PromptClusterService } from '../prompts/prompt-cluster.service';
import { EnginePatternService } from '../patterns/engine-pattern.service';
import { CommercialValueImpactService } from '../value/commercial-value.service';
import { CompetitorAdvantageService } from '../competitors/competitor-advantage.service';
import { TrustFailureService } from '../trust/trust-failure.service';
import { FixDifficultyService } from '../difficulty/fix-difficulty.service';

@Injectable()
export class VisibilityOpportunitiesService {
  private readonly logger = new Logger(VisibilityOpportunitiesService.name);
  private dbPool: Pool;

  constructor(
    private readonly llmRouter: LLMRouterService,
    private readonly industryDetector: IndustryDetectorService,
    private readonly businessSummary: PremiumBusinessSummaryService,
    private readonly evidenceCollector: EvidenceCollectorService,
    private readonly promptGenerator: EvidenceBackedPromptGeneratorService,
    private readonly competitorDetector: PremiumCompetitorDetectorService,
    private readonly shareOfVoice: EvidenceBackedShareOfVoiceService,
    private readonly citationService: PremiumCitationService,
    private readonly geoScore: PremiumGEOScoreService,
    private readonly schemaAuditor: SchemaAuditorService,
    private readonly eeatCalculator: EEATCalculatorService,
    private readonly promptCluster: PromptClusterService,
    private readonly enginePattern: EnginePatternService,
    private readonly commercialValue: CommercialValueImpactService,
    private readonly competitorAdvantage: CompetitorAdvantageService,
    private readonly trustFailure: TrustFailureService,
    private readonly fixDifficulty: FixDifficultyService,
  ) {
    this.dbPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
  }

  /**
   * Generate comprehensive visibility opportunities for a workspace
   * 
   * This is the main entry point that orchestrates all the analysis steps:
   * 1. Generate industry-specific prompt clusters
   * 2. Compute share of voice + evidence
   * 3. Score opportunities
   * 4. Analyze competitor gaps
   * 5. Identify root causes
   * 6. Output detailed recommendations
   * 7. Assign confidence + warnings
   */
  async generateOpportunities(
    workspaceId: string,
    brandName: string,
    domain: string,
    options: {
      maxOpportunities?: number;
      minValueScore?: number;
      includeLowConfidence?: boolean;
    } = {}
  ): Promise<VisibilityOpportunity[]> {
    const { maxOpportunities = 50, minValueScore = 20, includeLowConfidence = false } = options;

    this.logger.log(`Generating visibility opportunities for workspace ${workspaceId} (${brandName})`);

    try {
      // Step 1: Get industry context
      const industryContext = await this.getIndustryContext(workspaceId, domain, brandName);
      this.logger.log(`Detected industry: ${industryContext.industry}`);

      // Step 2: Generate industry-specific prompt clusters (using LLM reasoning-based clustering)
      const basePrompts = await this.promptGenerator.generateEvidenceBackedPrompts(
        workspaceId,
        {
          brandName,
          industry: industryContext.industry,
          category: industryContext.category,
          vertical: industryContext.vertical,
          services: [],
          marketType: industryContext.marketType,
          serviceType: industryContext.serviceType,
        }
      );
      
      const promptClusters = await this.promptCluster.clusterPrompts(
        workspaceId,
        brandName,
        basePrompts.map(p => p.text),
        industryContext.industry
      );
      this.logger.log(`Generated ${promptClusters.length} prompt clusters`);

      // Step 3: For each prompt cluster, compute visibility and evidence
      const opportunities: VisibilityOpportunity[] = [];

      for (const cluster of promptClusters) {
        try {
          const opportunity = await this.analyzePromptCluster(
            workspaceId,
            brandName,
            cluster,
            industryContext
          );

          if (opportunity) {
            // Filter by minimum value score
            if (opportunity.value >= minValueScore) {
              // Filter by confidence if needed
              if (includeLowConfidence || opportunity.confidence >= 0.5) {
                opportunities.push(opportunity);
              }
            }
          }
        } catch (error) {
          this.logger.warn(`Failed to analyze prompt cluster "${cluster.title}": ${error instanceof Error ? error.message : String(error)}`);
          // Continue with other clusters
        }
      }

      // Step 4: Sort by opportunity score (value * impact * (1 - difficulty))
      opportunities.sort((a, b) => {
        const scoreA = a.value * a.opportunityImpact * (1 - a.difficulty / 100);
        const scoreB = b.value * b.opportunityImpact * (1 - b.difficulty / 100);
        return scoreB - scoreA;
      });

      // Step 5: Limit to max opportunities
      const finalOpportunities = opportunities.slice(0, maxOpportunities);

      this.logger.log(`Generated ${finalOpportunities.length} visibility opportunities`);

      return finalOpportunities;
    } catch (error) {
      this.logger.error(`Failed to generate opportunities: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Step 1: Get industry context
   */
  private async getIndustryContext(
    workspaceId: string,
    domain: string,
    brandName: string
  ): Promise<IndustryContext> {
    const classification = await this.industryDetector.detectIndustry(workspaceId, domain);
    
    // Map to IndustryContext format
    return {
      industry: classification.primaryIndustry,
      category: classification.primaryIndustry.split('/')[0]?.trim() || classification.primaryIndustry,
      vertical: classification.secondaryIndustries[0] || classification.primaryIndustry,
      marketType: this.inferMarketType(classification.primaryIndustry),
      serviceType: this.inferServiceType(classification.primaryIndustry),
      geographicScope: 'Global', // Could be enhanced with domain analysis
    };
  }

  /**
   * Step 2: Generate industry-specific prompt clusters
   */
  private async generateIndustryPromptClusters(
    workspaceId: string,
    brandName: string,
    industryContext: IndustryContext
  ): Promise<Array<{ title: string; prompts: string[]; intent: string }>> {
    // Generate base prompts using the prompt generator
    const basePrompts = await this.promptGenerator.generateEvidenceBackedPrompts(
      workspaceId,
      {
        brandName,
        industry: industryContext.industry,
        category: industryContext.category,
        vertical: industryContext.vertical,
        services: [], // Will be populated from business summary if available
        marketType: industryContext.marketType,
        serviceType: industryContext.serviceType,
        geography: industryContext.geographicScope === 'Local' || industryContext.geographicScope === 'Regional'
          ? { primary: 'Local', serviceAreas: [] }
          : undefined,
      }
    );

    // Enhance with industry-specific keywords and competitor language
    const enhancedPrompts = this.enhancePromptsWithIndustryContext(
      basePrompts.map(p => p.text),
      industryContext
    );

    // Cluster prompts by intent and similarity
    const clusters = this.clusterPrompts(enhancedPrompts, industryContext);

    return clusters;
  }

  /**
   * Step 3: Analyze a single prompt cluster to create an opportunity
   * Now integrates all new intelligence engines
   */
  private async analyzePromptCluster(
    workspaceId: string,
    brandName: string,
    cluster: PromptCluster,
    industryContext: IndustryContext
  ): Promise<VisibilityOpportunity | null> {
    // Get visibility per engine for this cluster
    const aiVisibility = await this.computeAIVisibility(workspaceId, brandName, cluster.prompts);

    // Get competitors and their positions
    const competitors = await this.analyzeCompetitorsForCluster(
      workspaceId,
      brandName,
      cluster.prompts
    );

    // Get evidence per engine
    const evidence = await this.collectEvidencePerEngine(workspaceId, brandName, cluster.prompts);

    // NEW: Get commercial value impact
    const commercialValue = await this.commercialValue.calculateCommercialValue(
      workspaceId,
      brandName,
      cluster.prompts,
      industryContext.industry
    );

    // NEW: Get cross-engine patterns
    const crossEnginePatterns = await this.enginePattern.analyzeCrossEnginePatterns(
      workspaceId,
      brandName,
      cluster.prompts
    );

    // NEW: Get competitor advantage analysis for top competitors
    const competitorAdvantages = await Promise.all(
      competitors.slice(0, 3).map(comp =>
        this.competitorAdvantage.analyzeCompetitorAdvantage(
          workspaceId,
          brandName,
          comp.name,
          cluster.prompts
        )
      )
    );

    // NEW: Get trust failures
    const trustFailures = await this.trustFailure.detectTrustFailures(workspaceId, brandName);

    // NEW: Get fix difficulty
    const fixDifficulty = await this.fixDifficulty.calculateFixDifficulty(
      workspaceId,
      brandName,
      cluster.title,
      cluster.prompts
    );

    // Calculate scores (use cluster values if available, otherwise calculate)
    const opportunityImpact = cluster.expectedGEOScoreLift
      ? Math.round((cluster.expectedGEOScoreLift.min + cluster.expectedGEOScoreLift.max) / 2)
      : this.calculateOpportunityImpact(aiVisibility, competitors);
    
    const difficulty = cluster.difficulty || this.calculateDifficulty(competitors, aiVisibility, industryContext);
    const value = cluster.value || commercialValue.commercialOpportunityScore;

    // Identify root causes (enhanced with trust failures)
    const whyYouAreLosing = await this.identifyRootCausesEnhanced(
      workspaceId,
      brandName,
      cluster,
      aiVisibility,
      competitors,
      evidence,
      trustFailures,
      competitorAdvantages
    );

    // Generate action steps (enhanced with fix difficulty)
    const actionSteps = await this.generateActionStepsEnhanced(
      workspaceId,
      brandName,
      cluster,
      whyYouAreLosing,
      industryContext,
      fixDifficulty,
      trustFailures
    );

    // Calculate confidence (enhanced with all data sources)
    const confidence = this.calculateConfidenceEnhanced(
      evidence,
      competitors,
      aiVisibility,
      commercialValue,
      crossEnginePatterns
    );

    // Generate warnings (enhanced)
    const warnings = this.generateWarningsEnhanced(
      evidence,
      competitors,
      aiVisibility,
      confidence,
      trustFailures,
      crossEnginePatterns
    );

    // Estimate GEO Score impact (use cluster data if available)
    const geoScoreImpact = cluster.expectedGEOScoreLift || this.estimateGEOScoreImpact(
      opportunityImpact,
      value,
      difficulty,
      aiVisibility
    );

    return {
      title: cluster.title,
      aiVisibility,
      competitors,
      whyYouAreLosing,
      opportunityImpact,
      difficulty,
      value,
      actionSteps,
      evidence,
      confidence,
      warnings,
      geoScoreImpact,
    };
  }

  /**
   * Enhanced root cause identification with trust failures and competitor advantages
   */
  private async identifyRootCausesEnhanced(
    workspaceId: string,
    brandName: string,
    cluster: PromptCluster,
    aiVisibility: VisibilityOpportunity['aiVisibility'],
    competitors: VisibilityOpportunity['competitors'],
    evidence: VisibilityOpportunity['evidence'],
    trustFailures: any[],
    competitorAdvantages: any[]
  ): Promise<string> {
    const causes: string[] = [];

    // Use cluster root cause if available
    if (cluster.rootCause) {
      causes.push(cluster.rootCause);
    }

    // Add trust failure causes
    const relevantTrustFailures = trustFailures.filter(tf => tf.severity > 50);
    for (const failure of relevantTrustFailures.slice(0, 3)) {
      causes.push(`${failure.category}: ${failure.description}`);
    }

    // Add competitor advantage causes
    if (competitorAdvantages.length > 0) {
      const topCompetitor = competitorAdvantages[0];
      if (topCompetitor.structuralAdvantageScore > 70) {
        causes.push(`${topCompetitor.competitor} dominates with structural advantage score ${topCompetitor.structuralAdvantageScore}/100`);
      }
    }

    // Add existing root cause analysis
    const existingCauses = await this.identifyRootCauses(
      workspaceId,
      brandName,
      cluster,
      aiVisibility,
      competitors,
      evidence
    );
    causes.push(existingCauses);

    return causes.join(' ');
  }

  /**
   * Enhanced action steps generation with fix difficulty and trust failures
   */
  private async generateActionStepsEnhanced(
    workspaceId: string,
    brandName: string,
    cluster: PromptCluster,
    whyYouAreLosing: string,
    industryContext: IndustryContext,
    fixDifficulty: any,
    trustFailures: any[]
  ): Promise<string[]> {
    const steps: string[] = [];

    // Use cluster content gaps if available
    if (cluster.contentGaps.length > 0) {
      steps.push(...cluster.contentGaps.slice(0, 3));
    }

    // Add steps from fix difficulty primary constraints
    if (fixDifficulty.primaryConstraints.length > 0) {
      steps.push(...fixDifficulty.primaryConstraints.slice(0, 2));
    }

    // Add steps from trust failures
    for (const failure of trustFailures.slice(0, 2)) {
      if (failure.recommendedFixes.length > 0) {
        steps.push(...failure.recommendedFixes.slice(0, 1));
      }
    }

    // Add existing action steps
    const existingSteps = await this.generateActionSteps(
      workspaceId,
      brandName,
      cluster,
      whyYouAreLosing,
      industryContext
    );
    steps.push(...existingSteps);

    // Remove duplicates and limit
    return [...new Set(steps)].slice(0, 7);
  }

  /**
   * Enhanced confidence calculation
   */
  private calculateConfidenceEnhanced(
    evidence: VisibilityOpportunity['evidence'],
    competitors: VisibilityOpportunity['competitors'],
    aiVisibility: VisibilityOpportunity['aiVisibility'],
    commercialValue: any,
    crossEnginePatterns: any
  ): number {
    let confidence = this.calculateConfidence(evidence, competitors, aiVisibility);

    // Boost confidence with commercial value data
    if (commercialValue.confidence > 0.7) {
      confidence += 0.1;
    }

    // Boost confidence with cross-engine pattern data
    const avgEngineConfidence = (
      crossEnginePatterns.engineConfidence.chatgpt +
      crossEnginePatterns.engineConfidence.claude +
      crossEnginePatterns.engineConfidence.gemini +
      crossEnginePatterns.engineConfidence.perplexity
    ) / 4;
    if (avgEngineConfidence > 0.7) {
      confidence += 0.1;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Enhanced warnings generation
   */
  private generateWarningsEnhanced(
    evidence: VisibilityOpportunity['evidence'],
    competitors: VisibilityOpportunity['competitors'],
    aiVisibility: VisibilityOpportunity['aiVisibility'],
    confidence: number,
    trustFailures: any[],
    crossEnginePatterns: any
  ): string[] {
    const warnings = this.generateWarnings(evidence, competitors, aiVisibility, confidence);

    // Add warnings from trust failures
    if (trustFailures.length > 5) {
      warnings.push(`Multiple trust failures detected (${trustFailures.length}). Address these to improve visibility.`);
    }

    // Add warnings from cross-engine patterns
    if (crossEnginePatterns.consistencyPattern.consistencyScore < 40) {
      warnings.push(`Low cross-engine consistency (${crossEnginePatterns.consistencyPattern.consistencyScore}%). Visibility varies significantly across engines.`);
    }

    return warnings;
  }

  /**
   * Compute AI visibility per engine for a set of prompts
   */
  private async computeAIVisibility(
    workspaceId: string,
    brandName: string,
    prompts: string[]
  ): Promise<VisibilityOpportunity['aiVisibility']> {
    const engines = ['CHATGPT', 'CLAUDE', 'GEMINI', 'PERPLEXITY'];
    const visibility: VisibilityOpportunity['aiVisibility'] = {
      chatgpt: 0,
      claude: 0,
      gemini: 0,
      perplexity: 0,
      weighted: 0,
    };

    // Engine weights (can be adjusted based on market share)
    const engineWeights = {
      chatgpt: 0.35,
      claude: 0.25,
      gemini: 0.20,
      perplexity: 0.20,
    };

    for (const engine of engines) {
      const engineKey = engine.toLowerCase() as keyof typeof visibility;
      
      // Query database for mentions across these prompts
      const result = await this.dbPool.query<{
        count: number;
        totalPrompts: number;
      }>(
        `SELECT 
          COUNT(DISTINCT m.id) as count,
          COUNT(DISTINCT pr."promptId") as "totalPrompts"
        FROM "mentions" m
        JOIN "answers" a ON a.id = m."answerId"
        JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
        JOIN "prompts" p ON p.id = pr."promptId"
        JOIN "engines" e ON e.id = pr."engineId"
        WHERE pr."workspaceId" = $1
          AND LOWER(m."brand") = LOWER($2)
          AND e."key" = $3
          AND pr."status" = 'SUCCESS'
          AND p."text" = ANY($4::text[])`,
        [workspaceId, brandName, engine, prompts]
      );

      const row = result.rows[0];
      if (row && row.totalPrompts > 0) {
        // Visibility = (mentions found / prompts tested) * 100
        visibility[engineKey] = Math.round((row.count / row.totalPrompts) * 100);
      }
    }

    // Calculate weighted average
    visibility.weighted = Math.round(
      visibility.chatgpt * engineWeights.chatgpt +
      visibility.claude * engineWeights.claude +
      visibility.gemini * engineWeights.gemini +
      visibility.perplexity * engineWeights.perplexity
    );

    return visibility;
  }

  /**
   * Analyze competitors for a prompt cluster
   */
  private async analyzeCompetitorsForCluster(
    workspaceId: string,
    brandName: string,
    prompts: string[]
  ): Promise<VisibilityOpportunity['competitors']> {
    const competitors: VisibilityOpportunity['competitors'] = [];

    // Get all competitors found in these prompts
    const result = await this.dbPool.query<{
      brand: string;
      engine: string;
      position: number;
      sentiment: string;
      snippet: string;
      promptText: string;
    }>(
      `SELECT 
        m."brand",
        e."key" as engine,
        m."position",
        m."sentiment",
        m."snippet",
        p."text" as "promptText"
      FROM "mentions" m
      JOIN "answers" a ON a.id = m."answerId"
      JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
      JOIN "prompts" p ON p.id = pr."promptId"
      JOIN "engines" e ON e.id = pr."engineId"
      WHERE pr."workspaceId" = $1
        AND LOWER(m."brand") != LOWER($2)
        AND pr."status" = 'SUCCESS'
        AND p."text" = ANY($3::text[])
      ORDER BY m."position" ASC`,
      [workspaceId, brandName, prompts]
    );

    // Group by competitor brand
    const competitorMap = new Map<string, {
      name: string;
      engines: { chatgpt: number; claude: number; gemini: number; perplexity: number };
      positions: number[];
      sentiments: string[];
      snippets: string[];
    }>();

    for (const row of result.rows) {
      const brand = row.brand;
      if (!competitorMap.has(brand)) {
        competitorMap.set(brand, {
          name: brand,
          engines: { chatgpt: 0, claude: 0, gemini: 0, perplexity: 0 },
          positions: [],
          sentiments: [],
          snippets: [],
        });
      }

      const comp = competitorMap.get(brand)!;
      const engineKey = row.engine.toLowerCase() as 'chatgpt' | 'claude' | 'gemini' | 'perplexity';
      
      // Track best position per engine
      if (comp.engines[engineKey] === 0 || (row.position > 0 && row.position < comp.engines[engineKey])) {
        comp.engines[engineKey] = row.position || 999;
      }

      if (row.position) comp.positions.push(row.position);
      comp.sentiments.push(row.sentiment);
      comp.snippets.push(row.snippet);
    }

    // Convert to competitor array
    for (const [brand, data] of competitorMap.entries()) {
      // Calculate rank strength (inverse of average position, normalized)
      const avgPosition = data.positions.length > 0
        ? data.positions.reduce((sum, p) => sum + p, 0) / data.positions.length
        : 999;
      const rankStrength = Math.max(0, Math.min(100, Math.round((1 / avgPosition) * 100 * 10)));

      // Determine sentiment (most common)
      const sentimentCounts = {
        POS: data.sentiments.filter(s => s === 'POS').length,
        NEU: data.sentiments.filter(s => s === 'NEU').length,
        NEG: data.sentiments.filter(s => s === 'NEG').length,
      };
      const sentiment = sentimentCounts.POS > sentimentCounts.NEG ? 'positive' :
                        sentimentCounts.NEG > sentimentCounts.POS ? 'negative' : 'neutral';

      // Get best evidence snippet
      const evidenceSnippet = data.snippets[0] || 'No evidence snippet available';

      // Calculate confidence based on data completeness
      const enginesFound = Object.values(data.engines).filter(p => p > 0 && p < 999).length;
      const confidence = Math.min(1, enginesFound / 4 + (data.positions.length > 0 ? 0.3 : 0));

      competitors.push({
        name: brand,
        rankStrength,
        sentiment,
        evidenceSnippet,
        engines: data.engines,
        confidence,
      });
    }

    // Sort by rank strength (best first)
    competitors.sort((a, b) => b.rankStrength - a.rankStrength);

    return competitors;
  }

  /**
   * Collect evidence per engine
   */
  private async collectEvidencePerEngine(
    workspaceId: string,
    brandName: string,
    prompts: string[]
  ): Promise<VisibilityOpportunity['evidence']> {
    const evidence: VisibilityOpportunity['evidence'] = {
      chatgpt: [],
      claude: [],
      gemini: [],
      perplexity: [],
    };

    const engines = ['CHATGPT', 'CLAUDE', 'GEMINI', 'PERPLEXITY'];

    for (const engine of engines) {
      const engineKey = engine.toLowerCase() as keyof typeof evidence;

      const result = await this.dbPool.query<{
        snippet: string;
        answerText: string;
      }>(
        `SELECT 
          m."snippet",
          a."text" as "answerText"
        FROM "mentions" m
        JOIN "answers" a ON a.id = m."answerId"
        JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
        JOIN "prompts" p ON p.id = pr."promptId"
        JOIN "engines" e ON e.id = pr."engineId"
        WHERE pr."workspaceId" = $1
          AND e."key" = $2
          AND pr."status" = 'SUCCESS'
          AND p."text" = ANY($3::text[])
        ORDER BY m."position" ASC
        LIMIT 10`,
        [workspaceId, engine, prompts]
      );

      evidence[engineKey] = result.rows.map(r => r.snippet || r.answerText.substring(0, 200));
    }

    return evidence;
  }

  /**
   * Calculate opportunity impact score (0-100%)
   */
  private calculateOpportunityImpact(
    aiVisibility: VisibilityOpportunity['aiVisibility'],
    competitors: VisibilityOpportunity['competitors']
  ): number {
    // Impact = how much room for improvement
    const currentVisibility = aiVisibility.weighted;
    const maxPossible = 100;
    const impact = maxPossible - currentVisibility;

    // Boost impact if competitors are dominating
    const competitorDominance = competitors.length > 0
      ? competitors.reduce((sum, c) => sum + c.rankStrength, 0) / competitors.length
      : 0;

    // If competitors are strong, there's more opportunity to displace them
    const adjustedImpact = Math.min(100, impact + (competitorDominance * 0.2));

    return Math.round(adjustedImpact);
  }

  /**
   * Calculate difficulty score (0-100%)
   */
  private calculateDifficulty(
    competitors: VisibilityOpportunity['competitors'],
    aiVisibility: VisibilityOpportunity['aiVisibility'],
    industryContext: IndustryContext
  ): number {
    let difficulty = 0;

    // Base difficulty from current visibility (lower visibility = harder to improve)
    difficulty += (100 - aiVisibility.weighted) * 0.3;

    // Competitor entrenchment
    if (competitors.length > 0) {
      const avgCompetitorStrength = competitors.reduce((sum, c) => sum + c.rankStrength, 0) / competitors.length;
      difficulty += avgCompetitorStrength * 0.4;
    }

    // Number of engines to fix
    const enginesNeedingWork = Object.values(aiVisibility).filter(v => v < 50).length;
    difficulty += enginesNeedingWork * 10;

    // Industry-specific difficulty adjustments
    if (industryContext.marketType === 'B2B') {
      difficulty += 10; // B2B is generally harder
    }

    return Math.min(100, Math.round(difficulty));
  }

  /**
   * Calculate value score (0-100%) - industry-adjusted
   */
  private calculateValue(
    cluster: { title: string; prompts: string[]; intent: string },
    industryContext: IndustryContext,
    aiVisibility: VisibilityOpportunity['aiVisibility']
  ): number {
    let value = 50; // Base value

    // Intent-based value adjustments
    const intent = cluster.intent.toLowerCase();
    if (intent.includes('best') || intent.includes('top') || intent.includes('recommend')) {
      value += 20; // High commercial intent
    }
    if (intent.includes('comparison') || intent.includes('vs') || intent.includes('alternative')) {
      value += 15; // Comparison queries are high value
    }
    if (intent.includes('local') || intent.includes('near me')) {
      value += industryContext.geographicScope === 'Local' ? 25 : 10;
    }

    // Industry-specific value adjustments
    if (industryContext.industry.includes('OTA') || industryContext.industry.includes('Travel')) {
      // OTAs: comparison + "best" queries are highest value
      if (intent.includes('comparison') || intent.includes('best')) {
        value += 20;
      }
    } else if (industryContext.industry.includes('Local') || industryContext.industry.includes('Service')) {
      // Local services: "near me" queries are highest value
      if (intent.includes('local') || intent.includes('near me')) {
        value += 25;
      }
    } else if (industryContext.industry.includes('SaaS') || industryContext.industry.includes('Software')) {
      // SaaS: "alternatives" queries are highest value
      if (intent.includes('alternative') || intent.includes('vs')) {
        value += 20;
      }
    } else if (industryContext.industry.includes('E-commerce') || industryContext.industry.includes('Retail')) {
      // E-commerce: category keywords are highest value
      value += 15;
    }

    // Adjust based on current visibility (low visibility + high value = high opportunity value)
    if (aiVisibility.weighted < 30) {
      value += 10; // Low visibility makes it more valuable to fix
    }

    return Math.min(100, Math.round(value));
  }

  /**
   * Identify root causes for why you're losing
   */
  private async identifyRootCauses(
    workspaceId: string,
    brandName: string,
    cluster: { title: string; prompts: string[]; intent: string },
    aiVisibility: VisibilityOpportunity['aiVisibility'],
    competitors: VisibilityOpportunity['competitors'],
    evidence: VisibilityOpportunity['evidence']
  ): Promise<string> {
    const causes: string[] = [];

    // Check for missing citations
    const citationResult = await this.dbPool.query<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM "citations" c
       JOIN "prompt_runs" pr ON pr."workspaceId" = $1
       WHERE c."workspaceId" = $1
         AND c."brand" = $2`,
      [workspaceId, brandName]
    );
    const citationCount = citationResult.rows[0]?.count || 0;
    if (citationCount < 10) {
      causes.push(`Missing citations: Only ${citationCount} citations found. Competitors likely have more authoritative citations.`);
    }

    // Check schema gaps (query database for schema-related data)
    try {
      // Check if workspace has any schema-related data in citations or other sources
      const schemaResult = await this.dbPool.query<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM "citations" c
         WHERE c."workspaceId" = $1
           AND (c."sourceType" LIKE '%schema%' OR c."url" LIKE '%schema.org%')`,
        [workspaceId]
      );
      const schemaCount = schemaResult.rows[0]?.count || 0;
      if (schemaCount === 0) {
        causes.push(`Schema gaps: No schema.org markup detected in citations. Missing structured data markup.`);
      }
    } catch (error) {
      // Schema check might fail, continue
    }

    // Check EEAT deficiencies
    try {
      const eeatScore = await this.eeatCalculator.calculateEEATScore(workspaceId);
      if (eeatScore.overall < 60) {
        causes.push(`EEAT deficiencies: Overall EEAT score is ${eeatScore.overall}/100. Low expertise, experience, authoritativeness, or trustworthiness.`);
      }
    } catch (error) {
      // EEAT calculation might fail, continue
    }

    // Check for lack of topical coverage
    const evidenceCount = Object.values(evidence).reduce((sum, arr) => sum + arr.length, 0);
    if (evidenceCount === 0) {
      causes.push(`Lack of topical coverage: No evidence found for this prompt cluster. Content may not address these queries.`);
    }

    // Check competitor dominance
    if (competitors.length > 0) {
      const topCompetitor = competitors[0];
      if (topCompetitor.rankStrength > 70) {
        causes.push(`Competitor dominance: ${topCompetitor.name} is strongly positioned (rank strength: ${topCompetitor.rankStrength}) across multiple engines.`);
      }
    }

    // Check engine-specific issues
    const lowVisibilityEngines = Object.entries(aiVisibility)
      .filter(([key, value]) => key !== 'weighted' && value < 20)
      .map(([key]) => key.toUpperCase());
    if (lowVisibilityEngines.length > 0) {
      causes.push(`Low visibility on specific engines: ${lowVisibilityEngines.join(', ')} show 0% visibility.`);
    }

    // If no specific causes found, provide generic analysis
    if (causes.length === 0) {
      causes.push(`General visibility gap: Current weighted visibility is ${aiVisibility.weighted}%. Multiple factors likely contributing including content gaps, citation authority, and competitor positioning.`);
    }

    return causes.join(' ');
  }

  /**
   * Generate actionable steps
   */
  private async generateActionSteps(
    workspaceId: string,
    brandName: string,
    cluster: { title: string; prompts: string[]; intent: string },
    whyYouAreLosing: string,
    industryContext: IndustryContext
  ): Promise<string[]> {
    const steps: string[] = [];

    // Intent-specific steps
    const intent = cluster.intent.toLowerCase();
    
    if (intent.includes('comparison') || intent.includes('vs')) {
      steps.push(`Create comparison pages: "${brandName} vs [Competitor]" for top competitors in this category`);
      steps.push(`Add structured comparison schema (Product, Service, or Organization comparison markup)`);
    }

    if (intent.includes('best') || intent.includes('top') || intent.includes('recommend')) {
      steps.push(`Create "Best [Category]" content targeting: ${cluster.title}`);
      steps.push(`Add FAQ schema addressing "What is the best [category]?" questions`);
      steps.push(`Build citations from authoritative industry publications and review sites`);
    }

    if (intent.includes('local') || intent.includes('near me')) {
      steps.push(`Optimize local SEO: Ensure Google Business Profile is complete and verified`);
      steps.push(`Add LocalBusiness schema with complete location and service area data`);
      steps.push(`Build local citations from regional directories and local news sites`);
    }

    // General steps based on root causes
    if (whyYouAreLosing.includes('citations')) {
      steps.push(`Acquire citations from top ${industryContext.industry} publishers and industry directories`);
      steps.push(`Build relationships with industry publications for mention opportunities`);
    }

    if (whyYouAreLosing.includes('schema')) {
      steps.push(`Implement comprehensive schema markup: Organization, Product/Service, FAQ, HowTo, Review schema`);
      steps.push(`Add industry-specific schema (e.g., Hotel, Restaurant, LocalBusiness based on industry)`);
    }

    if (whyYouAreLosing.includes('EEAT')) {
      steps.push(`Strengthen EEAT signals: Add author bylines, expert credentials, case studies, and testimonials`);
      steps.push(`Create expert-written guides and thought leadership content`);
    }

    if (whyYouAreLosing.includes('coverage')) {
      steps.push(`Create content addressing: ${cluster.prompts.slice(0, 3).join(', ')}`);
      steps.push(`Expand internal linking around "${cluster.title}" topics`);
    }

    // Always include these foundational steps
    steps.push(`Monitor competitor positioning and adjust strategy based on their strengths`);
    steps.push(`Track visibility improvements using GEO Score metrics`);

    // Limit to 7 steps max
    return steps.slice(0, 7);
  }

  /**
   * Calculate confidence score (0-1)
   */
  private calculateConfidence(
    evidence: VisibilityOpportunity['evidence'],
    competitors: VisibilityOpportunity['competitors'],
    aiVisibility: VisibilityOpportunity['aiVisibility']
  ): number {
    let confidence = 0.5; // Base confidence

    // Evidence completeness
    const totalEvidence = Object.values(evidence).reduce((sum, arr) => sum + arr.length, 0);
    if (totalEvidence > 10) confidence += 0.2;
    else if (totalEvidence > 5) confidence += 0.1;
    else if (totalEvidence === 0) confidence -= 0.2;

    // Consistency across engines
    const enginesWithData = Object.values(aiVisibility).filter(v => v > 0).length;
    if (enginesWithData >= 3) confidence += 0.15;
    else if (enginesWithData >= 2) confidence += 0.1;
    else if (enginesWithData === 0) confidence -= 0.15;

    // Competitor data presence
    if (competitors.length > 0) confidence += 0.1;
    if (competitors.length > 2) confidence += 0.05;

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Generate warnings
   */
  private generateWarnings(
    evidence: VisibilityOpportunity['evidence'],
    competitors: VisibilityOpportunity['competitors'],
    aiVisibility: VisibilityOpportunity['aiVisibility'],
    confidence: number
  ): string[] {
    const warnings: string[] = [];

    if (confidence < 0.5) {
      warnings.push('Low confidence: Limited evidence available. Results may be less reliable.');
    }

    const totalEvidence = Object.values(evidence).reduce((sum, arr) => sum + arr.length, 0);
    if (totalEvidence === 0) {
      warnings.push('No evidence found: This opportunity is based on inference rather than direct evidence.');
    }

    const enginesWithData = Object.values(aiVisibility).filter((v, key) => {
      const k = Object.keys(aiVisibility)[key];
      return k !== 'weighted' && v > 0;
    }).length;
    if (enginesWithData < 2) {
      warnings.push(`Single-engine evidence: Only ${enginesWithData} engine(s) have data. Low cross-engine reliability.`);
    }

    if (competitors.length === 0) {
      warnings.push('No competitor data: Unable to assess competitive landscape for this opportunity.');
    }

    return warnings;
  }

  /**
   * Estimate GEO Score impact
   */
  private estimateGEOScoreImpact(
    opportunityImpact: number,
    value: number,
    difficulty: number,
    aiVisibility: VisibilityOpportunity['aiVisibility']
  ): { min: number; max: number } {
    // Base impact calculation
    // Higher value + higher impact + lower difficulty = more GEO Score points
    const baseImpact = (value / 100) * (opportunityImpact / 100) * (1 - difficulty / 100) * 20;

    // Adjust based on current visibility (bigger gap = bigger potential improvement)
    const visibilityGap = 100 - aiVisibility.weighted;
    const gapMultiplier = visibilityGap / 100;

    const min = Math.round(baseImpact * gapMultiplier * 0.5);
    const max = Math.round(baseImpact * gapMultiplier * 1.5);

    return { min, max };
  }

  /**
   * Enhance prompts with industry context
   */
  private enhancePromptsWithIndustryContext(
    prompts: string[],
    industryContext: IndustryContext
  ): string[] {
    const enhanced: string[] = [];

    for (const prompt of prompts) {
      enhanced.push(prompt);

      // Add industry-specific variations
      if (industryContext.industry.includes('OTA') || industryContext.industry.includes('Travel')) {
        enhanced.push(`${prompt} for international travel`);
        enhanced.push(`best ${prompt} 2024`);
      }

      if (industryContext.geographicScope === 'Local' || industryContext.geographicScope === 'Regional') {
        enhanced.push(`${prompt} near me`);
        enhanced.push(`${prompt} in [city]`);
      }
    }

    return enhanced;
  }

  /**
   * Cluster prompts by intent and similarity
   */
  private clusterPrompts(
    prompts: string[],
    industryContext: IndustryContext
  ): Array<{ title: string; prompts: string[]; intent: string }> {
    const clusters: Array<{ title: string; prompts: string[]; intent: string }> = [];

    // Simple clustering by intent keywords
    const intentMap = new Map<string, string[]>();

    for (const prompt of prompts) {
      const lower = prompt.toLowerCase();
      let intent = 'general';

      if (lower.includes('best') || lower.includes('top') || lower.includes('recommend')) {
        intent = 'BEST';
      } else if (lower.includes('vs') || lower.includes('versus') || lower.includes('comparison')) {
        intent = 'COMPARISON';
      } else if (lower.includes('alternative') || lower.includes('instead of')) {
        intent = 'ALTERNATIVES';
      } else if (lower.includes('how to') || lower.includes('how do')) {
        intent = 'HOWTO';
      } else if (lower.includes('price') || lower.includes('cost') || lower.includes('pricing')) {
        intent = 'PRICING';
      } else if (lower.includes('near me') || lower.includes('local')) {
        intent = 'LOCAL';
      } else if (lower.includes('review') || lower.includes('rating')) {
        intent = 'REVIEWS';
      }

      if (!intentMap.has(intent)) {
        intentMap.set(intent, []);
      }
      intentMap.get(intent)!.push(prompt);
    }

    // Create clusters
    for (const [intent, clusterPrompts] of intentMap.entries()) {
      if (clusterPrompts.length > 0) {
        // Use first prompt as title, or generate a better title
        const title = this.generateClusterTitle(clusterPrompts[0], intent, industryContext);
        clusters.push({
          title,
          prompts: clusterPrompts,
          intent,
        });
      }
    }

    return clusters;
  }

  /**
   * Generate a clean cluster title
   */
  private generateClusterTitle(
    samplePrompt: string,
    intent: string,
    industryContext: IndustryContext
  ): string {
    // Clean up the prompt to make it a good title
    let title = samplePrompt.trim();

    // Remove question words
    title = title.replace(/^(what|where|when|who|how|which|why)\s+/i, '');

    // Capitalize first letter
    title = title.charAt(0).toUpperCase() + title.slice(1);

    // Limit length
    if (title.length > 80) {
      title = title.substring(0, 77) + '...';
    }

    return title;
  }

  /**
   * Infer market type from industry
   */
  private inferMarketType(industry: string): IndustryContext['marketType'] {
    const lower = industry.toLowerCase();
    if (lower.includes('b2b') || lower.includes('enterprise') || lower.includes('saas')) {
      return 'B2B';
    }
    if (lower.includes('marketplace') || lower.includes('platform')) {
      return 'B2B2C';
    }
    return 'B2C';
  }

  /**
   * Infer service type from industry
   */
  private inferServiceType(industry: string): IndustryContext['serviceType'] {
    const lower = industry.toLowerCase();
    if (lower.includes('saas') || lower.includes('software') || lower.includes('platform')) {
      return 'Platform';
    }
    if (lower.includes('service') || lower.includes('clinic') || lower.includes('studio')) {
      return 'Service';
    }
    if (lower.includes('retail') || lower.includes('e-commerce') || lower.includes('store')) {
      return 'Product';
    }
    return 'Hybrid';
  }
}


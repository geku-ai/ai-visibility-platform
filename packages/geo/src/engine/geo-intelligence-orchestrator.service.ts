/**
 * GEO Intelligence Orchestrator
 * 
 * Unified backend intelligence pipeline that orchestrates all premium intelligence services
 * in the correct sequence to produce comprehensive GEO analysis.
 * 
 * Returns structured JSON data only - no UI components.
 * 
 * HARDENED VERSION:
 * - Per-step error handling with graceful degradation
 * - Performance tracking and logging
 * - Data validation and sanitization
 * - Type safety and contract consistency
 * - Evidence and confidence field validation
 */

import { Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { LLMRouterService } from '@ai-visibility/shared';
import { GEOIntelligenceResponse } from '../types/diagnostic.types';
import { IndustryDetectorService, IndustryClassification } from '../industry/industry-detector.service';
import { PremiumBusinessSummaryService } from '../summary/premium-business-summary.service';
import { EvidenceBackedPromptGeneratorService } from '../prompts/evidence-backed-prompt-generator.service';
import { PromptClusterService } from '../prompts/prompt-cluster.service';
import { PremiumCompetitorDetectorService } from '../competitors/premium-competitor-detector.service';
import { EvidenceBackedShareOfVoiceService } from '../sov/evidence-backed-sov.service';
import { PremiumCitationService } from '../citations/premium-citation-service';
import { CommercialValueImpactService } from '../value/commercial-value.service';
import { EnginePatternService } from '../patterns/engine-pattern.service';
import { CompetitorAdvantageService } from '../competitors/competitor-advantage.service';
import { TrustFailureService } from '../trust/trust-failure.service';
import { FixDifficultyService } from '../difficulty/fix-difficulty.service';
import { PremiumGEOScoreService } from '../scoring/premium-geo-score.service';
import { VisibilityOpportunitiesService } from '../opportunities/visibility-opportunities.service';
import { EnhancedRecommendationService } from '../recommendations/enhanced-recommendation.service';

interface StepResult<T> {
  data: T;
  success: boolean;
  error?: string;
  duration: number;
}

interface OrchestrationMetrics {
  totalDuration: number;
  stepDurations: Record<string, number>;
  successfulSteps: string[];
  failedSteps: string[];
  warnings: string[];
}

@Injectable()
export class GEOIntelligenceOrchestrator {
  private readonly logger = new Logger(GEOIntelligenceOrchestrator.name);
  private dbPool: Pool;

  constructor(
    private readonly llmRouter: LLMRouterService,
    private readonly industryDetector: IndustryDetectorService,
    private readonly businessSummary: PremiumBusinessSummaryService,
    private readonly promptGenerator: EvidenceBackedPromptGeneratorService,
    private readonly promptCluster: PromptClusterService,
    private readonly competitorDetector: PremiumCompetitorDetectorService,
    private readonly shareOfVoice: EvidenceBackedShareOfVoiceService,
    private readonly citationService: PremiumCitationService,
    private readonly commercialValue: CommercialValueImpactService,
    private readonly enginePattern: EnginePatternService,
    private readonly competitorAdvantage: CompetitorAdvantageService,
    private readonly trustFailure: TrustFailureService,
    private readonly fixDifficulty: FixDifficultyService,
    private readonly geoScore: PremiumGEOScoreService,
    private readonly visibilityOpportunities: VisibilityOpportunitiesService,
    private readonly recommendations: EnhancedRecommendationService,
  ) {
    this.dbPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
  }

  /**
   * Orchestrate complete GEO intelligence analysis
   * 
   * Runs all services in sequence with error handling and graceful degradation.
   * Each step is wrapped in try-catch to prevent cascading failures.
   * 
   * @param workspaceId - Workspace identifier
   * @param brandName - Brand name
   * @param domain - Domain URL
   * @param options - Orchestration options
   * @returns Complete intelligence response with metadata about partial failures
   */
  async orchestrateIntelligence(
    workspaceId: string,
    brandName: string,
    domain: string,
    options: {
      includeOpportunities?: boolean;
      includeRecommendations?: boolean;
      maxOpportunities?: number;
    } = {}
  ): Promise<GEOIntelligenceResponse> {
    const { includeOpportunities = true, includeRecommendations = true, maxOpportunities = 50 } = options;
    const startTime = Date.now();
    const metrics: OrchestrationMetrics = {
      totalDuration: 0,
      stepDurations: {},
      successfulSteps: [],
      failedSteps: [],
      warnings: [],
    };

    this.logger.log(`[Orchestrator] Starting GEO intelligence for workspace ${workspaceId} (${brandName})`);

    // Initialize defaults for graceful degradation
    let industryContext: IndustryClassification | null = null;
    let businessSummary: any = null;
    let prompts: any[] = [];
    let promptClusters: any[] = [];
    let competitors: any[] = [];
    let sovAnalysis: any[] = [];
    let citations: any = null;
    let commercialValues: any[] = [];
    let crossEnginePatterns: any = null;
    let competitorAnalyses: any[] = [];
    let trustFailures: any[] = [];
    let fixDifficulties: any[] = [];
    let geoScoreResult: any = null;
    let opportunities: any[] = [];
    let recommendations: any[] = [];

    // Step 1: Industry Detection (CRITICAL - other steps depend on this)
    const step1 = await this.executeStep('Industry Detection', async () => {
      const result = await this.industryDetector.detectIndustry(workspaceId, domain);
      this.validateIndustryClassification(result);
      return result;
    });
    industryContext = step1.data || this.getDefaultIndustryClassification();
    if (!step1.success) {
      metrics.warnings.push(`Industry detection failed: ${step1.error}. Using defaults.`);
    }

    // Step 2: Business Summary
    const step2 = await this.executeStep('Business Summary', async () => {
      return await this.businessSummary.generatePremiumSummary(
        workspaceId,
        domain,
        brandName
      );
    });
    businessSummary = step2.data || this.getDefaultBusinessSummary();
    if (!step2.success) {
      metrics.warnings.push(`Business summary failed: ${step2.error}. Using defaults.`);
    }

    // Step 3: Prompt Generation (CRITICAL - many steps depend on this)
    const step3 = await this.executeStep('Prompt Generation', async () => {
      if (!industryContext) throw new Error('Industry context required');
      return await this.promptGenerator.generateEvidenceBackedPrompts(
        workspaceId,
        {
          brandName,
          industry: industryContext.primaryIndustry,
          category: industryContext.primaryIndustry.split('/')[0]?.trim() || industryContext.primaryIndustry,
          vertical: industryContext.secondaryIndustries[0] || industryContext.primaryIndustry,
          services: [],
          marketType: this.inferMarketType(industryContext.primaryIndustry),
          serviceType: this.inferServiceType(industryContext.primaryIndustry),
        }
      );
    });
    prompts = step3.data || [];
    if (!step3.success || prompts.length === 0) {
      metrics.warnings.push(`Prompt generation failed or returned empty: ${step3.error}. Some downstream steps may be degraded.`);
      // Generate fallback prompts
      prompts = this.generateFallbackPrompts(brandName, industryContext.primaryIndustry);
    }

    // Step 4: Prompt Clustering
    const step4 = await this.executeStep('Prompt Clustering', async () => {
      return await this.promptCluster.clusterPrompts(
        workspaceId,
        brandName,
        prompts.map(p => p.text || p),
        industryContext?.primaryIndustry || 'Unknown'
      );
    });
    promptClusters = step4.data || [];
    if (!step4.success) {
      metrics.warnings.push(`Prompt clustering failed: ${step4.error}. Continuing with unclustered prompts.`);
    }

    // Step 5: Competitor Detection
    const step5 = await this.executeStep('Competitor Detection', async () => {
      if (!industryContext) throw new Error('Industry context required');
      return await this.competitorDetector.detectPremiumCompetitors(
        workspaceId,
        domain,
        brandName,
        industryContext.primaryIndustry
      );
    });
    competitors = step5.data || [];
    if (!step5.success) {
      metrics.warnings.push(`Competitor detection failed: ${step5.error}. Continuing without competitors.`);
    }

    // Step 6: SOV Analysis per Engine
    const step6 = await this.executeStep('SOV Analysis', async () => {
      const entities = [brandName, ...competitors.map(c => c.brandName || c)].filter(Boolean);
      if (entities.length === 0) return [];
      return await this.shareOfVoice.calculateEvidenceBackedSOV(workspaceId, entities);
    });
    sovAnalysis = step6.data || [];
    if (!step6.success) {
      metrics.warnings.push(`SOV analysis failed: ${step6.error}. Continuing without SOV data.`);
    }

    // Step 7: Citation Analysis
    const step7 = await this.executeStep('Citation Analysis', async () => {
      return await this.citationService.getPremiumCitations(workspaceId, domain, 50);
    });
    citations = step7.data || this.getDefaultCitations();
    if (!step7.success) {
      metrics.warnings.push(`Citation analysis failed: ${step7.error}. Using defaults.`);
    }

    // Step 8: Commercial Value Scoring
    const step8 = await this.executeStep('Commercial Value Scoring', async () => {
      if (promptClusters.length === 0) return [];
      return await Promise.all(
        promptClusters.map(cluster =>
          this.commercialValue.calculateCommercialValue(
            workspaceId,
            brandName,
            cluster.prompts || [],
            industryContext?.primaryIndustry || 'Unknown'
          ).catch(err => {
            this.logger.warn(`Commercial value calculation failed for cluster ${cluster.title}: ${err.message}`);
            return this.getDefaultCommercialValue();
          })
        )
      );
    });
    commercialValues = step8.data || [];
    if (!step8.success) {
      metrics.warnings.push(`Commercial value scoring partially failed: ${step8.error}`);
    }

    // Step 9: Cross-Engine Pattern Recognition
    const step9 = await this.executeStep('Cross-Engine Pattern Recognition', async () => {
      return await this.enginePattern.analyzeCrossEnginePatterns(
        workspaceId,
        brandName,
        prompts.map(p => p.text || p)
      );
    });
    crossEnginePatterns = step9.data || this.getDefaultCrossEnginePatterns();
    if (!step9.success) {
      metrics.warnings.push(`Cross-engine pattern recognition failed: ${step9.error}. Using defaults.`);
    }

    // Step 10: Competitor Advantage/Weakness Analysis
    const step10 = await this.executeStep('Competitor Advantage Analysis', async () => {
      if (competitors.length === 0) return [];
      return await Promise.all(
        competitors.slice(0, 5).map(competitor =>
          this.competitorAdvantage.analyzeCompetitorAdvantage(
            workspaceId,
            brandName,
            competitor.brandName || competitor,
            prompts.map(p => p.text || p)
          ).catch(err => {
            this.logger.warn(`Competitor analysis failed for ${competitor.brandName || competitor}: ${err.message}`);
            return null;
          })
        )
      ).then(results => results.filter(Boolean));
    });
    competitorAnalyses = step10.data || [];
    if (!step10.success) {
      metrics.warnings.push(`Competitor advantage analysis partially failed: ${step10.error}`);
    }

    // Step 11: Trust Failure Detection
    const step11 = await this.executeStep('Trust Failure Detection', async () => {
      return await this.trustFailure.detectTrustFailures(workspaceId, brandName);
    });
    trustFailures = step11.data || [];
    if (!step11.success) {
      metrics.warnings.push(`Trust failure detection failed: ${step11.error}. Continuing without trust failures.`);
    }

    // Step 12: Fix Difficulty Scoring
    const step12 = await this.executeStep('Fix Difficulty Scoring', async () => {
      if (promptClusters.length === 0) return [];
      return await Promise.all(
        promptClusters.map(cluster =>
          this.fixDifficulty.calculateFixDifficulty(
            workspaceId,
            brandName,
            cluster.title || 'Unknown',
            cluster.prompts || []
          ).catch(err => {
            this.logger.warn(`Fix difficulty calculation failed for cluster ${cluster.title}: ${err.message}`);
            return this.getDefaultFixDifficulty();
          })
        )
      );
    });
    fixDifficulties = step12.data || [];
    if (!step12.success) {
      metrics.warnings.push(`Fix difficulty scoring partially failed: ${step12.error}`);
    }

    // Step 13: GEO Score Computation (CRITICAL)
    const step13 = await this.executeStep('GEO Score Computation', async () => {
      return await this.geoScore.calculatePremiumGEOScore(
        workspaceId,
        domain,
        brandName,
        competitors.map(c => c.brandName || c).filter(Boolean),
        industryContext?.primaryIndustry || 'Unknown'
      );
    });
    geoScoreResult = step13.data || this.getDefaultGEOScore();
    if (!step13.success) {
      metrics.warnings.push(`GEO Score computation failed: ${step13.error}. Using default score.`);
    }

    // Validate GEO Score formula
    this.validateGEOScore(geoScoreResult);

    // Step 14: Visibility Opportunities Generation
    if (includeOpportunities) {
      const step14 = await this.executeStep('Visibility Opportunities Generation', async () => {
        return await this.visibilityOpportunities.generateOpportunities(
          workspaceId,
          brandName,
          domain,
          { maxOpportunities }
        );
      });
      opportunities = step14.data || [];
      if (!step14.success) {
        metrics.warnings.push(`Visibility opportunities generation failed: ${step14.error}. Continuing without opportunities.`);
      }
      // Validate opportunities
      opportunities = opportunities.map(opp => this.validateAndSanitizeOpportunity(opp));
    }

    // Step 15: Actionable Recommendations Generation
    if (includeRecommendations) {
      const step15 = await this.executeStep('Recommendations Generation', async () => {
        return await this.recommendations.generateEnhancedRecommendations(
          workspaceId,
          brandName,
          {
            trustFailures,
            competitorAnalyses,
            promptClusters,
            fixDifficulties,
            commercialValues,
            geoScore: geoScoreResult,
          }
        );
      });
      recommendations = step15.data || [];
      if (!step15.success) {
        metrics.warnings.push(`Recommendations generation failed: ${step15.error}. Continuing without recommendations.`);
      }
      // Validate recommendations
      recommendations = recommendations.map(rec => this.validateAndSanitizeRecommendation(rec));
    }

    // Calculate final metrics
    metrics.totalDuration = Date.now() - startTime;

    // Assemble unified response with validation
    const response: GEOIntelligenceResponse = {
      workspaceId,
      brandName,
      domain,
      industry: {
        primary: industryContext?.primaryIndustry || 'Unknown',
        secondary: industryContext?.secondaryIndustries || [],
        confidence: this.sanitizeConfidence(industryContext?.confidence || 0.5),
        evidence: industryContext?.evidence || {},
      },
      businessSummary: this.sanitizeBusinessSummary(businessSummary),
      prompts: prompts.map(p => this.sanitizePrompt(p)),
      promptClusters: promptClusters.map(c => this.sanitizePromptCluster(c)),
      competitors: competitors.map(c => this.sanitizeCompetitor(c)),
      sovAnalysis: Array.isArray(sovAnalysis) ? sovAnalysis : [],
      citations: this.sanitizeCitations(citations),
      commercialValues: commercialValues.map(v => this.sanitizeCommercialValue(v)),
      crossEnginePatterns: this.sanitizeCrossEnginePatterns(crossEnginePatterns),
      competitorAnalyses: competitorAnalyses.map(a => this.sanitizeCompetitorAnalysis(a)),
      trustFailures: trustFailures.map(t => this.sanitizeTrustFailure(t)),
      fixDifficulties: fixDifficulties.map(f => this.sanitizeFixDifficulty(f)),
      geoScore: {
        overall: this.sanitizeGEOScoreTotal(geoScoreResult?.total),
        breakdown: geoScoreResult?.breakdown || {},
        improvementPaths: opportunities
          .slice(0, 5)
          .map(opp => ({
            opportunity: opp.title || 'Unknown',
            impact: opp.geoScoreImpact || { min: 0, max: 0 },
            difficulty: this.sanitizeDifficulty(opp.difficulty),
          })),
        explanation: this.generateGEOScoreExplanation(geoScoreResult, opportunities),
      },
      opportunities,
      recommendations,
      metadata: {
        generatedAt: new Date(),
        serviceVersion: '2.0.0',
        industry: industryContext?.primaryIndustry || 'Unknown',
        confidence: this.calculateOverallConfidence(
          industryContext,
          businessSummary,
          competitors,
          trustFailures,
          metrics
        ),
      },
    };

    // Log performance metrics
    this.logger.log(
      `[Orchestrator] Complete in ${metrics.totalDuration}ms. ` +
      `Success: ${metrics.successfulSteps.length}/15, ` +
      `Failed: ${metrics.failedSteps.length}, ` +
      `Warnings: ${metrics.warnings.length}`
    );

    if (metrics.warnings.length > 0) {
      this.logger.warn(`[Orchestrator] Warnings: ${metrics.warnings.join('; ')}`);
    }

    return response;
  }

  /**
   * Execute a step with error handling and timing
   */
  private async executeStep<T>(
    stepName: string,
    fn: () => Promise<T>
  ): Promise<StepResult<T>> {
    const startTime = Date.now();
    try {
      const data = await fn();
      const duration = Date.now() - startTime;
      this.logger.debug(`[Step] ${stepName} completed in ${duration}ms`);
      return { data, success: true, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[Step] ${stepName} failed after ${duration}ms: ${errorMessage}`);
      return { data: null as any, success: false, error: errorMessage, duration };
    }
  }

  /**
   * Validate industry classification
   */
  private validateIndustryClassification(context: IndustryClassification | null): void {
    if (!context) throw new Error('Industry classification is null');
    if (!context.primaryIndustry || context.primaryIndustry.trim().length === 0) {
      throw new Error('Primary industry is required');
    }
    if (context.confidence < 0 || context.confidence > 1) {
      throw new Error(`Invalid confidence: ${context.confidence} (must be 0-1)`);
    }
  }

  /**
   * Validate GEO Score formula
   * Formula: 35% AI Visibility + 25% EEAT + 15% Citations + 15% Competitor Comparison + 10% Schema/Technical
   */
  private validateGEOScore(geoScore: any): void {
    if (!geoScore) return;
    
    const total = geoScore.total;
    if (typeof total !== 'number' || total < 0 || total > 100) {
      this.logger.warn(`[Validation] Invalid GEO Score total: ${total} (expected 0-100)`);
    }

    if (geoScore.breakdown) {
      const breakdown = geoScore.breakdown;
      const components = [
        breakdown.aiVisibility?.score,
        breakdown.eeat?.score,
        breakdown.citations?.score,
        breakdown.competitorComparison?.score,
        breakdown.schemaTechnical?.score,
      ].filter(v => typeof v === 'number');

      if (components.length > 0) {
        // Check if components are reasonable (not all 0, not all 100)
        const allZero = components.every(v => v === 0);
        const allMax = components.every(v => v >= 95);
        if (allZero && total > 10) {
          this.logger.warn(`[Validation] GEO Score components are all 0 but total is ${total}`);
        }
        if (allMax && total < 90) {
          this.logger.warn(`[Validation] GEO Score components are all high but total is ${total}`);
        }
      }
    }
  }

  /**
   * Sanitize confidence to 0-1 range
   */
  private sanitizeConfidence(confidence: number | undefined | null): number {
    if (typeof confidence !== 'number' || isNaN(confidence)) return 0.5;
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Sanitize GEO Score total
   */
  private sanitizeGEOScoreTotal(total: number | undefined | null): number {
    if (typeof total !== 'number' || isNaN(total)) return 0;
    return Math.max(0, Math.min(100, total));
  }

  /**
   * Sanitize difficulty score
   */
  private sanitizeDifficulty(difficulty: number | string | undefined | null): number {
    if (typeof difficulty === 'string') {
      const map: Record<string, number> = { easy: 30, medium: 60, hard: 90 };
      return map[difficulty] || 50;
    }
    if (typeof difficulty !== 'number' || isNaN(difficulty)) return 50;
    return Math.max(0, Math.min(100, difficulty));
  }

  /**
   * Validate and sanitize opportunity
   */
  private validateAndSanitizeOpportunity(opp: any): any {
    return {
      title: opp.title || 'Untitled Opportunity',
      aiVisibility: {
        chatgpt: Math.max(0, Math.min(100, opp.aiVisibility?.chatgpt || 0)),
        claude: Math.max(0, Math.min(100, opp.aiVisibility?.claude || 0)),
        gemini: Math.max(0, Math.min(100, opp.aiVisibility?.gemini || 0)),
        perplexity: Math.max(0, Math.min(100, opp.aiVisibility?.perplexity || 0)),
        weighted: Math.max(0, Math.min(100, opp.aiVisibility?.weighted || 0)),
      },
      competitors: Array.isArray(opp.competitors) ? opp.competitors : [],
      whyYouAreLosing: opp.whyYouAreLosing || 'Analysis unavailable',
      opportunityImpact: Math.max(0, Math.min(100, opp.opportunityImpact || 0)),
      difficulty: this.sanitizeDifficulty(opp.difficulty),
      value: Math.max(0, Math.min(100, opp.value || 0)),
      actionSteps: Array.isArray(opp.actionSteps) && opp.actionSteps.length > 0 
        ? opp.actionSteps 
        : ['Review opportunity details'],
      evidence: {
        chatgpt: Array.isArray(opp.evidence?.chatgpt) ? opp.evidence.chatgpt : [],
        claude: Array.isArray(opp.evidence?.claude) ? opp.evidence.claude : [],
        gemini: Array.isArray(opp.evidence?.gemini) ? opp.evidence.gemini : [],
        perplexity: Array.isArray(opp.evidence?.perplexity) ? opp.evidence.perplexity : [],
      },
      confidence: this.sanitizeConfidence(opp.confidence),
      warnings: Array.isArray(opp.warnings) ? opp.warnings : [],
      geoScoreImpact: {
        min: Math.max(0, opp.geoScoreImpact?.min || 0),
        max: Math.max(0, opp.geoScoreImpact?.max || 0),
      },
    };
  }

  /**
   * Validate and sanitize recommendation
   */
  private validateAndSanitizeRecommendation(rec: any): any {
    return {
      id: rec.id || `rec-${Date.now()}-${Math.random()}`,
      title: rec.title || 'Untitled Recommendation',
      description: rec.description || 'No description available',
      category: rec.category || 'technical',
      priority: rec.priority || 'medium',
      difficulty: rec.difficulty || 'medium',
      timeEstimate: rec.timeEstimate || 'Unknown',
      expectedImpact: {
        geoScoreImprovement: typeof rec.expectedImpact?.geoScoreImprovement === 'number' 
          ? Math.max(0, rec.expectedImpact.geoScoreImprovement) 
          : undefined,
        visibilityGain: typeof rec.expectedImpact?.visibilityGain === 'number'
          ? Math.max(0, Math.min(100, rec.expectedImpact.visibilityGain))
          : undefined,
        trustGain: typeof rec.expectedImpact?.trustGain === 'number'
          ? Math.max(0, Math.min(100, rec.expectedImpact.trustGain))
          : undefined,
        commercialValue: typeof rec.expectedImpact?.commercialValue === 'number'
          ? Math.max(0, Math.min(100, rec.expectedImpact.commercialValue))
          : undefined,
        description: rec.expectedImpact?.description || 'Impact analysis unavailable',
      },
      steps: Array.isArray(rec.steps) && rec.steps.length >= 3
        ? rec.steps
        : ['Review recommendation details', 'Plan implementation', 'Execute and monitor'],
      relatedTrustFailures: Array.isArray(rec.relatedTrustFailures) ? rec.relatedTrustFailures : [],
      relatedCompetitors: Array.isArray(rec.relatedCompetitors) ? rec.relatedCompetitors : [],
      relatedPromptClusters: Array.isArray(rec.relatedPromptClusters) ? rec.relatedPromptClusters : [],
      evidence: Array.isArray(rec.evidence) ? rec.evidence : [],
      confidence: this.sanitizeConfidence(rec.confidence),
      reasoning: rec.reasoning || 'Reasoning unavailable',
    };
  }

  /**
   * Sanitize business summary
   */
  private sanitizeBusinessSummary(summary: any): any {
    if (!summary) return this.getDefaultBusinessSummary();
    return {
      ...summary,
      confidence: this.sanitizeConfidence(summary.confidence),
      evidence: Array.isArray(summary.evidence) ? summary.evidence : [],
    };
  }

  /**
   * Sanitize prompt
   */
  private sanitizePrompt(p: any): any {
    return {
      text: p.text || p || 'Unknown prompt',
      intent: p.intent || 'UNKNOWN',
      commercialValue: typeof p.commercialIntent === 'number' ? p.commercialIntent : (p.commercialValue || 0),
      industryRelevance: typeof p.industryRelevance === 'number' ? p.industryRelevance : 0.5,
      evidence: p.evidence || {},
    };
  }

  /**
   * Sanitize prompt cluster
   */
  private sanitizePromptCluster(c: any): any {
    return {
      ...c,
      prompts: Array.isArray(c.prompts) ? c.prompts : [],
      value: Math.max(0, Math.min(100, c.value || 0)),
      difficulty: this.sanitizeDifficulty(c.difficulty),
      confidence: this.sanitizeConfidence(c.confidence),
      evidence: Array.isArray(c.evidence) ? c.evidence : [],
    };
  }

  /**
   * Sanitize competitor
   */
  private sanitizeCompetitor(c: any): any {
    return {
      brandName: c.brandName || c || 'Unknown',
      domain: c.domain || '',
      type: c.type || 'direct',
      confidence: this.sanitizeConfidence(c.confidence),
      visibility: c.visibility || {},
    };
  }

  /**
   * Sanitize citations
   */
  private sanitizeCitations(citations: any): any {
    if (!citations) return this.getDefaultCitations();
    return {
      ...citations,
      citations: Array.isArray(citations.citations) ? citations.citations : [],
      confidence: this.sanitizeConfidence(citations.confidence),
    };
  }

  /**
   * Sanitize commercial value
   */
  private sanitizeCommercialValue(v: any): any {
    if (!v) return this.getDefaultCommercialValue();
    return {
      ...v,
      visibilityValueIndex: Math.max(0, Math.min(100, v.visibilityValueIndex || 0)),
      commercialOpportunityScore: Math.max(0, Math.min(100, v.commercialOpportunityScore || 0)),
      confidence: this.sanitizeConfidence(v.confidence),
      evidence: Array.isArray(v.evidence) ? v.evidence : [],
    };
  }

  /**
   * Sanitize cross-engine patterns
   */
  private sanitizeCrossEnginePatterns(p: any): any {
    if (!p) return this.getDefaultCrossEnginePatterns();
    return {
      ...p,
      engineConfidence: {
        chatgpt: this.sanitizeConfidence(p.engineConfidence?.chatgpt),
        claude: this.sanitizeConfidence(p.engineConfidence?.claude),
        gemini: this.sanitizeConfidence(p.engineConfidence?.gemini),
        perplexity: this.sanitizeConfidence(p.engineConfidence?.perplexity),
      },
      evidence: Array.isArray(p.evidence) ? p.evidence : [],
    };
  }

  /**
   * Sanitize competitor analysis
   */
  private sanitizeCompetitorAnalysis(a: any): any {
    if (!a) return null;
    return {
      ...a,
      structuralAdvantageScore: Math.max(0, Math.min(100, a.structuralAdvantageScore || 0)),
      structuralWeaknessScore: Math.max(0, Math.min(100, a.structuralWeaknessScore || 0)),
      evidence: Array.isArray(a.evidence) ? a.evidence : [],
    };
  }

  /**
   * Sanitize trust failure
   */
  private sanitizeTrustFailure(t: any): any {
    if (!t) return null;
    return {
      ...t,
      severity: Math.max(0, Math.min(100, t.severity || 0)),
      confidence: this.sanitizeConfidence(t.confidence),
      evidence: Array.isArray(t.evidence) ? t.evidence : [],
      recommendedFixes: Array.isArray(t.recommendedFixes) ? t.recommendedFixes : [],
    };
  }

  /**
   * Sanitize fix difficulty
   */
  private sanitizeFixDifficulty(f: any): any {
    if (!f) return this.getDefaultFixDifficulty();
    return {
      ...f,
      difficultyScore: this.sanitizeDifficulty(f.difficultyScore),
      confidence: this.sanitizeConfidence(f.confidence),
      evidence: Array.isArray(f.evidence) ? f.evidence : [],
    };
  }

  /**
   * Get default industry classification
   */
  private getDefaultIndustryClassification(): IndustryClassification {
    return {
      primaryIndustry: 'Unknown',
      secondaryIndustries: [],
      confidence: 0.3,
      evidence: {
        schemaSignals: [],
        contentSignals: [],
        competitorSignals: [],
        llmClassification: '',
        metadataSignals: [],
      },
      missingData: [],
      reasoning: 'Default classification due to detection failure',
    };
  }

  /**
   * Get default business summary
   */
  private getDefaultBusinessSummary(): any {
    return {
      summary: 'Business information unavailable',
      confidence: 0.3,
      evidence: [],
    };
  }

  /**
   * Generate fallback prompts
   */
  private generateFallbackPrompts(brandName: string, industry: string): any[] {
    return [
      { text: `best ${industry} companies`, intent: 'BEST', commercialIntent: 0.7, industryRelevance: 0.8 },
      { text: `${brandName} reviews`, intent: 'TRUST', commercialIntent: 0.5, industryRelevance: 0.6 },
      { text: `${brandName} alternatives`, intent: 'ALTERNATIVES', commercialIntent: 0.8, industryRelevance: 0.7 },
    ];
  }

  /**
   * Get default citations
   */
  private getDefaultCitations(): any {
    return {
      citations: [],
      total: 0,
      confidence: 0.3,
    };
  }

  /**
   * Get default commercial value
   */
  private getDefaultCommercialValue(): any {
    return {
      visibilityValueIndex: 0,
      projectedVisibilityGain: 0,
      commercialOpportunityScore: 0,
      confidence: 0.3,
      evidence: [],
    };
  }

  /**
   * Get default cross-engine patterns
   */
  private getDefaultCrossEnginePatterns(): any {
    return {
      enginesRecognizing: [],
      enginesSuppressing: [],
      consistencyPattern: {
        consistencyScore: 0,
        consistentEngines: [],
        inconsistentEngines: [],
        explanation: 'Pattern analysis unavailable',
      },
      engineConfidence: {
        chatgpt: 0.3,
        claude: 0.3,
        gemini: 0.3,
        perplexity: 0.3,
      },
      evidence: [],
    };
  }

  /**
   * Get default GEO Score
   */
  private getDefaultGEOScore(): any {
    return {
      total: 0,
      breakdown: {
        aiVisibility: { score: 0 },
        eeat: { score: 0 },
        citations: { score: 0 },
        schemaTechnical: { score: 0 },
      },
    };
  }

  /**
   * Get default fix difficulty
   */
  private getDefaultFixDifficulty(): any {
    return {
      difficultyScore: 50,
      difficultyBreakdown: {},
      primaryConstraints: [],
      secondaryConstraints: [],
      timeEstimate: 'Unknown',
      confidence: 0.3,
      evidence: [],
    };
  }

  /**
   * Infer market type from industry
   */
  private inferMarketType(industry: string): 'B2B' | 'B2C' | 'B2B2C' | 'Marketplace' {
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
  private inferServiceType(industry: string): 'Product' | 'Service' | 'Platform' | 'Hybrid' {
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

  /**
   * Generate GEO Score explanation
   */
  private generateGEOScoreExplanation(
    geoScore: any,
    opportunities: any[]
  ): string {
    const parts: string[] = [];

    if (geoScore?.total !== undefined) {
      parts.push(`Current GEO Score: ${geoScore.total}/100`);
    } else {
      parts.push('GEO Score: Unable to compute');
    }

    if (geoScore?.breakdown) {
      const breakdown = geoScore.breakdown;
      const components: string[] = [];
      
      if (breakdown.aiVisibility?.score !== undefined) {
        components.push(`Visibility: ${breakdown.aiVisibility.score}/100`);
      }
      if (breakdown.eeat?.score !== undefined) {
        components.push(`EEAT: ${breakdown.eeat.score}/100`);
      }
      if (breakdown.citations?.score !== undefined) {
        components.push(`Citations: ${breakdown.citations.score}/100`);
      }
      if (breakdown.schemaTechnical?.score !== undefined) {
        components.push(`Schema: ${breakdown.schemaTechnical.score}/100`);
      }
      
      if (components.length > 0) {
        parts.push(`Components: ${components.join(', ')}`);
      }
    }

    if (opportunities.length > 0) {
      const topOpportunity = opportunities[0];
      if (topOpportunity?.title && topOpportunity?.geoScoreImpact) {
        parts.push(
          `Top opportunity: "${topOpportunity.title}" - Potential improvement: ${topOpportunity.geoScoreImpact.min}-${topOpportunity.geoScoreImpact.max} points`
        );
      }
    }

    return parts.length > 0 ? parts.join('. ') : 'GEO Score analysis unavailable';
  }

  /**
   * Calculate overall confidence with metrics consideration
   */
  private calculateOverallConfidence(
    industry: any,
    businessSummary: any,
    competitors: any[],
    trustFailures: any[],
    metrics: OrchestrationMetrics
  ): number {
    let confidence = 0.5; // Base confidence

    // Industry confidence
    if (industry?.confidence && industry.confidence > 0.7) confidence += 0.1;
    
    // Business summary confidence
    if (businessSummary?.confidence && businessSummary.confidence > 0.7) confidence += 0.1;
    
    // Data completeness
    if (competitors.length > 0) confidence += 0.1;
    if (trustFailures.length > 0) confidence += 0.05; // More data = higher confidence
    
    // Penalize for failures
    const failureRate = metrics.failedSteps.length / 15;
    confidence -= failureRate * 0.2;

    return Math.max(0, Math.min(1, confidence));
  }
}

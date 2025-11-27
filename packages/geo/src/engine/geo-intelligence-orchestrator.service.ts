/**
 * GEO Intelligence Orchestrator
 * 
 * Unified backend intelligence pipeline that orchestrates all premium intelligence services
 * in the correct sequence to produce comprehensive GEO analysis.
 * 
 * Returns structured JSON data only - no UI components.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { LLMRouterService } from '@ai-visibility/shared';
import { GEOIntelligenceResponse } from '../types/diagnostic.types';
import { IndustryDetectorService, IndustryContext } from '../industry/industry-detector.service';
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
   * Runs all services in sequence and returns unified response
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

    this.logger.log(`Orchestrating GEO intelligence for workspace ${workspaceId} (${brandName})`);

    try {
      // Step 1: Industry Detection
      this.logger.log('Step 1: Industry Detection');
      const industryContext = await this.industryDetector.detectIndustry(workspaceId, domain);
      const industry = {
        primary: industryContext.primaryIndustry,
        secondary: industryContext.secondaryIndustries,
        confidence: industryContext.confidence,
        evidence: industryContext.evidence,
      };

      // Step 2: Business Summary
      this.logger.log('Step 2: Business Summary');
      const businessSummary = await this.businessSummary.generatePremiumSummary(
        workspaceId,
        domain,
        brandName
      );

      // Step 3: Prompt Generation
      this.logger.log('Step 3: Prompt Generation');
      const prompts = await this.promptGenerator.generateEvidenceBackedPrompts(
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

      // Step 4: Prompt Clustering
      this.logger.log('Step 4: Prompt Clustering');
      const promptClusters = await this.promptCluster.clusterPrompts(
        workspaceId,
        brandName,
        prompts.map(p => p.text),
        industryContext.primaryIndustry
      );

      // Step 5: Competitor Detection
      this.logger.log('Step 5: Competitor Detection');
      const competitors = await this.competitorDetector.detectPremiumCompetitors(
        workspaceId,
        domain,
        brandName,
        industryContext.primaryIndustry
      );

      // Step 6: SOV Analysis per Engine
      this.logger.log('Step 6: SOV Analysis per Engine');
      const sovAnalysis = await this.shareOfVoice.calculateEvidenceBackedSOV(
        workspaceId,
        [brandName, ...competitors.map(c => c.brandName)]
      );

      // Step 7: Citation Analysis
      this.logger.log('Step 7: Citation Analysis');
      const citations = await this.citationService.getPremiumCitations(
        workspaceId,
        domain,
        50
      );

      // Step 8: Commercial Value Scoring
      this.logger.log('Step 8: Commercial Value Scoring');
      const commercialValues = await Promise.all(
        promptClusters.map(cluster =>
          this.commercialValue.calculateCommercialValue(
            workspaceId,
            brandName,
            cluster.prompts,
            industryContext.primaryIndustry
          )
        )
      );

      // Step 9: Cross-Engine Pattern Recognition
      this.logger.log('Step 9: Cross-Engine Pattern Recognition');
      const crossEnginePatterns = await this.enginePattern.analyzeCrossEnginePatterns(
        workspaceId,
        brandName,
        prompts.map(p => p.text)
      );

      // Step 10: Competitor Advantage/Weakness Analysis
      this.logger.log('Step 10: Competitor Advantage/Weakness Analysis');
      const competitorAnalyses = await Promise.all(
        competitors.slice(0, 5).map(competitor =>
          this.competitorAdvantage.analyzeCompetitorAdvantage(
            workspaceId,
            brandName,
            competitor.brandName,
            prompts.map(p => p.text)
          )
        )
      );

      // Step 11: Trust Failure Detection
      this.logger.log('Step 11: Trust Failure Detection');
      const trustFailures = await this.trustFailure.detectTrustFailures(workspaceId, brandName);

      // Step 12: Fix Difficulty Scoring
      this.logger.log('Step 12: Fix Difficulty Scoring');
      const fixDifficulties = await Promise.all(
        promptClusters.map(cluster =>
          this.fixDifficulty.calculateFixDifficulty(
            workspaceId,
            brandName,
            cluster.title,
            cluster.prompts
          )
        )
      );

      // Step 13: GEO Score Computation
      this.logger.log('Step 13: GEO Score Computation');
      const geoScoreResult = await this.geoScore.calculatePremiumGEOScore(
        workspaceId,
        domain,
        brandName,
        competitors.map(c => c.brandName),
        industryContext.primaryIndustry
      );

      // Step 14: Visibility Opportunities Generation
      let opportunities: any[] = [];
      if (includeOpportunities) {
        this.logger.log('Step 14: Visibility Opportunities Generation');
        opportunities = await this.visibilityOpportunities.generateOpportunities(
          workspaceId,
          brandName,
          domain,
          { maxOpportunities }
        );
      }

      // Step 15: Actionable Recommendations Generation
      let recommendations: any[] = [];
      if (includeRecommendations) {
        this.logger.log('Step 15: Actionable Recommendations Generation');
        recommendations = await this.recommendations.generateEnhancedRecommendations(
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
      }

      // Assemble unified response
      const response: GEOIntelligenceResponse = {
        workspaceId,
        brandName,
        domain,
        industry,
        businessSummary,
        prompts: prompts.map(p => ({
          text: p.text,
          intent: p.intent,
          commercialValue: p.commercialIntent,
          industryRelevance: p.industryRelevance,
          evidence: p.evidence,
        })),
        promptClusters,
        competitors: competitors.map(c => ({
          brandName: c.brandName,
          domain: c.domain,
          type: c.type,
          confidence: c.confidence,
          visibility: c.visibility,
        })),
        sovAnalysis,
        citations,
        commercialValues,
        crossEnginePatterns,
        competitorAnalyses,
        trustFailures,
        fixDifficulties,
        geoScore: {
          overall: geoScoreResult.total,
          breakdown: geoScoreResult.breakdown,
          improvementPaths: opportunities
            .slice(0, 5)
            .map(opp => ({
              opportunity: opp.title,
              impact: opp.geoScoreImpact,
              difficulty: opp.difficulty,
            })),
          explanation: this.generateGEOScoreExplanation(geoScoreResult, opportunities),
        },
        opportunities,
        recommendations,
        metadata: {
          generatedAt: new Date(),
          serviceVersion: '2.0.0',
          industry: industryContext.primaryIndustry,
          confidence: this.calculateOverallConfidence(
            industryContext,
            businessSummary,
            competitors,
            trustFailures
          ),
        },
      };

      this.logger.log('GEO Intelligence orchestration complete');

      return response;
    } catch (error) {
      this.logger.error(`Failed to orchestrate intelligence: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
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

    parts.push(`Current GEO Score: ${geoScore.total}/100`);

    if (geoScore.breakdown) {
      const breakdown = geoScore.breakdown;
      if (breakdown.visibility !== undefined) {
        parts.push(`Visibility: ${breakdown.visibility}/100`);
      }
      if (breakdown.eeat !== undefined) {
        parts.push(`EEAT: ${breakdown.eeat}/100`);
      }
      if (breakdown.citations !== undefined) {
        parts.push(`Citations: ${breakdown.citations}/100`);
      }
    }

    if (opportunities.length > 0) {
      const topOpportunity = opportunities[0];
      parts.push(
        `Top opportunity: "${topOpportunity.title}" - Potential GEO Score improvement: ${topOpportunity.geoScoreImpact.min}-${topOpportunity.geoScoreImpact.max} points`
      );
    }

    return parts.join('. ');
  }

  /**
   * Calculate overall confidence
   */
  private calculateOverallConfidence(
    industry: any,
    businessSummary: any,
    competitors: any[],
    trustFailures: any[]
  ): number {
    let confidence = 0.5; // Base confidence

    if (industry.confidence > 0.7) confidence += 0.1;
    if (businessSummary?.confidence > 0.7) confidence += 0.1;
    if (competitors.length > 0) confidence += 0.1;
    if (trustFailures.length > 0) confidence += 0.1; // More data = higher confidence

    return Math.max(0, Math.min(1, confidence));
  }
}


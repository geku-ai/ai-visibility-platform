/**
 * Commercial Value Impact Engine
 * 
 * Calculates the commercial value and impact of prompts/clusters for AI visibility.
 * Provides evidence-backed commercial opportunity scoring with industry-specific weighting.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { CommercialValueImpact } from '../types/diagnostic.types';
import { EvidenceBackedShareOfVoiceService } from '../sov/evidence-backed-sov.service';
import { PremiumCitationService } from '../citations/premium-citation-service';
import { EEATCalculatorService } from '../trust/eeat-calculator.service';
import { PremiumGEOScoreService } from '../scoring/premium-geo-score.service';
import { IndustryDetectorService } from '../industry/industry-detector.service';
import { getIndustryWeights } from '../config/industry-weights.config';

@Injectable()
export class CommercialValueImpactService {
  private readonly logger = new Logger(CommercialValueImpactService.name);
  private dbPool: Pool;

  constructor(
    private readonly shareOfVoice: EvidenceBackedShareOfVoiceService,
    private readonly citationService: PremiumCitationService,
    private readonly eeatCalculator: EEATCalculatorService,
    private readonly geoScore: PremiumGEOScoreService,
    private readonly industryDetector: IndustryDetectorService,
  ) {
    this.dbPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
  }

  /**
   * Calculate commercial value impact for a prompt or cluster
   */
  async calculateCommercialValue(
    workspaceId: string,
    brandName: string,
    prompts: string[],
    industry?: string
  ): Promise<CommercialValueImpact> {
    this.logger.log(`Calculating commercial value for ${prompts.length} prompts`);

    try {
      // Get industry context
      const industryContext = industry || await this.getIndustryContext(workspaceId);
      
      // Get current visibility
      const visibility = await this.getCurrentVisibility(workspaceId, brandName, prompts);
      
      // Get competitor SoV
      const competitorSoV = await this.getCompetitorSoV(workspaceId, brandName, prompts);
      
      // Get EEAT score
      const eeatScore = await this.eeatCalculator.calculateEEATScore(workspaceId);
      
      // Get citations strength
      const citationsStrength = await this.getCitationsStrength(workspaceId, brandName);
      
      // Get visibility gaps
      const visibilityGaps = this.calculateVisibilityGaps(visibility);
      
      // Get GEO score potential
      const geoScorePotential = await this.estimateGEOScorePotential(
        workspaceId,
        brandName,
        visibility,
        eeatScore,
        citationsStrength
      );

      // Calculate visibility value index
      const visibilityValueIndex = this.calculateVisibilityValueIndex(
        visibility,
        industryContext
      );

      // Project incremental visibility if fixed
      const projectedVisibilityGain = this.projectVisibilityGain(
        visibility,
        visibilityGaps,
        eeatScore,
        citationsStrength
      );

      // Project incremental AI recommendations
      const projectedRecommendationsGain = this.projectRecommendationsGain(
        projectedVisibilityGain,
        prompts.length
      );

      // Calculate commercial upside
      const commercialUpside = this.calculateCommercialUpside(
        visibilityValueIndex,
        projectedVisibilityGain,
        industryContext
      );

      // Calculate cannibalization risk
      const cannibalizationRisk = this.calculateCannibalizationRisk(
        competitorSoV,
        visibility
      );

      // Calculate engine-by-engine value projection
      const engineValueProjection = this.calculateEngineValueProjection(
        visibility,
        industryContext
      );

      // Calculate cross-engine consensus multiplier
      const crossEngineConsensusMultiplier = this.calculateCrossEngineConsensus(
        visibility
      );

      // Calculate final commercial opportunity score
      const commercialOpportunityScore = this.calculateCommercialOpportunityScore(
        visibilityValueIndex,
        projectedVisibilityGain,
        commercialUpside,
        cannibalizationRisk,
        crossEngineConsensusMultiplier,
        industryContext
      );

      // Collect evidence
      const evidence = await this.collectEvidence(workspaceId, brandName, prompts);

      // Calculate confidence
      const confidence = this.calculateConfidence(visibility, evidence, competitorSoV);

      return {
        visibilityValueIndex,
        projectedVisibilityGain,
        projectedRecommendationsGain,
        commercialUpside,
        cannibalizationRisk,
        engineValueProjection,
        crossEngineConsensusMultiplier,
        commercialOpportunityScore,
        evidence,
        confidence,
      };
    } catch (error) {
      this.logger.error(`Failed to calculate commercial value: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get industry context
   */
  private async getIndustryContext(workspaceId: string): Promise<string> {
    try {
      const result = await this.dbPool.query<{ domain: string }>(
        `SELECT domain FROM "workspaces" WHERE id = $1`,
        [workspaceId]
      );
      if (result.rows[0]?.domain) {
        const classification = await this.industryDetector.detectIndustry(workspaceId, result.rows[0].domain);
        return classification.primaryIndustry;
      }
    } catch (error) {
      this.logger.warn(`Could not get industry context: ${error instanceof Error ? error.message : String(error)}`);
    }
    return 'default';
  }

  /**
   * Get current visibility per engine
   */
  private async getCurrentVisibility(
    workspaceId: string,
    brandName: string,
    prompts: string[]
  ): Promise<{ chatgpt: number; claude: number; gemini: number; perplexity: number }> {
    const visibility = { chatgpt: 0, claude: 0, gemini: 0, perplexity: 0 };
    const engines = ['CHATGPT', 'CLAUDE', 'GEMINI', 'PERPLEXITY'];

    for (const engine of engines) {
      const engineKey = engine.toLowerCase() as keyof typeof visibility;
      
      const result = await this.dbPool.query<{ count: number; total: number }>(
        `SELECT 
          COUNT(DISTINCT m.id) as count,
          COUNT(DISTINCT pr."promptId") as total
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
      if (row && row.total > 0) {
        visibility[engineKey] = Math.round((row.count / row.total) * 100);
      }
    }

    return visibility;
  }

  /**
   * Get competitor share of voice
   */
  private async getCompetitorSoV(
    workspaceId: string,
    brandName: string,
    prompts: string[]
  ): Promise<number> {
    try {
      const sovData = await this.shareOfVoice.calculateEvidenceBackedSOV(
        workspaceId,
        [brandName]
      );
      
      if (sovData.length > 0) {
        return sovData[0].sharePercentage;
      }
    } catch (error) {
      this.logger.warn(`Could not get competitor SoV: ${error instanceof Error ? error.message : String(error)}`);
    }
    return 0;
  }

  /**
   * Get citations strength
   */
  private async getCitationsStrength(
    workspaceId: string,
    brandName: string
  ): Promise<number> {
    try {
      const result = await this.dbPool.query<{ count: number; avgAuthority: number }>(
        `SELECT 
          COUNT(*) as count,
          AVG(c."authorityScore") as "avgAuthority"
        FROM "citations" c
        WHERE c."workspaceId" = $1
          AND LOWER(c."brand") = LOWER($2)`,
        [workspaceId, brandName]
      );

      const row = result.rows[0];
      if (row && row.count > 0) {
        // Strength = count * average authority / 100
        return Math.min(100, Math.round((row.count * (row.avgAuthority || 50)) / 100));
      }
    } catch (error) {
      this.logger.warn(`Could not get citations strength: ${error instanceof Error ? error.message : String(error)}`);
    }
    return 0;
  }

  /**
   * Calculate visibility gaps
   */
  private calculateVisibilityGaps(
    visibility: { chatgpt: number; claude: number; gemini: number; perplexity: number }
  ): { chatgpt: number; claude: number; gemini: number; perplexity: number } {
    return {
      chatgpt: 100 - visibility.chatgpt,
      claude: 100 - visibility.claude,
      gemini: 100 - visibility.gemini,
      perplexity: 100 - visibility.perplexity,
    };
  }

  /**
   * Estimate GEO score potential
   */
  private async estimateGEOScorePotential(
    workspaceId: string,
    brandName: string,
    visibility: { chatgpt: number; claude: number; gemini: number; perplexity: number },
    eeatScore: any,
    citationsStrength: number
  ): Promise<number> {
    // Weighted average visibility
    const avgVisibility = (
      visibility.chatgpt * 0.35 +
      visibility.claude * 0.25 +
      visibility.gemini * 0.20 +
      visibility.perplexity * 0.20
    );

    // Potential = current visibility + room for improvement
    const potential = avgVisibility + (100 - avgVisibility) * 0.7; // Assume 70% of gap can be closed

    return Math.min(100, Math.round(potential));
  }

  /**
   * Calculate visibility value index (0-100)
   */
  private calculateVisibilityValueIndex(
    visibility: { chatgpt: number; claude: number; gemini: number; perplexity: number },
    industry: string
  ): number {
    // Weighted average
    const avgVisibility = (
      visibility.chatgpt * 0.35 +
      visibility.claude * 0.25 +
      visibility.gemini * 0.20 +
      visibility.perplexity * 0.20
    );

    // Apply industry multiplier
    const industryWeights = getIndustryWeights(industry);
    const multiplier = industryWeights?.visibility ? industryWeights.visibility / 0.35 : 1.0;

    return Math.min(100, Math.round(avgVisibility * multiplier));
  }

  /**
   * Project visibility gain if fixed
   */
  private projectVisibilityGain(
    visibility: { chatgpt: number; claude: number; gemini: number; perplexity: number },
    gaps: { chatgpt: number; claude: number; gemini: number; perplexity: number },
    eeatScore: any,
    citationsStrength: number
  ): number {
    // Base gain from closing gaps
    const avgGap = (
      gaps.chatgpt * 0.35 +
      gaps.claude * 0.25 +
      gaps.gemini * 0.20 +
      gaps.perplexity * 0.20
    );

    // Adjust based on EEAT and citations (better signals = more gain potential)
    const signalMultiplier = 1 + ((eeatScore.overallScore || 50) / 100) * 0.2 + (citationsStrength / 100) * 0.1;

    return Math.min(100, Math.round(avgGap * signalMultiplier * 0.7)); // Assume 70% of gap can be closed
  }

  /**
   * Project recommendations gain
   */
  private projectRecommendationsGain(
    visibilityGain: number,
    promptCount: number
  ): number {
    // More visibility = more recommendations
    // Assume 1 recommendation per 10% visibility gain per prompt
    return Math.round((visibilityGain / 10) * promptCount);
  }

  /**
   * Calculate commercial upside (0-100)
   */
  private calculateCommercialUpside(
    visibilityValueIndex: number,
    projectedGain: number,
    industry: string
  ): number {
    // Base upside from visibility gain
    let upside = projectedGain;

    // Industry-specific adjustments
    const lower = industry.toLowerCase();
    if (lower.includes('ota') || lower.includes('travel') || lower.includes('e-commerce')) {
      // High commercial intent industries
      upside *= 1.2;
    } else if (lower.includes('saas') || lower.includes('b2b')) {
      // Medium commercial intent
      upside *= 1.0;
    } else if (lower.includes('local') || lower.includes('service')) {
      // Local services - high local commercial value
      upside *= 1.15;
    }

    return Math.min(100, Math.round(upside));
  }

  /**
   * Calculate cannibalization risk (0-100)
   */
  private calculateCannibalizationRisk(
    competitorSoV: number,
    visibility: { chatgpt: number; claude: number; gemini: number; perplexity: number }
  ): number {
    // Risk increases with competitor dominance
    const avgVisibility = (
      visibility.chatgpt * 0.35 +
      visibility.claude * 0.25 +
      visibility.gemini * 0.20 +
      visibility.perplexity * 0.20
    );

    // If competitors have high SoV and you have low visibility, risk is high
    const risk = (competitorSoV / 100) * (1 - avgVisibility / 100) * 100;

    return Math.min(100, Math.round(risk));
  }

  /**
   * Calculate engine-by-engine value projection
   */
  private calculateEngineValueProjection(
    visibility: { chatgpt: number; claude: number; gemini: number; perplexity: number },
    industry: string
  ): { chatgpt: number; claude: number; gemini: number; perplexity: number } {
    // Value = visibility * industry multiplier
    const industryWeights = getIndustryWeights(industry);
    const multiplier = industryWeights?.visibility ? industryWeights.visibility / 0.35 : 1.0;

    return {
      chatgpt: Math.min(100, Math.round(visibility.chatgpt * multiplier)),
      claude: Math.min(100, Math.round(visibility.claude * multiplier)),
      gemini: Math.min(100, Math.round(visibility.gemini * multiplier)),
      perplexity: Math.min(100, Math.round(visibility.perplexity * multiplier)),
    };
  }

  /**
   * Calculate cross-engine consensus multiplier
   */
  private calculateCrossEngineConsensus(
    visibility: { chatgpt: number; claude: number; gemini: number; perplexity: number }
  ): number {
    const values = [visibility.chatgpt, visibility.claude, visibility.gemini, visibility.perplexity];
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    
    // Calculate variance
    const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    // Lower variance = higher consensus = higher multiplier
    // Consensus multiplier ranges from 1.0 (no consensus) to 1.5 (high consensus)
    const consensus = Math.max(0, 1 - (stdDev / 50)); // Normalize by max std dev of 50
    return 1.0 + (consensus * 0.5);
  }

  /**
   * Calculate final commercial opportunity score (0-100)
   */
  private calculateCommercialOpportunityScore(
    visibilityValueIndex: number,
    projectedGain: number,
    commercialUpside: number,
    cannibalizationRisk: number,
    consensusMultiplier: number,
    industry: string
  ): number {
    // Base score from visibility value and projected gain
    let score = (visibilityValueIndex * 0.3) + (projectedGain * 0.3) + (commercialUpside * 0.3);

    // Apply consensus multiplier
    score *= consensusMultiplier;

    // Reduce by cannibalization risk
    score *= (1 - cannibalizationRisk / 200); // Divide by 200 to make it less punitive

    // Industry-specific adjustments
    const lower = industry.toLowerCase();
    if (lower.includes('ota') || lower.includes('travel')) {
      score *= 1.1; // High commercial value industries
    }

    return Math.min(100, Math.max(0, Math.round(score)));
  }

  /**
   * Collect evidence
   */
  private async collectEvidence(
    workspaceId: string,
    brandName: string,
    prompts: string[]
  ): Promise<string[]> {
    const evidence: string[] = [];

    try {
      const result = await this.dbPool.query<{ snippet: string }>(
        `SELECT m."snippet"
         FROM "mentions" m
         JOIN "answers" a ON a.id = m."answerId"
         JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
         JOIN "prompts" p ON p.id = pr."promptId"
         WHERE pr."workspaceId" = $1
           AND LOWER(m."brand") = LOWER($2)
           AND pr."status" = 'SUCCESS'
           AND p."text" = ANY($3::text[])
         LIMIT 10`,
        [workspaceId, brandName, prompts]
      );

      evidence.push(...result.rows.map(r => r.snippet).filter(Boolean));
    } catch (error) {
      this.logger.warn(`Could not collect evidence: ${error instanceof Error ? error.message : String(error)}`);
    }

    return evidence;
  }

  /**
   * Calculate confidence
   */
  private calculateConfidence(
    visibility: { chatgpt: number; claude: number; gemini: number; perplexity: number },
    evidence: string[],
    competitorSoV: number
  ): number {
    let confidence = 0.5; // Base confidence

    // More evidence = higher confidence
    if (evidence.length > 10) confidence += 0.2;
    else if (evidence.length > 5) confidence += 0.1;
    else if (evidence.length === 0) confidence -= 0.2;

    // More engines with data = higher confidence
    const enginesWithData = Object.values(visibility).filter(v => v > 0).length;
    if (enginesWithData >= 3) confidence += 0.15;
    else if (enginesWithData >= 2) confidence += 0.1;
    else if (enginesWithData === 0) confidence -= 0.15;

    // Competitor data presence
    if (competitorSoV > 0) confidence += 0.1;

    return Math.max(0, Math.min(1, confidence));
  }
}


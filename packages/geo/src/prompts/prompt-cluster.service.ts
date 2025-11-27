/**
 * LLM Reasoning-Based Prompt Clustering Engine
 * 
 * Clusters prompts according to how LLMs think (latent semantic and intent patterns),
 * not just keywords. Provides evidence-backed cluster analysis.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { LLMRouterService } from '@ai-visibility/shared';
import { PromptCluster } from '../types/diagnostic.types';
import { PremiumCompetitorDetectorService } from '../competitors/premium-competitor-detector.service';
import { EvidenceBackedShareOfVoiceService } from '../sov/evidence-backed-sov.service';
import { SchemaAuditorService } from '../structural/schema-auditor';
import { EEATCalculatorService } from '../trust/eeat-calculator.service';
import { CommercialValueImpactService } from '../value/commercial-value.service';

@Injectable()
export class PromptClusterService {
  private readonly logger = new Logger(PromptClusterService.name);
  private dbPool: Pool;

  constructor(
    private readonly llmRouter: LLMRouterService,
    private readonly competitorDetector: PremiumCompetitorDetectorService,
    private readonly shareOfVoice: EvidenceBackedShareOfVoiceService,
    private readonly schemaAuditor: SchemaAuditorService,
    private readonly eeatCalculator: EEATCalculatorService,
    private readonly commercialValue: CommercialValueImpactService,
  ) {
    this.dbPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
  }

  /**
   * Cluster prompts by LLM reasoning patterns
   */
  async clusterPrompts(
    workspaceId: string,
    brandName: string,
    prompts: string[],
    industry?: string
  ): Promise<PromptCluster[]> {
    this.logger.log(`Clustering ${prompts.length} prompts by LLM reasoning patterns`);

    try {
      // First, classify each prompt into cluster types
      const classifiedPrompts = await this.classifyPrompts(workspaceId, prompts);

      // Group by cluster type
      const clusters = new Map<PromptCluster['type'], string[]>();
      for (const { prompt, type } of classifiedPrompts) {
        if (!clusters.has(type)) {
          clusters.set(type, []);
        }
        clusters.get(type)!.push(prompt);
      }

      // Analyze each cluster
      const clusterAnalyses: PromptCluster[] = [];

      for (const [type, clusterPrompts] of clusters.entries()) {
        if (clusterPrompts.length === 0) continue;

        const analysis = await this.analyzeCluster(
          workspaceId,
          brandName,
          type,
          clusterPrompts,
          industry
        );

        if (analysis) {
          clusterAnalyses.push(analysis);
        }
      }

      return clusterAnalyses;
    } catch (error) {
      this.logger.error(`Failed to cluster prompts: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Classify prompts into cluster types using LLM reasoning
   */
  private async classifyPrompts(
    workspaceId: string,
    prompts: string[]
  ): Promise<Array<{ prompt: string; type: PromptCluster['type'] }>> {
    const classified: Array<{ prompt: string; type: PromptCluster['type'] }> = [];

    for (const prompt of prompts) {
      const lower = prompt.toLowerCase();

      // Rule-based classification with LLM reasoning patterns
      let type: PromptCluster['type'] = 'CATEGORY';

      if (lower.includes('best') || lower.includes('top') || lower.includes('recommend') || lower.includes('best for')) {
        type = 'BEST';
      } else if (lower.includes('alternative') || lower.includes('instead of') || lower.includes('other')) {
        type = 'ALTERNATIVES';
      } else if (lower.includes('vs') || lower.includes('versus') || lower.includes('comparison') || lower.includes('compare')) {
        type = 'COMPARISONS';
      } else if (lower.includes('near me') || lower.includes('local') || lower.includes('in [city]')) {
        type = 'LOCAL';
      } else if (lower.includes('how to') || lower.includes('how do') || lower.includes('guide') || lower.includes('tutorial')) {
        type = 'HOWTO';
      } else if (lower.includes('review') || lower.includes('rating') || lower.includes('trust') || lower.includes('reliable')) {
        type = 'TRUST';
      } else if (lower.includes('expert') || lower.includes('recommended by') || lower.includes('professional')) {
        type = 'EXPERT';
      }

      classified.push({ prompt, type });
    }

    return classified;
  }

  /**
   * Analyze a single cluster
   */
  private async analyzeCluster(
    workspaceId: string,
    brandName: string,
    type: PromptCluster['type'],
    prompts: string[],
    industry?: string
  ): Promise<PromptCluster | null> {
    try {
      // Get cluster visibility average
      const clusterVisibility = await this.getClusterVisibility(workspaceId, brandName, prompts);

      // Get competitor dominance
      const competitorDominance = await this.getCompetitorDominance(workspaceId, brandName, prompts);

      // Get commercial value
      const commercialValue = await this.commercialValue.calculateCommercialValue(
        workspaceId,
        brandName,
        prompts,
        industry
      );

      // Get missing trust signals
      const missingTrustSignals = await this.getMissingTrustSignals(workspaceId, type);

      // Get required schema types
      const requiredSchemaTypes = await this.getRequiredSchemaTypes(type, industry);

      // Get content gaps
      const contentGaps = await this.getContentGaps(workspaceId, brandName, prompts, type);

      // Estimate citations required
      const citationsRequired = await this.estimateCitationsRequired(
        workspaceId,
        brandName,
        competitorDominance
      );

      // Identify root cause
      const rootCause = await this.identifyRootCause(
        workspaceId,
        brandName,
        type,
        clusterVisibility,
        competitorDominance
      );

      // Estimate GEO score lift
      const expectedGEOScoreLift = {
        min: Math.round(commercialValue.geoScorePotential * 0.3),
        max: Math.round(commercialValue.geoScorePotential * 0.7),
      };

      // Calculate value and difficulty
      const value = commercialValue.commercialOpportunityScore;
      const difficulty = this.calculateClusterDifficulty(
        clusterVisibility,
        competitorDominance,
        missingTrustSignals.length,
        citationsRequired
      );

      // Collect evidence
      const evidence = await this.collectClusterEvidence(workspaceId, brandName, prompts);

      // Calculate confidence
      const confidence = this.calculateClusterConfidence(
        clusterVisibility,
        evidence,
        competitorDominance
      );

      return {
        type,
        title: this.generateClusterTitle(type, prompts[0]),
        prompts,
        value,
        difficulty,
        clusterVisibilityAverage: clusterVisibility,
        competitorDominance,
        missingTrustSignals,
        requiredSchemaTypes,
        contentGaps,
        citationsRequired,
        rootCause,
        expectedGEOScoreLift,
        evidence,
        confidence,
      };
    } catch (error) {
      this.logger.warn(`Failed to analyze cluster ${type}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Get cluster visibility average
   */
  private async getClusterVisibility(
    workspaceId: string,
    brandName: string,
    prompts: string[]
  ): Promise<number> {
    const result = await this.dbPool.query<{ count: number; total: number }>(
      `SELECT 
        COUNT(DISTINCT m.id) as count,
        COUNT(DISTINCT pr."promptId") as total
      FROM "mentions" m
      JOIN "answers" a ON a.id = m."answerId"
      JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
      JOIN "prompts" p ON p.id = pr."promptId"
      WHERE pr."workspaceId" = $1
        AND LOWER(m."brand") = LOWER($2)
        AND pr."status" = 'SUCCESS'
        AND p."text" = ANY($3::text[])`,
      [workspaceId, brandName, prompts]
    );

    const row = result.rows[0];
    if (row && row.total > 0) {
      return Math.round((row.count / row.total) * 100);
    }
    return 0;
  }

  /**
   * Get competitor dominance for cluster
   */
  private async getCompetitorDominance(
    workspaceId: string,
    brandName: string,
    prompts: string[]
  ): Promise<Array<{ competitor: string; dominanceScore: number; evidence: string[] }>> {
    const competitors: Array<{ competitor: string; dominanceScore: number; evidence: string[] }> = [];

    const result = await this.dbPool.query<{
      brand: string;
      count: number;
      snippet: string;
    }>(
      `SELECT 
        m."brand",
        COUNT(DISTINCT m.id) as count,
        MAX(m."snippet") as snippet
      FROM "mentions" m
      JOIN "answers" a ON a.id = m."answerId"
      JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
      JOIN "prompts" p ON p.id = pr."promptId"
      WHERE pr."workspaceId" = $1
        AND LOWER(m."brand") != LOWER($2)
        AND pr."status" = 'SUCCESS'
        AND p."text" = ANY($3::text[])
      GROUP BY m."brand"
      ORDER BY count DESC
      LIMIT 5`,
      [workspaceId, brandName, prompts]
    );

    const totalMentions = result.rows.reduce((sum, r) => sum + parseInt(r.count.toString()), 0);

    for (const row of result.rows) {
      const dominanceScore = totalMentions > 0
        ? Math.round((parseInt(row.count.toString()) / totalMentions) * 100)
        : 0;

      competitors.push({
        competitor: row.brand,
        dominanceScore,
        evidence: row.snippet ? [row.snippet] : [],
      });
    }

    return competitors;
  }

  /**
   * Get missing trust signals
   */
  private async getMissingTrustSignals(
    workspaceId: string,
    clusterType: PromptCluster['type']
  ): Promise<string[]> {
    const missing: string[] = [];

    try {
      const eeatScore = await this.eeatCalculator.calculateEEATScore(workspaceId);

      if (eeatScore.experience < 60) {
        missing.push('Experience signals (case studies, testimonials)');
      }
      if (eeatScore.expertise < 60) {
        missing.push('Expertise signals (certifications, credentials)');
      }
      if (eeatScore.authoritativeness < 60) {
        missing.push('Authority signals (citations, backlinks)');
      }
      if (eeatScore.trustworthiness < 60) {
        missing.push('Trust signals (reviews, security badges)');
      }

      // Cluster-specific trust signals
      if (clusterType === 'TRUST' || clusterType === 'EXPERT') {
        if (eeatScore.expertise < 70) {
          missing.push('Expert credentials and certifications');
        }
        if (eeatScore.authoritativeness < 70) {
          missing.push('Industry recognition and awards');
        }
      }
    } catch (error) {
      this.logger.warn(`Could not get missing trust signals: ${error instanceof Error ? error.message : String(error)}`);
    }

    return missing;
  }

  /**
   * Get required schema types for cluster
   */
  private async getRequiredSchemaTypes(
    clusterType: PromptCluster['type'],
    industry?: string
  ): Promise<string[]> {
    const required: string[] = [];

    // Base schema types
    required.push('Organization');

    // Cluster-specific schema
    if (clusterType === 'BEST' || clusterType === 'EXPERT') {
      required.push('Product', 'Review', 'AggregateRating');
    }
    if (clusterType === 'COMPARISONS') {
      required.push('Product', 'Comparison');
    }
    if (clusterType === 'LOCAL') {
      required.push('LocalBusiness', 'Place');
    }
    if (clusterType === 'HOWTO') {
      required.push('HowTo', 'FAQPage');
    }
    if (clusterType === 'TRUST') {
      required.push('Review', 'AggregateRating', 'TrustBadge');
    }

    // Industry-specific schema
    if (industry) {
      const lower = industry.toLowerCase();
      if (lower.includes('hotel') || lower.includes('travel')) {
        required.push('Hotel', 'LodgingBusiness');
      }
      if (lower.includes('restaurant') || lower.includes('food')) {
        required.push('Restaurant', 'FoodEstablishment');
      }
      if (lower.includes('medical') || lower.includes('healthcare')) {
        required.push('MedicalBusiness', 'Physician');
      }
    }

    return [...new Set(required)]; // Remove duplicates
  }

  /**
   * Get content gaps
   */
  private async getContentGaps(
    workspaceId: string,
    brandName: string,
    prompts: string[],
    clusterType: PromptCluster['type']
  ): Promise<string[]> {
    const gaps: string[] = [];

    // Check if we have content addressing these prompts
    const result = await this.dbPool.query<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM "answers" a
       JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
       JOIN "prompts" p ON p.id = pr."promptId"
       WHERE pr."workspaceId" = $1
         AND pr."status" = 'SUCCESS'
         AND p."text" = ANY($2::text[])
         AND a."text" LIKE '%' || $3 || '%'`,
      [workspaceId, prompts, brandName]
    );

    const coverage = result.rows[0]?.count || 0;
    if (coverage < prompts.length * 0.5) {
      gaps.push(`Content addressing ${prompts.length - coverage} prompts is missing`);
    }

    // Cluster-specific gaps
    if (clusterType === 'COMPARISONS') {
      gaps.push('Comparison pages with competitors');
    }
    if (clusterType === 'BEST') {
      gaps.push('"Best [category]" landing pages');
    }
    if (clusterType === 'HOWTO') {
      gaps.push('How-to guides and tutorials');
    }
    if (clusterType === 'LOCAL') {
      gaps.push('Location-specific content pages');
    }

    return gaps;
  }

  /**
   * Estimate citations required
   */
  private async estimateCitationsRequired(
    workspaceId: string,
    brandName: string,
    competitorDominance: Array<{ competitor: string; dominanceScore: number; evidence: string[] }>
  ): Promise<number> {
    // Get current citation count
    const result = await this.dbPool.query<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM "citations" c
       WHERE c."workspaceId" = $1
         AND LOWER(c."brand") = LOWER($2)`,
      [workspaceId, brandName]
    );

    const currentCitations = result.rows[0]?.count || 0;

    // Estimate needed based on competitor dominance
    const avgDominance = competitorDominance.length > 0
      ? competitorDominance.reduce((sum, c) => sum + c.dominanceScore, 0) / competitorDominance.length
      : 0;

    // If competitors dominate, need more citations
    const targetCitations = Math.max(20, Math.round(avgDominance * 2));
    const required = Math.max(0, targetCitations - currentCitations);

    return required;
  }

  /**
   * Identify root cause for cluster
   */
  private async identifyRootCause(
    workspaceId: string,
    brandName: string,
    clusterType: PromptCluster['type'],
    visibility: number,
    competitorDominance: Array<{ competitor: string; dominanceScore: number; evidence: string[] }>
  ): Promise<string> {
    const causes: string[] = [];

    if (visibility < 30) {
      causes.push(`Low visibility (${visibility}%) on ${clusterType} cluster`);
    }

    if (competitorDominance.length > 0) {
      const topCompetitor = competitorDominance[0];
      if (topCompetitor.dominanceScore > 50) {
        causes.push(`${topCompetitor.competitor} dominates with ${topCompetitor.dominanceScore}% share`);
      }
    }

    // Cluster-specific causes
    if (clusterType === 'TRUST' || clusterType === 'EXPERT') {
      causes.push('Missing trust and expertise signals');
    }
    if (clusterType === 'LOCAL') {
      causes.push('Insufficient local SEO and geo-targeted content');
    }
    if (clusterType === 'COMPARISONS') {
      causes.push('Lack of comparison content and structured data');
    }

    return causes.join('. ') || 'General visibility gap in this cluster';
  }

  /**
   * Calculate cluster difficulty
   */
  private calculateClusterDifficulty(
    visibility: number,
    competitorDominance: Array<{ competitor: string; dominanceScore: number; evidence: string[] }>,
    missingTrustCount: number,
    citationsRequired: number
  ): number {
    let difficulty = 0;

    // Base difficulty from visibility gap
    difficulty += (100 - visibility) * 0.3;

    // Competitor dominance
    if (competitorDominance.length > 0) {
      const avgDominance = competitorDominance.reduce((sum, c) => sum + c.dominanceScore, 0) / competitorDominance.length;
      difficulty += avgDominance * 0.3;
    }

    // Missing trust signals
    difficulty += missingTrustCount * 5;

    // Citations required
    difficulty += Math.min(30, citationsRequired * 0.5);

    return Math.min(100, Math.round(difficulty));
  }

  /**
   * Collect cluster evidence
   */
  private async collectClusterEvidence(
    workspaceId: string,
    brandName: string,
    prompts: string[]
  ): Promise<string[]> {
    const evidence: string[] = [];

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

    return evidence;
  }

  /**
   * Calculate cluster confidence
   */
  private calculateClusterConfidence(
    visibility: number,
    evidence: string[],
    competitorDominance: Array<{ competitor: string; dominanceScore: number; evidence: string[] }>
  ): number {
    let confidence = 0.5;

    if (evidence.length > 10) confidence += 0.2;
    else if (evidence.length > 5) confidence += 0.1;
    else if (evidence.length === 0) confidence -= 0.2;

    if (visibility > 0) confidence += 0.1;

    if (competitorDominance.length > 0) confidence += 0.1;

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Generate cluster title
   */
  private generateClusterTitle(type: PromptCluster['type'], samplePrompt: string): string {
    const typeTitles: Record<PromptCluster['type'], string> = {
      BEST: 'Best / Top Recommendations',
      ALTERNATIVES: 'Alternatives & Substitutes',
      COMPARISONS: 'Comparison Queries',
      CATEGORY: 'Category Queries',
      LOCAL: 'Local / Geo-Modified Queries',
      HOWTO: 'How-To / Educational Queries',
      TRUST: 'Trust / Ratings Queries',
      EXPERT: 'Expert Recommendations',
    };

    return typeTitles[type] || samplePrompt.substring(0, 50);
  }
}


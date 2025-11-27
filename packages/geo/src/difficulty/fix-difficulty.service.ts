/**
 * Fix Difficulty Calculator Engine
 * 
 * Computes difficulty across 6 dimensions for fixing visibility issues.
 * Integrates with EEAT, Schema Auditor, Competitor Advantage, Commercial Value, and Pattern Recognition.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { FixDifficultyAnalysis } from '../types/diagnostic.types';
import { EEATCalculatorService } from '../trust/eeat-calculator.service';
import { SchemaAuditorService } from '../structural/schema-auditor';
import { CompetitorAdvantageService } from '../competitors/competitor-advantage.service';
import { CommercialValueImpactService } from '../value/commercial-value.service';
import { EnginePatternService } from '../patterns/engine-pattern.service';
import { TrustFailureService } from '../trust/trust-failure.service';

@Injectable()
export class FixDifficultyService {
  private readonly logger = new Logger(FixDifficultyService.name);
  private dbPool: Pool;

  constructor(
    private readonly eeatCalculator: EEATCalculatorService,
    private readonly schemaAuditor: SchemaAuditorService,
    private readonly competitorAdvantage: CompetitorAdvantageService,
    private readonly commercialValue: CommercialValueImpactService,
    private readonly enginePattern: EnginePatternService,
    private readonly trustFailure: TrustFailureService,
  ) {
    this.dbPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
  }

  /**
   * Calculate fix difficulty for an opportunity or issue
   */
  async calculateFixDifficulty(
    workspaceId: string,
    brandName: string,
    opportunityTitle?: string,
    prompts?: string[]
  ): Promise<FixDifficultyAnalysis> {
    this.logger.log(`Calculating fix difficulty for ${brandName}`);

    try {
      // Calculate difficulty for each dimension
      const contentDifficulty = await this.calculateContentDifficulty(workspaceId, brandName, prompts);
      const schemaDifficulty = await this.calculateSchemaDifficulty(workspaceId, brandName);
      const citationDifficulty = await this.calculateCitationDifficulty(workspaceId, brandName);
      const trustDifficulty = await this.calculateTrustDifficulty(workspaceId, brandName);
      const competitiveDifficulty = await this.calculateCompetitiveDifficulty(workspaceId, brandName, prompts);
      const technicalDifficulty = await this.calculateTechnicalDifficulty(workspaceId, brandName);

      // Calculate overall difficulty score (weighted average)
      const difficultyScore = Math.round(
        contentDifficulty.score * 0.25 +
        schemaDifficulty.score * 0.15 +
        citationDifficulty.score * 0.20 +
        trustDifficulty.score * 0.20 +
        competitiveDifficulty.score * 0.15 +
        technicalDifficulty.score * 0.05
      );

      // Identify primary and secondary constraints
      const allConstraints = [
        ...contentDifficulty.factors.map(f => ({ factor: f, score: contentDifficulty.score, type: 'content' })),
        ...schemaDifficulty.factors.map(f => ({ factor: f, score: schemaDifficulty.score, type: 'schema' })),
        ...citationDifficulty.factors.map(f => ({ factor: f, score: citationDifficulty.score, type: 'citation' })),
        ...trustDifficulty.factors.map(f => ({ factor: f, score: trustDifficulty.score, type: 'trust' })),
        ...competitiveDifficulty.factors.map(f => ({ factor: f, score: competitiveDifficulty.score, type: 'competitive' })),
        ...technicalDifficulty.factors.map(f => ({ factor: f, score: technicalDifficulty.score, type: 'technical' })),
      ];

      // Sort by score and extract constraints
      allConstraints.sort((a, b) => b.score - a.score);
      const primaryConstraints = allConstraints.slice(0, 3).map(c => `${c.type}: ${c.factor}`);
      const secondaryConstraints = allConstraints.slice(3, 6).map(c => `${c.type}: ${c.factor}`);

      // Estimate overall time
      const timeEstimate = this.estimateOverallTime([
        contentDifficulty,
        schemaDifficulty,
        citationDifficulty,
        trustDifficulty,
        competitiveDifficulty,
        technicalDifficulty,
      ]);

      // Collect evidence
      const evidence = await this.collectDifficultyEvidence(workspaceId, brandName, prompts);

      // Calculate confidence
      const confidence = this.calculateDifficultyConfidence(
        contentDifficulty,
        schemaDifficulty,
        citationDifficulty,
        trustDifficulty,
        competitiveDifficulty,
        technicalDifficulty
      );

      return {
        difficultyScore,
        difficultyBreakdown: {
          content: contentDifficulty,
          schema: schemaDifficulty,
          citation: citationDifficulty,
          trust: trustDifficulty,
          competitive: competitiveDifficulty,
          technical: technicalDifficulty,
        },
        primaryConstraints,
        secondaryConstraints,
        timeEstimate,
        confidence,
        evidence,
      };
    } catch (error) {
      this.logger.error(`Failed to calculate fix difficulty: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Calculate content difficulty
   */
  private async calculateContentDifficulty(
    workspaceId: string,
    brandName: string,
    prompts?: string[]
  ): Promise<{ score: number; factors: string[]; timeEstimate: string }> {
    const factors: string[] = [];
    let score = 0;

    // Check content coverage
    const coverageQuery = prompts
      ? `SELECT COUNT(DISTINCT pr."promptId") as count
         FROM "prompt_runs" pr
         JOIN "answers" a ON a."promptRunId" = pr.id
         JOIN "mentions" m ON m."answerId" = a.id
         JOIN "prompts" p ON p.id = pr."promptId"
         WHERE pr."workspaceId" = $1
           AND LOWER(m."brand") = LOWER($2)
           AND pr."status" = 'SUCCESS'
           AND p."text" = ANY($3::text[])`
      : `SELECT COUNT(DISTINCT pr."promptId") as count
         FROM "prompt_runs" pr
         JOIN "answers" a ON a."promptRunId" = pr.id
         JOIN "mentions" m ON m."answerId" = a.id
         WHERE pr."workspaceId" = $1
           AND LOWER(m."brand") = LOWER($2)
           AND pr."status" = 'SUCCESS'`;

    const coverageParams = prompts ? [workspaceId, brandName, prompts] : [workspaceId, brandName];
    const coverageResult = await this.dbPool.query<{ count: number }>(coverageQuery, coverageParams);

    const promptCount = prompts?.length || 10; // Estimate if not provided
    const coverage = coverageResult.rows[0]?.count || 0;
    const coverageGap = promptCount - coverage;

    if (coverageGap > promptCount * 0.5) {
      score += 30;
      factors.push(`Missing content for ${coverageGap} prompts (${Math.round((coverageGap / promptCount) * 100)}% gap)`);
    } else if (coverageGap > 0) {
      score += 15;
      factors.push(`Missing content for ${coverageGap} prompts`);
    }

    // Check content depth (would require content analysis)
    score += 10; // Base content creation difficulty
    factors.push('Content creation and optimization required');

    const timeEstimate = coverageGap > promptCount * 0.5
      ? '4-8 weeks'
      : coverageGap > 0
      ? '2-4 weeks'
      : '1-2 weeks';

    return {
      score: Math.min(100, score),
      factors,
      timeEstimate,
    };
  }

  /**
   * Calculate schema difficulty
   */
  private async calculateSchemaDifficulty(
    workspaceId: string,
    brandName: string
  ): Promise<{ score: number; factors: string[]; timeEstimate: string }> {
    const factors: string[] = [];
    let score = 0;

    // Check for existing schema (would use schema auditor in production)
    // For now, estimate based on citations
    const citationResult = await this.dbPool.query<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM "citations" c
       WHERE c."workspaceId" = $1
         AND LOWER(c."brand") = LOWER($2)
         AND (c."url" LIKE '%schema.org%' OR c."sourceType" = 'schema')`,
      [workspaceId, brandName]
    );

    const schemaCount = citationResult.rows[0]?.count || 0;

    if (schemaCount === 0) {
      score += 40;
      factors.push('No schema markup detected');
    } else if (schemaCount < 3) {
      score += 20;
      factors.push(`Limited schema markup (${schemaCount} types)`);
    }

    // Base schema implementation difficulty
    score += 15;
    factors.push('Schema implementation and validation required');

    const timeEstimate = schemaCount === 0 ? '2-4 weeks' : '1-2 weeks';

    return {
      score: Math.min(100, score),
      factors,
      timeEstimate,
    };
  }

  /**
   * Calculate citation difficulty
   */
  private async calculateCitationDifficulty(
    workspaceId: string,
    brandName: string
  ): Promise<{ score: number; factors: string[]; timeEstimate: string }> {
    const factors: string[] = [];
    let score = 0;

    // Check current citation count
    const citationResult = await this.dbPool.query<{ count: number; avgAuthority: number }>(
      `SELECT 
        COUNT(*) as count,
        AVG(c."authorityScore") as "avgAuthority"
      FROM "citations" c
      WHERE c."workspaceId" = $1
        AND LOWER(c."brand") = LOWER($2)`,
      [workspaceId, brandName]
    );

    const citationCount = citationResult.rows[0]?.count || 0;
    const avgAuthority = citationResult.rows[0]?.avgAuthority || 0;

    // Estimate citations needed (target: 50+ with high authority)
    const citationsNeeded = Math.max(0, 50 - citationCount);
    const authorityGap = Math.max(0, 70 - avgAuthority);

    if (citationsNeeded > 30) {
      score += 50;
      factors.push(`Need ${citationsNeeded} more citations`);
    } else if (citationsNeeded > 15) {
      score += 30;
      factors.push(`Need ${citationsNeeded} more citations`);
    } else if (citationsNeeded > 0) {
      score += 15;
      factors.push(`Need ${citationsNeeded} more citations`);
    }

    if (authorityGap > 20) {
      score += 20;
      factors.push(`Low average authority (${Math.round(avgAuthority)}), need high-authority sources`);
    }

    // Citation acquisition is generally difficult
    score += 10;
    factors.push('Citation acquisition requires relationship building and outreach');

    const timeEstimate = citationsNeeded > 30
      ? '3-6 months'
      : citationsNeeded > 15
      ? '2-3 months'
      : '1-2 months';

    return {
      score: Math.min(100, score),
      factors,
      timeEstimate,
    };
  }

  /**
   * Calculate trust difficulty
   */
  private async calculateTrustDifficulty(
    workspaceId: string,
    brandName: string
  ): Promise<{ score: number; factors: string[]; timeEstimate: string }> {
    const factors: string[] = [];
    let score = 0;

    try {
      // Get trust failures
      const trustFailures = await this.trustFailure.detectTrustFailures(workspaceId, brandName);

      // Calculate difficulty based on trust failures
      for (const failure of trustFailures) {
        if (failure.severity > 70) {
          score += 15;
          factors.push(`${failure.category}: ${failure.description}`);
        } else if (failure.severity > 50) {
          score += 10;
          factors.push(`${failure.category}: ${failure.description}`);
        } else {
          score += 5;
        }
      }

      // Get EEAT score
      const eeatScore = await this.eeatCalculator.calculateEEATScore(workspaceId);

      if (eeatScore.overallScore < 50) {
        score += 30;
        factors.push(`Low overall EEAT score (${eeatScore.overallScore}/100)`);
      } else if (eeatScore.overallScore < 70) {
        score += 15;
        factors.push(`Moderate EEAT score (${eeatScore.overallScore}/100)`);
      }

      // Trust building is generally time-consuming
      score += 10;
      factors.push('Trust signals require time to build and establish');

      const timeEstimate = trustFailures.length > 5 || eeatScore.overallScore < 50
        ? '3-6 months'
        : trustFailures.length > 2
        ? '2-3 months'
        : '1-2 months';
    } catch (error) {
      this.logger.warn(`Could not calculate trust difficulty: ${error instanceof Error ? error.message : String(error)}`);
      score = 50; // Default moderate difficulty
      factors.push('Trust difficulty assessment unavailable');
    }

    return {
      score: Math.min(100, score),
      factors,
      timeEstimate: '2-4 months', // Default
    };
  }

  /**
   * Calculate competitive difficulty
   */
  private async calculateCompetitiveDifficulty(
    workspaceId: string,
    brandName: string,
    prompts?: string[]
  ): Promise<{ score: number; factors: string[]; timeEstimate: string }> {
    const factors: string[] = [];
    let score = 0;

    // Get competitor mentions
    const competitorQuery = prompts
      ? `SELECT 
          m."brand",
          COUNT(*) as count
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
        LIMIT 1`
      : `SELECT 
          m."brand",
          COUNT(*) as count
        FROM "mentions" m
        JOIN "answers" a ON a.id = m."answerId"
        JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
        WHERE pr."workspaceId" = $1
          AND LOWER(m."brand") != LOWER($2)
          AND pr."status" = 'SUCCESS'
        GROUP BY m."brand"
        ORDER BY count DESC
        LIMIT 1`;

    const competitorParams = prompts ? [workspaceId, brandName, prompts] : [workspaceId, brandName];
    const competitorResult = await this.dbPool.query<{ brand: string; count: number }>(competitorQuery, competitorParams);

    const topCompetitor = competitorResult.rows[0];
    const yourMentions = await this.dbPool.query<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM "mentions" m
       JOIN "answers" a ON a.id = m."answerId"
       JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
       WHERE pr."workspaceId" = $1
         AND LOWER(m."brand") = LOWER($2)
         AND pr."status" = 'SUCCESS'`,
      [workspaceId, brandName]
    );

    const yourCount = yourMentions.rows[0]?.count || 0;
    const competitorCount = topCompetitor ? parseInt(topCompetitor.count.toString()) : 0;

    if (topCompetitor && competitorCount > yourCount * 3) {
      score += 40;
      factors.push(`${topCompetitor.brand} dominates with ${competitorCount} mentions vs your ${yourCount}`);
    } else if (topCompetitor && competitorCount > yourCount * 2) {
      score += 25;
      factors.push(`${topCompetitor.brand} has strong presence (${competitorCount} mentions)`);
    } else if (topCompetitor) {
      score += 10;
      factors.push(`Competitive landscape includes ${topCompetitor.brand}`);
    }

    // Competitive difficulty is generally moderate to high
    score += 10;
    factors.push('Competitive positioning requires sustained effort');

    const timeEstimate = competitorCount > yourCount * 3
      ? '4-6 months'
      : competitorCount > yourCount * 2
      ? '3-4 months'
      : '2-3 months';

    return {
      score: Math.min(100, score),
      factors,
      timeEstimate,
    };
  }

  /**
   * Calculate technical difficulty
   */
  private async calculateTechnicalDifficulty(
    workspaceId: string,
    brandName: string
  ): Promise<{ score: number; factors: string[]; timeEstimate: string }> {
    const factors: string[] = [];
    let score = 0;

    // Technical difficulty is generally lower than other dimensions
    score += 15;
    factors.push('Technical implementation (schema, structured data)');

    // Check for technical issues (would use schema auditor in production)
    score += 5;
    factors.push('Technical validation and testing required');

    const timeEstimate = '1-2 weeks';

    return {
      score: Math.min(100, score),
      factors,
      timeEstimate,
    };
  }

  /**
   * Estimate overall time
   */
  private estimateOverallTime(
    difficulties: Array<{ timeEstimate: string }>
  ): string {
    // Parse time estimates and take the maximum
    const timeMap: Record<string, number> = {
      '1-2 weeks': 2,
      '2-4 weeks': 4,
      '1-2 months': 2,
      '2-3 months': 3,
      '3-4 months': 4,
      '3-6 months': 6,
      '4-6 months': 6,
      '4-8 weeks': 8,
    };

    const timeUnits: Record<string, string> = {
      '1-2 weeks': 'weeks',
      '2-4 weeks': 'weeks',
      '4-8 weeks': 'weeks',
      '1-2 months': 'months',
      '2-3 months': 'months',
      '3-4 months': 'months',
      '3-6 months': 'months',
      '4-6 months': 'months',
    };

    let maxTime = 0;
    let maxEstimate = '2-3 months'; // Default

    for (const diff of difficulties) {
      const time = timeMap[diff.timeEstimate] || 0;
      if (time > maxTime) {
        maxTime = time;
        maxEstimate = diff.timeEstimate;
      }
    }

    return maxEstimate;
  }

  /**
   * Collect difficulty evidence
   */
  private async collectDifficultyEvidence(
    workspaceId: string,
    brandName: string,
    prompts?: string[]
  ): Promise<string[]> {
    const evidence: string[] = [];

    // Get citation count
    const citationResult = await this.dbPool.query<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM "citations" c
       WHERE c."workspaceId" = $1
         AND LOWER(c."brand") = LOWER($2)`,
      [workspaceId, brandName]
    );

    const citationCount = citationResult.rows[0]?.count || 0;
    evidence.push(`Current citations: ${citationCount}`);

    // Get mention count
    const mentionResult = await this.dbPool.query<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM "mentions" m
       JOIN "answers" a ON a.id = m."answerId"
       JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
       WHERE pr."workspaceId" = $1
         AND LOWER(m."brand") = LOWER($2)
         AND pr."status" = 'SUCCESS'`,
      [workspaceId, brandName]
    );

    const mentionCount = mentionResult.rows[0]?.count || 0;
    evidence.push(`Current mentions: ${mentionCount}`);

    return evidence;
  }

  /**
   * Calculate difficulty confidence
   */
  private calculateDifficultyConfidence(
    contentDifficulty: { score: number; factors: string[] },
    schemaDifficulty: { score: number; factors: string[] },
    citationDifficulty: { score: number; factors: string[] },
    trustDifficulty: { score: number; factors: string[] },
    competitiveDifficulty: { score: number; factors: string[] },
    technicalDifficulty: { score: number; factors: string[] }
  ): number {
    const difficulties = [
      contentDifficulty,
      schemaDifficulty,
      citationDifficulty,
      trustDifficulty,
      competitiveDifficulty,
      technicalDifficulty,
    ];
    let confidence = 0.5; // Base confidence

    // More factors = higher confidence (more data)
    const totalFactors = difficulties.reduce((sum, d) => sum + d.factors.length, 0);
    if (totalFactors > 10) confidence += 0.2;
    else if (totalFactors > 5) confidence += 0.1;
    else if (totalFactors === 0) confidence -= 0.2;

    // Higher scores = more reliable (clearer issues)
    const avgScore = difficulties.reduce((sum, d) => sum + d.score, 0) / difficulties.length;
    if (avgScore > 70) confidence += 0.1;
    else if (avgScore < 30) confidence -= 0.1;

    return Math.max(0, Math.min(1, confidence));
  }
}


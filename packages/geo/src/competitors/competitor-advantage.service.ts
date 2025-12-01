/**
 * Competitor Advantage & Weakness Attribution Engine
 * 
 * Analyzes which competitors dominate opportunities and why.
 * Identifies structural advantages/weaknesses and realistic advantage opportunities.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { CompetitorAdvantageAnalysis } from '../types/diagnostic.types';
import { PremiumCitationService } from '../citations/premium-citation-service';
import { SchemaAuditorService } from '../structural/schema-auditor';
import { EEATCalculatorService } from '../trust/eeat-calculator.service';
import { EvidenceBackedShareOfVoiceService } from '../sov/evidence-backed-sov.service';

@Injectable()
export class CompetitorAdvantageService {
  private readonly logger = new Logger(CompetitorAdvantageService.name);
  private dbPool: Pool;

  constructor(
    private readonly citationService: PremiumCitationService,
    private readonly schemaAuditor: SchemaAuditorService,
    private readonly eeatCalculator: EEATCalculatorService,
    private readonly shareOfVoice: EvidenceBackedShareOfVoiceService,
  ) {
    this.dbPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
  }

  /**
   * Analyze competitor advantage and weakness for an opportunity/cluster
   */
  async analyzeCompetitorAdvantage(
    workspaceId: string,
    brandName: string,
    competitorName: string,
    prompts?: string[]
  ): Promise<CompetitorAdvantageAnalysis> {
    this.logger.log(`Analyzing competitor advantage for ${competitorName}`);

    try {
      // Get advantage factors
      const advantageFactors = await this.identifyAdvantageFactors(
        workspaceId,
        competitorName,
        prompts
      );

      // Get weakness factors
      const weaknessFactors = await this.identifyWeaknessFactors(
        workspaceId,
        competitorName,
        prompts
      );

      // Calculate structural advantage score
      const structuralAdvantageScore = this.calculateStructuralAdvantageScore(advantageFactors);

      // Calculate structural weakness score
      const structuralWeaknessScore = this.calculateStructuralWeaknessScore(weaknessFactors);

      // Collect evidence
      const evidence = await this.collectCompetitorEvidence(workspaceId, competitorName, prompts);

      // Calculate engine-specific strength
      const engineStrength = await this.calculateEngineStrength(workspaceId, competitorName, prompts);

      // Analyze signal interpretation (historical vs real-time)
      const signalInterpretation = await this.analyzeSignalInterpretation(
        workspaceId,
        competitorName,
        prompts
      );

      // Identify your advantage opportunities
      const yourAdvantageOpportunity = await this.identifyYourAdvantageOpportunity(
        workspaceId,
        brandName,
        competitorName,
        advantageFactors,
        weaknessFactors
      );

      return {
        competitor: competitorName,
        advantageFactors,
        weaknessFactors,
        structuralAdvantageScore,
        structuralWeaknessScore,
        evidence,
        engineStrength,
        signalInterpretation,
        yourAdvantageOpportunity,
      };
    } catch (error) {
      this.logger.error(`Failed to analyze competitor advantage: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Identify advantage factors
   */
  private async identifyAdvantageFactors(
    workspaceId: string,
    competitorName: string,
    prompts?: string[]
  ): Promise<Array<{ factor: string; impact: 'high' | 'medium' | 'low'; evidence: string[] }>> {
    const factors: Array<{ factor: string; impact: 'high' | 'medium' | 'low'; evidence: string[] }> = [];

    // Check citations
    const citationResult = await this.dbPool.query<{ count: number; avgAuthority: number }>(
      `SELECT 
        COUNT(*) as count,
        AVG(c."authorityScore") as "avgAuthority"
      FROM "citations" c
      WHERE c."workspaceId" = $1
        AND LOWER(c."brand") = LOWER($2)`,
      [workspaceId, competitorName]
    );

    const citationCount = citationResult.rows[0]?.count || 0;
    const avgAuthority = citationResult.rows[0]?.avgAuthority || 0;

    if (citationCount > 50) {
      factors.push({
        factor: `Strong citation profile: ${citationCount} citations with average authority ${Math.round(avgAuthority)}`,
        impact: 'high',
        evidence: [`${citationCount} citations found`],
      });
    } else if (citationCount > 20) {
      factors.push({
        factor: `Moderate citation profile: ${citationCount} citations`,
        impact: 'medium',
        evidence: [`${citationCount} citations found`],
      });
    }

    // Check mentions/visibility
    const mentionQuery = prompts
      ? `SELECT COUNT(*) as count
         FROM "mentions" m
         JOIN "answers" a ON a.id = m."answerId"
         JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
         JOIN "prompts" p ON p.id = pr."promptId"
         WHERE pr."workspaceId" = $1
           AND LOWER(m."brand") = LOWER($2)
           AND pr."status" = 'SUCCESS'
           AND p."text" = ANY($3::text[])`
      : `SELECT COUNT(*) as count
         FROM "mentions" m
         JOIN "answers" a ON a.id = m."answerId"
         JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
         WHERE pr."workspaceId" = $1
           AND LOWER(m."brand") = LOWER($2)
           AND pr."status" = 'SUCCESS'`;

    const mentionParams = prompts ? [workspaceId, competitorName, prompts] : [workspaceId, competitorName];
    const mentionResult = await this.dbPool.query<{ count: number }>(mentionQuery, mentionParams);

    const mentionCount = mentionResult.rows[0]?.count || 0;

    if (mentionCount > 30) {
      factors.push({
        factor: `High AI visibility: ${mentionCount} mentions across prompts`,
        impact: 'high',
        evidence: [`${mentionCount} mentions found`],
      });
    }

    // Check average position
    const positionResult = await this.dbPool.query<{ avgPosition: number; bestPosition: number }>(
      `SELECT 
        AVG(m."position") as "avgPosition",
        MIN(m."position") as "bestPosition"
      FROM "mentions" m
      JOIN "answers" a ON a.id = m."answerId"
      JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
      WHERE pr."workspaceId" = $1
        AND LOWER(m."brand") = LOWER($2)
        AND pr."status" = 'SUCCESS'
        AND m."position" > 0`,
      [workspaceId, competitorName]
    );

    const avgPosition = positionResult.rows[0]?.avgPosition || 999;
    const bestPosition = positionResult.rows[0]?.bestPosition || 999;

    if (avgPosition < 3) {
      factors.push({
        factor: `Strong ranking positions: Average position ${Math.round(avgPosition)}, best position ${bestPosition}`,
        impact: 'high',
        evidence: [`Average position: ${Math.round(avgPosition)}`],
      });
    } else if (avgPosition < 5) {
      factors.push({
        factor: `Good ranking positions: Average position ${Math.round(avgPosition)}`,
        impact: 'medium',
        evidence: [`Average position: ${Math.round(avgPosition)}`],
      });
    }

    // Check sentiment
    const sentimentResult = await this.dbPool.query<{ sentiment: string; count: number }>(
      `SELECT 
        m."sentiment",
        COUNT(*) as count
      FROM "mentions" m
      JOIN "answers" a ON a.id = m."answerId"
      JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
      WHERE pr."workspaceId" = $1
        AND LOWER(m."brand") = LOWER($2)
        AND pr."status" = 'SUCCESS'
      GROUP BY m."sentiment"
      ORDER BY count DESC`,
      [workspaceId, competitorName]
    );

    const positiveCount = sentimentResult.rows.find(r => r.sentiment === 'POS')?.count || 0;
    const totalSentiment = sentimentResult.rows.reduce((sum, r) => sum + parseInt(r.count.toString()), 0);

    if (totalSentiment > 0 && (positiveCount / totalSentiment) > 0.7) {
      factors.push({
        factor: `Positive sentiment: ${Math.round((positiveCount / totalSentiment) * 100)}% positive mentions`,
        impact: 'medium',
        evidence: [`${positiveCount} positive mentions out of ${totalSentiment} total`],
      });
    }

    return factors;
  }

  /**
   * Identify weakness factors
   */
  private async identifyWeaknessFactors(
    workspaceId: string,
    competitorName: string,
    prompts?: string[]
  ): Promise<Array<{ factor: string; impact: 'high' | 'medium' | 'low'; evidence: string[] }>> {
    const factors: Array<{ factor: string; impact: 'high' | 'medium' | 'low'; evidence: string[] }> = [];

    // Check citation count
    const citationResult = await this.dbPool.query<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM "citations" c
       WHERE c."workspaceId" = $1
         AND LOWER(c."brand") = LOWER($2)`,
      [workspaceId, competitorName]
    );

    const citationCount = citationResult.rows[0]?.count || 0;

    if (citationCount < 10) {
      factors.push({
        factor: `Low citation density: Only ${citationCount} citations found`,
        impact: 'high',
        evidence: [`${citationCount} citations`],
      });
    }

    // Check visibility gaps
    const engines = ['CHATGPT', 'CLAUDE', 'GEMINI', 'PERPLEXITY'];
    const engineVisibility: string[] = [];

    for (const engine of engines) {
      const query = prompts
        ? `SELECT COUNT(*) as count
           FROM "mentions" m
           JOIN "answers" a ON a.id = m."answerId"
           JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
           JOIN "prompts" p ON p.id = pr."promptId"
           JOIN "engines" e ON e.id = pr."engineId"
           WHERE pr."workspaceId" = $1
             AND LOWER(m."brand") = LOWER($2)
             AND e."key" = $3
             AND pr."status" = 'SUCCESS'
             AND p."text" = ANY($4::text[])`
        : `SELECT COUNT(*) as count
           FROM "mentions" m
           JOIN "answers" a ON a.id = m."answerId"
           JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
           JOIN "engines" e ON e.id = pr."engineId"
           WHERE pr."workspaceId" = $1
             AND LOWER(m."brand") = LOWER($2)
             AND e."key" = $3
             AND pr."status" = 'SUCCESS'`;

      const params = prompts ? [workspaceId, competitorName, engine, prompts] : [workspaceId, competitorName, engine];
      const result = await this.dbPool.query<{ count: number }>(query, params);

      const count = result.rows[0]?.count || 0;
      if (count === 0) {
        engineVisibility.push(engine.toLowerCase());
      }
    }

    if (engineVisibility.length > 0) {
      factors.push({
        factor: `Missing visibility on ${engineVisibility.length} engine(s): ${engineVisibility.join(', ')}`,
        impact: engineVisibility.length >= 2 ? 'high' : 'medium',
        evidence: [`No mentions on: ${engineVisibility.join(', ')}`],
      });
    }

    // Check negative sentiment
    const sentimentResult = await this.dbPool.query<{ sentiment: string; count: number }>(
      `SELECT 
        m."sentiment",
        COUNT(*) as count
      FROM "mentions" m
      JOIN "answers" a ON a.id = m."answerId"
      JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
      WHERE pr."workspaceId" = $1
        AND LOWER(m."brand") = LOWER($2)
        AND pr."status" = 'SUCCESS'
      GROUP BY m."sentiment"`,
      [workspaceId, competitorName]
    );

    const negativeCount = sentimentResult.rows.find(r => r.sentiment === 'NEG')?.count || 0;
    const totalSentiment = sentimentResult.rows.reduce((sum, r) => sum + parseInt(r.count.toString()), 0);

    if (totalSentiment > 0 && (negativeCount / totalSentiment) > 0.3) {
      factors.push({
        factor: `Negative sentiment: ${Math.round((negativeCount / totalSentiment) * 100)}% negative mentions`,
        impact: 'medium',
        evidence: [`${negativeCount} negative mentions out of ${totalSentiment} total`],
      });
    }

    return factors;
  }

  /**
   * Calculate structural advantage score
   */
  private calculateStructuralAdvantageScore(
    factors: Array<{ factor: string; impact: 'high' | 'medium' | 'low'; evidence: string[] }>
  ): number {
    let score = 0;

    for (const factor of factors) {
      if (factor.impact === 'high') score += 20;
      else if (factor.impact === 'medium') score += 10;
      else score += 5;
    }

    return Math.min(100, score);
  }

  /**
   * Calculate structural weakness score
   */
  private calculateStructuralWeaknessScore(
    factors: Array<{ factor: string; impact: 'high' | 'medium' | 'low'; evidence: string[] }>
  ): number {
    // Weakness score is inverse - more weaknesses = higher score
    let score = 0;

    for (const factor of factors) {
      if (factor.impact === 'high') score += 20;
      else if (factor.impact === 'medium') score += 10;
      else score += 5;
    }

    return Math.min(100, score);
  }

  /**
   * Collect competitor evidence
   */
  private async collectCompetitorEvidence(
    workspaceId: string,
    competitorName: string,
    prompts?: string[]
  ): Promise<Array<{ type: 'citation' | 'schema' | 'content' | 'authority' | 'trust' | 'entity'; description: string; source: string; confidence: number }>> {
    const evidence: Array<{ type: 'citation' | 'schema' | 'content' | 'authority' | 'trust' | 'entity'; description: string; source: string; confidence: number }> = [];

    // Citation evidence
    const citationResult = await this.dbPool.query<{ url: string; authorityScore: number }>(
      `SELECT c."url", c."authorityScore"
       FROM "citations" c
       WHERE c."workspaceId" = $1
         AND LOWER(c."brand") = LOWER($2)
       ORDER BY c."authorityScore" DESC
       LIMIT 5`,
      [workspaceId, competitorName]
    );

    for (const row of citationResult.rows) {
      evidence.push({
        type: 'citation',
        description: `Citation from ${row.url}`,
        source: row.url,
        confidence: (row.authorityScore || 50) / 100,
      });
    }

    // Mention evidence
    const mentionQuery = prompts
      ? `SELECT m."snippet", e."key" as engine
         FROM "mentions" m
         JOIN "answers" a ON a.id = m."answerId"
         JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
         JOIN "prompts" p ON p.id = pr."promptId"
         JOIN "engines" e ON e.id = pr."engineId"
         WHERE pr."workspaceId" = $1
           AND LOWER(m."brand") = LOWER($2)
           AND pr."status" = 'SUCCESS'
           AND p."text" = ANY($3::text[])
         LIMIT 5`
      : `SELECT m."snippet", e."key" as engine
         FROM "mentions" m
         JOIN "answers" a ON a.id = m."answerId"
         JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
         JOIN "engines" e ON e.id = pr."engineId"
         WHERE pr."workspaceId" = $1
           AND LOWER(m."brand") = LOWER($2)
           AND pr."status" = 'SUCCESS'
         LIMIT 5`;

    const mentionParams = prompts ? [workspaceId, competitorName, prompts] : [workspaceId, competitorName];
    const mentionResult = await this.dbPool.query<{ snippet: string; engine: string }>(mentionQuery, mentionParams);

    for (const row of mentionResult.rows) {
      evidence.push({
        type: 'content',
        description: `Mention on ${row.engine}: ${row.snippet?.substring(0, 100)}`,
        source: row.engine,
        confidence: 0.8,
      });
    }

    return evidence;
  }

  /**
   * Calculate engine-specific strength
   */
  private async calculateEngineStrength(
    workspaceId: string,
    competitorName: string,
    prompts?: string[]
  ): Promise<{ chatgpt: number; claude: number; gemini: number; perplexity: number }> {
    const strength = { chatgpt: 0, claude: 0, gemini: 0, perplexity: 0 };
    const engines = ['CHATGPT', 'CLAUDE', 'GEMINI', 'PERPLEXITY'];

    for (const engine of engines) {
      const query = prompts
        ? `SELECT 
            COUNT(*) as count,
            AVG(m."position") as "avgPosition"
          FROM "mentions" m
          JOIN "answers" a ON a.id = m."answerId"
          JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
          JOIN "prompts" p ON p.id = pr."promptId"
          JOIN "engines" e ON e.id = pr."engineId"
          WHERE pr."workspaceId" = $1
            AND LOWER(m."brand") = LOWER($2)
            AND e."key" = $3
            AND pr."status" = 'SUCCESS'
            AND p."text" = ANY($4::text[])`
        : `SELECT 
            COUNT(*) as count,
            AVG(m."position") as "avgPosition"
          FROM "mentions" m
          JOIN "answers" a ON a.id = m."answerId"
          JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
          JOIN "engines" e ON e.id = pr."engineId"
          WHERE pr."workspaceId" = $1
            AND LOWER(m."brand") = LOWER($2)
            AND e."key" = $3
            AND pr."status" = 'SUCCESS'`;

      const params = prompts ? [workspaceId, competitorName, engine, prompts] : [workspaceId, competitorName, engine];
      const result = await this.dbPool.query<{ count: number; avgPosition: number }>(query, params);

      const count = result.rows[0]?.count || 0;
      const avgPosition = result.rows[0]?.avgPosition || 999;
      const engineKey = engine.toLowerCase() as keyof typeof strength;

      // Strength = mention count * position score
      const positionScore = avgPosition < 999 ? Math.max(0, 100 - (avgPosition * 10)) : 0;
      strength[engineKey] = Math.min(100, Math.round((count * 2) + (positionScore * 0.5)));
    }

    return strength;
  }

  /**
   * Analyze signal interpretation (historical vs real-time)
   */
  private async analyzeSignalInterpretation(
    workspaceId: string,
    competitorName: string,
    prompts?: string[]
  ): Promise<{
    historical: { strength: number; evidence: string[] };
    realTime: { strength: number; evidence: string[] };
    trend: 'improving' | 'declining' | 'stable';
  }> {
    // For now, use current data as both historical and real-time
    // In production, this would compare historical vs recent data
    const currentStrength = await this.calculateEngineStrength(workspaceId, competitorName, prompts);
    const avgStrength = (
      currentStrength.chatgpt +
      currentStrength.claude +
      currentStrength.gemini +
      currentStrength.perplexity
    ) / 4;

    return {
      historical: {
        strength: Math.round(avgStrength),
        evidence: ['Historical data analysis'],
      },
      realTime: {
        strength: Math.round(avgStrength),
        evidence: ['Real-time data analysis'],
      },
      trend: 'stable', // Would be calculated from historical comparison
    };
  }

  /**
   * Identify your advantage opportunities
   */
  private async identifyYourAdvantageOpportunity(
    workspaceId: string,
    brandName: string,
    competitorName: string,
    competitorAdvantages: Array<{ factor: string; impact: 'high' | 'medium' | 'low'; evidence: string[] }>,
    competitorWeaknesses: Array<{ factor: string; impact: 'high' | 'medium' | 'low'; evidence: string[] }>
  ): Promise<{
    shortTerm: string[];
    longTerm: string[];
    difficulty: number;
  }> {
    const shortTerm: string[] = [];
    const longTerm: string[] = [];

    // Short-term opportunities from competitor weaknesses
    for (const weakness of competitorWeaknesses) {
      if (weakness.impact === 'high') {
        if (weakness.factor.includes('citation')) {
          shortTerm.push('Acquire citations from high-authority sources to match competitor');
        }
        if (weakness.factor.includes('visibility')) {
          shortTerm.push('Improve visibility on engines where competitor is weak');
        }
      }
    }

    // Long-term opportunities from competitor advantages
    for (const advantage of competitorAdvantages) {
      if (advantage.impact === 'high') {
        if (advantage.factor.includes('citation')) {
          longTerm.push('Build comprehensive citation profile over time');
        }
        if (advantage.factor.includes('ranking')) {
          longTerm.push('Improve content quality and SEO to compete for top positions');
        }
      }
    }

    // Calculate difficulty based on competitor strength
    const competitorStrength = competitorAdvantages.length * 10;
    const difficulty = Math.min(100, competitorStrength);

    return {
      shortTerm: shortTerm.slice(0, 5),
      longTerm: longTerm.slice(0, 5),
      difficulty,
    };
  }
}



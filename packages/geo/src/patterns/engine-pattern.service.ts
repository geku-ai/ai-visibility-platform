/**
 * Cross-Engine Pattern Recognition Engine
 * 
 * Analyzes differences across ChatGPT, Claude, Perplexity, Gemini, Brave, etc.
 * Identifies which engines recognize/suppress brands and why.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { CrossEnginePattern } from '../types/diagnostic.types';

@Injectable()
export class EnginePatternService {
  private readonly logger = new Logger(EnginePatternService.name);
  private dbPool: Pool;

  constructor() {
    this.dbPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
  }

  /**
   * Analyze cross-engine patterns
   */
  async analyzeCrossEnginePatterns(
    workspaceId: string,
    brandName: string,
    prompts?: string[]
  ): Promise<CrossEnginePattern> {
    this.logger.log(`Analyzing cross-engine patterns for ${brandName}`);

    try {
      // Get engine recognition data
      const enginesRecognizing = await this.getEnginesRecognizing(workspaceId, brandName, prompts);
      const enginesSuppressing = await this.getEnginesSuppressing(workspaceId, brandName, prompts);

      // Analyze consistency pattern
      const consistencyPattern = await this.analyzeConsistencyPattern(
        workspaceId,
        brandName,
        prompts
      );

      // Analyze competitor favorability
      const competitorFavorability = await this.analyzeCompetitorFavorability(
        workspaceId,
        brandName,
        prompts
      );

      // Analyze intent clustering differences
      const intentClusteringDifferences = await this.analyzeIntentClusteringDifferences(
        workspaceId,
        brandName,
        prompts
      );

      // Calculate ranking stability
      const rankingStabilityScore = await this.calculateRankingStability(
        workspaceId,
        brandName,
        prompts
      );

      // Identify conflicting signals
      const conflictingSignals = await this.identifyConflictingSignals(
        workspaceId,
        brandName,
        prompts
      );

      // Identify missing signals per engine
      const missingSignalsPerEngine = await this.identifyMissingSignals(
        workspaceId,
        brandName,
        prompts
      );

      // Collect evidence
      const evidence = await this.collectPatternEvidence(workspaceId, brandName, prompts);

      // Calculate engine confidence
      const engineConfidence = await this.calculateEngineConfidence(
        workspaceId,
        brandName,
        prompts
      );

      // Generate pattern explanation
      const patternExplanation = this.generatePatternExplanation(
        enginesRecognizing,
        enginesSuppressing,
        consistencyPattern,
        conflictingSignals
      );

      return {
        enginesRecognizing,
        enginesSuppressing,
        consistencyPattern,
        competitorFavorability,
        intentClusteringDifferences,
        rankingStabilityScore,
        conflictingSignals,
        missingSignalsPerEngine,
        evidence,
        engineConfidence,
        patternExplanation,
      };
    } catch (error) {
      this.logger.error(`Failed to analyze cross-engine patterns: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get engines that recognize the brand
   */
  private async getEnginesRecognizing(
    workspaceId: string,
    brandName: string,
    prompts?: string[]
  ): Promise<Array<{ engine: string; recognitionScore: number; reasoning: string; evidence: string[] }>> {
    const recognizing: Array<{ engine: string; recognitionScore: number; reasoning: string; evidence: string[] }> = [];
    const engines = ['CHATGPT', 'CLAUDE', 'GEMINI', 'PERPLEXITY'];

    for (const engine of engines) {
      const query = prompts
        ? `SELECT 
            COUNT(DISTINCT m.id) as count,
            COUNT(DISTINCT pr."promptId") as total,
            ARRAY_AGG(DISTINCT m."snippet") FILTER (WHERE m."snippet" IS NOT NULL) as snippets
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
            COUNT(DISTINCT m.id) as count,
            COUNT(DISTINCT pr."promptId") as total,
            ARRAY_AGG(DISTINCT m."snippet") FILTER (WHERE m."snippet" IS NOT NULL) as snippets
          FROM "mentions" m
          JOIN "answers" a ON a.id = m."answerId"
          JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
          JOIN "engines" e ON e.id = pr."engineId"
          WHERE pr."workspaceId" = $1
            AND LOWER(m."brand") = LOWER($2)
            AND e."key" = $3
            AND pr."status" = 'SUCCESS'`;

      const params = prompts ? [workspaceId, brandName, engine, prompts] : [workspaceId, brandName, engine];
      const result = await this.dbPool.query<{ count: number; total: number; snippets: string[] }>(query, params);

      const row = result.rows[0];
      if (row && row.total > 0) {
        const recognitionScore = Math.round((parseInt(row.count.toString()) / parseInt(row.total.toString())) * 100);
        const reasoning = recognitionScore > 50
          ? `Strong brand recognition with ${recognitionScore}% visibility across tested prompts`
          : `Moderate brand recognition with ${recognitionScore}% visibility`;

        recognizing.push({
          engine: engine.toLowerCase(),
          recognitionScore,
          reasoning,
          evidence: (row.snippets || []).slice(0, 5),
        });
      }
    }

    return recognizing;
  }

  /**
   * Get engines that suppress the brand
   */
  private async getEnginesSuppressing(
    workspaceId: string,
    brandName: string,
    prompts?: string[]
  ): Promise<Array<{ engine: string; suppressionScore: number; reasoning: string; evidence: string[] }>> {
    const suppressing: Array<{ engine: string; suppressionScore: number; reasoning: string; evidence: string[] }> = [];
    const engines = ['CHATGPT', 'CLAUDE', 'GEMINI', 'PERPLEXITY'];

    for (const engine of engines) {
      const query = prompts
        ? `SELECT 
            COUNT(DISTINCT pr."promptId") as total,
            COUNT(DISTINCT CASE WHEN LOWER(m."brand") = LOWER($2) THEN m.id END) as mentions,
            ARRAY_AGG(DISTINCT m."snippet") FILTER (WHERE m."snippet" IS NOT NULL AND LOWER(m."brand") != LOWER($2)) as competitor_snippets
          FROM "prompt_runs" pr
          JOIN "prompts" p ON p.id = pr."promptId"
          JOIN "engines" e ON e.id = pr."engineId"
          LEFT JOIN "answers" a ON a."promptRunId" = pr.id
          LEFT JOIN "mentions" m ON m."answerId" = a.id
          WHERE pr."workspaceId" = $1
            AND e."key" = $3
            AND pr."status" = 'SUCCESS'
            AND p."text" = ANY($4::text[])`
        : `SELECT 
            COUNT(DISTINCT pr."promptId") as total,
            COUNT(DISTINCT CASE WHEN LOWER(m."brand") = LOWER($2) THEN m.id END) as mentions,
            ARRAY_AGG(DISTINCT m."snippet") FILTER (WHERE m."snippet" IS NOT NULL AND LOWER(m."brand") != LOWER($2)) as competitor_snippets
          FROM "prompt_runs" pr
          JOIN "engines" e ON e.id = pr."engineId"
          LEFT JOIN "answers" a ON a."promptRunId" = pr.id
          LEFT JOIN "mentions" m ON m."answerId" = a.id
          WHERE pr."workspaceId" = $1
            AND e."key" = $3
            AND pr."status" = 'SUCCESS'`;

      const params = prompts ? [workspaceId, brandName, engine, prompts] : [workspaceId, brandName, engine];
      const result = await this.dbPool.query<{ total: number; mentions: number; competitor_snippets: string[] }>(query, params);

      const row = result.rows[0];
      if (row && row.total > 0) {
        const mentionRate = parseInt(row.mentions.toString()) / parseInt(row.total.toString());
        const suppressionScore = Math.round((1 - mentionRate) * 100);

        if (suppressionScore > 50) {
          const reasoning = `Brand is suppressed with only ${Math.round(mentionRate * 100)}% mention rate. Competitors are mentioned instead.`;
          suppressing.push({
            engine: engine.toLowerCase(),
            suppressionScore,
            reasoning,
            evidence: (row.competitor_snippets || []).slice(0, 5),
          });
        }
      }
    }

    return suppressing;
  }

  /**
   * Analyze consistency pattern
   */
  private async analyzeConsistencyPattern(
    workspaceId: string,
    brandName: string,
    prompts?: string[]
  ): Promise<{
    consistencyScore: number;
    consistentEngines: string[];
    inconsistentEngines: string[];
    explanation: string;
  }> {
    const engines = ['CHATGPT', 'CLAUDE', 'GEMINI', 'PERPLEXITY'];
    const engineVisibility: Record<string, number> = {};

    for (const engine of engines) {
      const query = prompts
        ? `SELECT 
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
            AND p."text" = ANY($4::text[])`
        : `SELECT 
            COUNT(DISTINCT m.id) as count,
            COUNT(DISTINCT pr."promptId") as total
          FROM "mentions" m
          JOIN "answers" a ON a.id = m."answerId"
          JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
          JOIN "engines" e ON e.id = pr."engineId"
          WHERE pr."workspaceId" = $1
            AND LOWER(m."brand") = LOWER($2)
            AND e."key" = $3
            AND pr."status" = 'SUCCESS'`;

      const params = prompts ? [workspaceId, brandName, engine, prompts] : [workspaceId, brandName, engine];
      const result = await this.dbPool.query<{ count: number; total: number }>(query, params);

      const row = result.rows[0];
      if (row && row.total > 0) {
        engineVisibility[engine] = Math.round((parseInt(row.count.toString()) / parseInt(row.total.toString())) * 100);
      } else {
        engineVisibility[engine] = 0;
      }
    }

    // Calculate variance
    const values = Object.values(engineVisibility);
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    // Consistency score (lower variance = higher consistency)
    const consistencyScore = Math.max(0, Math.round(100 - (stdDev * 2)));

    // Identify consistent vs inconsistent engines
    const consistentEngines: string[] = [];
    const inconsistentEngines: string[] = [];

    for (const [engine, visibility] of Object.entries(engineVisibility)) {
      if (Math.abs(visibility - avg) <= stdDev) {
        consistentEngines.push(engine.toLowerCase());
      } else {
        inconsistentEngines.push(engine.toLowerCase());
      }
    }

    const explanation = consistencyScore > 70
      ? `High consistency across engines (${consistencyScore}%). Brand visibility is similar across all AI engines.`
      : consistencyScore > 40
      ? `Moderate consistency (${consistencyScore}%). Some engines show different visibility patterns.`
      : `Low consistency (${consistencyScore}%). Significant differences in brand visibility across engines.`;

    return {
      consistencyScore,
      consistentEngines,
      inconsistentEngines,
      explanation,
    };
  }

  /**
   * Analyze competitor favorability
   */
  private async analyzeCompetitorFavorability(
    workspaceId: string,
    brandName: string,
    prompts?: string[]
  ): Promise<Array<{ competitor: string; engines: string[]; favorabilityScore: number; evidence: string[] }>> {
    const favorability: Array<{ competitor: string; engines: string[]; favorabilityScore: number; evidence: string[] }> = [];

    const query = prompts
      ? `SELECT 
          m."brand" as competitor,
          e."key" as engine,
          COUNT(*) as count,
          ARRAY_AGG(DISTINCT m."snippet") FILTER (WHERE m."snippet" IS NOT NULL) as snippets
        FROM "mentions" m
        JOIN "answers" a ON a.id = m."answerId"
        JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
        JOIN "prompts" p ON p.id = pr."promptId"
        JOIN "engines" e ON e.id = pr."engineId"
        WHERE pr."workspaceId" = $1
          AND LOWER(m."brand") != LOWER($2)
          AND pr."status" = 'SUCCESS'
          AND p."text" = ANY($3::text[])
        GROUP BY m."brand", e."key"
        ORDER BY count DESC`
      : `SELECT 
          m."brand" as competitor,
          e."key" as engine,
          COUNT(*) as count,
          ARRAY_AGG(DISTINCT m."snippet") FILTER (WHERE m."snippet" IS NOT NULL) as snippets
        FROM "mentions" m
        JOIN "answers" a ON a.id = m."answerId"
        JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
        JOIN "engines" e ON e.id = pr."engineId"
        WHERE pr."workspaceId" = $1
          AND LOWER(m."brand") != LOWER($2)
          AND pr."status" = 'SUCCESS'
        GROUP BY m."brand", e."key"
        ORDER BY count DESC`;

    const params = prompts ? [workspaceId, brandName, prompts] : [workspaceId, brandName];
    const result = await this.dbPool.query<{
      competitor: string;
      engine: string;
      count: number;
      snippets: string[];
    }>(query, params);

    // Group by competitor
    const competitorMap = new Map<string, { engines: string[]; totalCount: number; snippets: string[] }>();

    for (const row of result.rows) {
      if (!competitorMap.has(row.competitor)) {
        competitorMap.set(row.competitor, { engines: [], totalCount: 0, snippets: [] });
      }

      const comp = competitorMap.get(row.competitor)!;
      comp.engines.push(row.engine.toLowerCase());
      comp.totalCount += parseInt(row.count.toString());
      comp.snippets.push(...(row.snippets || []));
    }

    // Calculate favorability scores
    const maxCount = Math.max(...Array.from(competitorMap.values()).map(c => c.totalCount));

    for (const [competitor, data] of competitorMap.entries()) {
      const favorabilityScore = maxCount > 0
        ? Math.round((data.totalCount / maxCount) * 100)
        : 0;

      favorability.push({
        competitor,
        engines: [...new Set(data.engines)],
        favorabilityScore,
        evidence: data.snippets.slice(0, 5),
      });
    }

    return favorability.sort((a, b) => b.favorabilityScore - a.favorabilityScore).slice(0, 10);
  }

  /**
   * Analyze intent clustering differences
   */
  private async analyzeIntentClusteringDifferences(
    workspaceId: string,
    brandName: string,
    prompts?: string[]
  ): Promise<Array<{
    intent: string;
    engineDifferences: Array<{ engine: string; interpretation: string; evidence: string[] }>;
  }>> {
    // This would require more sophisticated analysis
    // For now, return basic structure
    return [];
  }

  /**
   * Calculate ranking stability
   */
  private async calculateRankingStability(
    workspaceId: string,
    brandName: string,
    prompts?: string[]
  ): Promise<number> {
    // Get position variance across engines
    const query = prompts
      ? `SELECT 
          e."key" as engine,
          AVG(m."position") as avg_position,
          STDDEV(m."position") as position_stddev
        FROM "mentions" m
        JOIN "answers" a ON a.id = m."answerId"
        JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
        JOIN "prompts" p ON p.id = pr."promptId"
        JOIN "engines" e ON e.id = pr."engineId"
        WHERE pr."workspaceId" = $1
          AND LOWER(m."brand") = LOWER($2)
          AND pr."status" = 'SUCCESS'
          AND p."text" = ANY($3::text[])
          AND m."position" > 0
        GROUP BY e."key"`
      : `SELECT 
          e."key" as engine,
          AVG(m."position") as avg_position,
          STDDEV(m."position") as position_stddev
        FROM "mentions" m
        JOIN "answers" a ON a.id = m."answerId"
        JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
        JOIN "engines" e ON e.id = pr."engineId"
        WHERE pr."workspaceId" = $1
          AND LOWER(m."brand") = LOWER($2)
          AND pr."status" = 'SUCCESS'
          AND m."position" > 0
        GROUP BY e."key"`;

    const params = prompts ? [workspaceId, brandName, prompts] : [workspaceId, brandName];
    const result = await this.dbPool.query<{ engine: string; avg_position: number; position_stddev: number }>(query, params);

    if (result.rows.length === 0) {
      return 0; // No ranking data
    }

    // Calculate average stddev across engines (lower = more stable)
    const avgStdDev = result.rows.reduce((sum, r) => sum + (parseFloat(r.position_stddev.toString()) || 0), 0) / result.rows.length;

    // Stability score (inverse of stddev, normalized)
    const stabilityScore = Math.max(0, Math.round(100 - (avgStdDev * 10)));

    return stabilityScore;
  }

  /**
   * Identify conflicting signals
   */
  private async identifyConflictingSignals(
    workspaceId: string,
    brandName: string,
    prompts?: string[]
  ): Promise<Array<{ engines: string[]; conflict: string; evidence: string[] }>> {
    const conflicts: Array<{ engines: string[]; conflict: string; evidence: string[] }> = [];

    // Compare sentiment across engines
    const query = prompts
      ? `SELECT 
          e."key" as engine,
          m."sentiment",
          COUNT(*) as count
        FROM "mentions" m
        JOIN "answers" a ON a.id = m."answerId"
        JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
        JOIN "prompts" p ON p.id = pr."promptId"
        JOIN "engines" e ON e.id = pr."engineId"
        WHERE pr."workspaceId" = $1
          AND LOWER(m."brand") = LOWER($2)
          AND pr."status" = 'SUCCESS'
          AND p."text" = ANY($3::text[])
        GROUP BY e."key", m."sentiment"`
      : `SELECT 
          e."key" as engine,
          m."sentiment",
          COUNT(*) as count
        FROM "mentions" m
        JOIN "answers" a ON a.id = m."answerId"
        JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
        JOIN "engines" e ON e.id = pr."engineId"
        WHERE pr."workspaceId" = $1
          AND LOWER(m."brand") = LOWER($2)
          AND pr."status" = 'SUCCESS'
        GROUP BY e."key", m."sentiment"`;

    const params = prompts ? [workspaceId, brandName, prompts] : [workspaceId, brandName];
    const result = await this.dbPool.query<{ engine: string; sentiment: string; count: number }>(query, params);

    // Group by engine and check for sentiment conflicts
    const engineSentiment = new Map<string, { positive: number; negative: number; neutral: number }>();

    for (const row of result.rows) {
      if (!engineSentiment.has(row.engine)) {
        engineSentiment.set(row.engine, { positive: 0, negative: 0, neutral: 0 });
      }

      const sent = engineSentiment.get(row.engine)!;
      if (row.sentiment === 'POS') sent.positive += parseInt(row.count.toString());
      else if (row.sentiment === 'NEG') sent.negative += parseInt(row.count.toString());
      else sent.neutral += parseInt(row.count.toString());
    }

    // Find engines with conflicting sentiment
    const engines = Array.from(engineSentiment.keys());
    for (let i = 0; i < engines.length; i++) {
      for (let j = i + 1; j < engines.length; j++) {
        const eng1 = engineSentiment.get(engines[i])!;
        const eng2 = engineSentiment.get(engines[j])!;

        const eng1Dominant = eng1.positive > eng1.negative ? 'positive' : eng1.negative > eng1.positive ? 'negative' : 'neutral';
        const eng2Dominant = eng2.positive > eng2.negative ? 'positive' : eng2.negative > eng2.positive ? 'negative' : 'neutral';

        if (eng1Dominant !== eng2Dominant && eng1Dominant !== 'neutral' && eng2Dominant !== 'neutral') {
          conflicts.push({
            engines: [engines[i].toLowerCase(), engines[j].toLowerCase()],
            conflict: `Sentiment conflict: ${engines[i]} shows ${eng1Dominant} sentiment while ${engines[j]} shows ${eng2Dominant}`,
            evidence: [],
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Identify missing signals per engine
   */
  private async identifyMissingSignals(
    workspaceId: string,
    brandName: string,
    prompts?: string[]
  ): Promise<Array<{ engine: string; missingSignals: string[]; impact: 'high' | 'medium' | 'low' }>> {
    const missing: Array<{ engine: string; missingSignals: string[]; impact: 'high' | 'medium' | 'low' }> = [];
    const engines = ['CHATGPT', 'CLAUDE', 'GEMINI', 'PERPLEXITY'];

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

      const params = prompts ? [workspaceId, brandName, engine, prompts] : [workspaceId, brandName, engine];
      const result = await this.dbPool.query<{ count: number }>(query, params);

      const mentionCount = result.rows[0]?.count || 0;
      const missingSignals: string[] = [];

      if (mentionCount === 0) {
        missingSignals.push('Brand mentions');
        missingSignals.push('Citation signals');
      } else if (mentionCount < 5) {
        missingSignals.push('Sufficient citation density');
      }

      if (missingSignals.length > 0) {
        missing.push({
          engine: engine.toLowerCase(),
          missingSignals,
          impact: mentionCount === 0 ? 'high' : 'medium',
        });
      }
    }

    return missing;
  }

  /**
   * Collect pattern evidence
   */
  private async collectPatternEvidence(
    workspaceId: string,
    brandName: string,
    prompts?: string[]
  ): Promise<string[]> {
    const query = prompts
      ? `SELECT m."snippet"
         FROM "mentions" m
         JOIN "answers" a ON a.id = m."answerId"
         JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
         JOIN "prompts" p ON p.id = pr."promptId"
         WHERE pr."workspaceId" = $1
           AND LOWER(m."brand") = LOWER($2)
           AND pr."status" = 'SUCCESS'
           AND p."text" = ANY($3::text[])
         LIMIT 20`
      : `SELECT m."snippet"
         FROM "mentions" m
         JOIN "answers" a ON a.id = m."answerId"
         JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
         WHERE pr."workspaceId" = $1
           AND LOWER(m."brand") = LOWER($2)
           AND pr."status" = 'SUCCESS'
         LIMIT 20`;

    const params = prompts ? [workspaceId, brandName, prompts] : [workspaceId, brandName];
    const result = await this.dbPool.query<{ snippet: string }>(query, params);

    return result.rows.map(r => r.snippet).filter(Boolean);
  }

  /**
   * Calculate engine confidence
   */
  private async calculateEngineConfidence(
    workspaceId: string,
    brandName: string,
    prompts?: string[]
  ): Promise<{ chatgpt: number; claude: number; gemini: number; perplexity: number }> {
    const confidence = { chatgpt: 0.5, claude: 0.5, gemini: 0.5, perplexity: 0.5 };
    const engines = ['CHATGPT', 'CLAUDE', 'GEMINI', 'PERPLEXITY'];

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

      const params = prompts ? [workspaceId, brandName, engine, prompts] : [workspaceId, brandName, engine];
      const result = await this.dbPool.query<{ count: number }>(query, params);

      const count = result.rows[0]?.count || 0;
      const engineKey = engine.toLowerCase() as keyof typeof confidence;

      // More mentions = higher confidence
      if (count > 20) confidence[engineKey] = 0.9;
      else if (count > 10) confidence[engineKey] = 0.7;
      else if (count > 5) confidence[engineKey] = 0.6;
      else if (count === 0) confidence[engineKey] = 0.3;
    }

    return confidence;
  }

  /**
   * Generate pattern explanation
   */
  private generatePatternExplanation(
    recognizing: Array<{ engine: string; recognitionScore: number; reasoning: string; evidence: string[] }>,
    suppressing: Array<{ engine: string; suppressionScore: number; reasoning: string; evidence: string[] }>,
    consistency: { consistencyScore: number; consistentEngines: string[]; inconsistentEngines: string[]; explanation: string },
    conflicts: Array<{ engines: string[]; conflict: string; evidence: string[] }>
  ): string {
    const parts: string[] = [];

    if (recognizing.length > 0) {
      parts.push(`${recognizing.length} engine(s) recognize the brand: ${recognizing.map(r => r.engine).join(', ')}`);
    }

    if (suppressing.length > 0) {
      parts.push(`${suppressing.length} engine(s) suppress the brand: ${suppressing.map(s => s.engine).join(', ')}`);
    }

    parts.push(consistency.explanation);

    if (conflicts.length > 0) {
      parts.push(`${conflicts.length} conflicting signal(s) detected across engines`);
    }

    return parts.join('. ') || 'Insufficient data to analyze cross-engine patterns';
  }
}


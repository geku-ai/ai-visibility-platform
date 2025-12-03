import { Injectable, Logger } from '@nestjs/common';
import { LLMRouterService } from '@ai-visibility/shared';
import { EEATCalculatorService, EEATScore } from '../trust/eeat-calculator.service';
import { EvidenceBackedShareOfVoiceService } from '../sov/evidence-backed-sov.service';
import { EvidenceCollectorService } from '../evidence/evidence-collector.service';
import { SchemaAuditorService } from '../structural/schema-auditor';
import { StructuralScoringService } from '../structural/structural-scoring.service';
import { DiagnosticIntelligenceService } from '../diagnostics/diagnostic-intelligence.service';
import { Pool } from 'pg';
import { PremiumGEOScore } from '../types/premium-response.types';
import { applyIndustryWeights } from '../config/industry-weights.config';
import {
  DiagnosticInsight,
  DiagnosticRecommendation,
} from '../types/diagnostic.types';

// Types moved to premium-response.types.ts

@Injectable()
export class PremiumGEOScoreService {
  private readonly logger = new Logger(PremiumGEOScoreService.name);
  private dbPool: Pool;

  constructor(
    private readonly llmRouter: LLMRouterService,
    private readonly eeatCalculator: EEATCalculatorService,
    private readonly evidenceBackedSOV: EvidenceBackedShareOfVoiceService,
    private readonly evidenceCollector: EvidenceCollectorService,
    private readonly schemaAuditor: SchemaAuditorService,
    private readonly structuralScoring: StructuralScoringService,
    private readonly diagnosticIntelligence: DiagnosticIntelligenceService,
  ) {
    this.dbPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
  }

  /**
   * Calculate comprehensive, evidence-backed GEO Score
   */
  async calculatePremiumGEOScore(
    workspaceId: string,
    domain: string,
    brandName: string,
    competitorNames: string[] = [],
    industry?: string
  ): Promise<PremiumGEOScore> {
    // Apply industry-specific weights
    const baseWeights = {
      visibility: 0.35,
      eeat: 0.25,
      citations: 0.15,
      competitors: 0.15,
      technical: 0.10,
    };
    
    const weights = industry
      ? applyIndustryWeights(baseWeights, industry)
      : baseWeights;
    const breakdown = {
      aiVisibility: { score: 0, weight: weights.visibility, points: 0, details: { perEngine: [], perPrompt: [] }, evidence: [] as string[], explanation: '', missing: [] as string[] },
      eeat: { score: 0, weight: weights.eeat, points: 0, breakdown: { expertise: 0, authoritativeness: 0, trustworthiness: 0, experience: 0 }, evidence: [] as string[], explanation: '', missing: [] as string[] },
      citations: { score: 0, weight: weights.citations, points: 0, details: { totalCitations: 0, licensedPublisherCitations: 0, averageAuthority: 0, citationCategories: {} }, evidence: [] as string[], explanation: '', missing: [] as string[] },
      competitorComparison: { score: 0, weight: weights.competitors, points: 0, details: { shareOfVoice: 0, competitorCount: 0, relativePosition: 0 }, evidence: [] as string[], explanation: '', missing: [] as string[] },
      schemaTechnical: { score: 0, weight: weights.technical, points: 0, details: { schemaTypes: [], schemaCompleteness: 0, structuredDataQuality: 0 }, evidence: [] as string[], explanation: '', missing: [] as string[] },
    };

    const warnings: string[] = [];
    const recommendations: string[] = [];

    // 1. AI Visibility (35%)
    breakdown.aiVisibility = await this.calculateAIVisibilityScore(workspaceId, brandName, weights.visibility);

    // 2. EEAT (25%)
    breakdown.eeat = await this.calculateEEATScore(workspaceId, domain, brandName, weights.eeat);

    // 3. Citations (15%)
    breakdown.citations = await this.calculateCitationsScore(workspaceId, domain, weights.citations);

    // 4. Competitor Comparison (15%)
    breakdown.competitorComparison = await this.calculateCompetitorComparisonScore(workspaceId, brandName, competitorNames, weights.competitors);

    // 5. Schema/Technical (10%)
    breakdown.schemaTechnical = await this.calculateSchemaTechnicalScore(workspaceId, domain, weights.technical);

    // Calculate total score
    const total = breakdown.aiVisibility.points +
                  breakdown.eeat.points +
                  breakdown.citations.points +
                  breakdown.competitorComparison.points +
                  breakdown.schemaTechnical.points;

    // Calculate confidence
    const dataPoints = [
      breakdown.aiVisibility.details.perEngine.length,
      breakdown.eeat.breakdown.expertise > 0 ? 1 : 0,
      breakdown.citations.details.totalCitations,
      breakdown.competitorComparison.details.competitorCount,
      breakdown.schemaTechnical.details.schemaTypes.length,
    ];
    const avgDataPoints = dataPoints.reduce((a, b) => a + b, 0) / dataPoints.length;
    const confidence = Math.min(1.0, avgDataPoints / 10);

    // Generate recommendations
    if (breakdown.aiVisibility.score < 50) {
      recommendations.push(`Improve AI visibility: Currently visible in ${breakdown.aiVisibility.details.perEngine.filter(e => e.coverage > 0).length} of ${breakdown.aiVisibility.details.perEngine.length} engines`);
    }
    if (breakdown.eeat.score < 50) {
      recommendations.push(`Improve EEAT score: Focus on ${breakdown.eeat.missing.slice(0, 2).join(' and ')}`);
    }
    if (breakdown.citations.details.totalCitations < 10) {
      recommendations.push(`Increase citations: Only ${breakdown.citations.details.totalCitations} citations found`);
    }
    if (breakdown.schemaTechnical.score < 50) {
      recommendations.push(`Add schema markup: ${breakdown.schemaTechnical.missing.join(', ')}`);
    }

    return {
      total: Math.round(total),
      breakdown,
      confidence,
      warnings,
      recommendations,
    };
  }

  /**
   * Calculate AI Visibility score (35% weight)
   */
  private async calculateAIVisibilityScore(
    workspaceId: string,
    brandName: string,
    weight: number
  ): Promise<PremiumGEOScore['breakdown']['aiVisibility']> {
    const details = {
      perEngine: [] as Array<{ engine: string; coverage: number; promptsTested: number; promptsVisible: number }>,
      perPrompt: [] as Array<{ prompt: string; enginesVisible: number; totalEngines: number }>,
    };

    const evidence: string[] = [];
    const missing: string[] = [];

    try {
      // Get all prompts tested
      const promptsResult = await this.dbPool.query<{ promptText: string; promptId: string }>(
        `SELECT DISTINCT p."text" AS "promptText", p.id AS "promptId"
         FROM "prompts" p
         JOIN "prompt_runs" pr ON pr."promptId" = p.id
         WHERE pr."workspaceId" = $1
           AND 'demo' = ANY(p."tags")
         ORDER BY p."text"`,
        [workspaceId]
      );
      const prompts = promptsResult.rows;

      // Get engine visibility per prompt
      const engines = ['PERPLEXITY', 'AIO', 'BRAVE'];
      let totalPrompts = 0;
      let totalVisible = 0;

      // Normalize brand name for matching (remove TLD, protocol, www)
      const normalizeBrandForMatching = (brand: string): string => {
        return brand.toLowerCase()
          .replace(/^https?:\/\//, '')
          .replace(/^www\./, '')
          .replace(/\.(com|net|org|io|co|ai|app|dev)$/, '');
      };
      const normalizedBrand = normalizeBrandForMatching(brandName);
      const brandBase = normalizedBrand.split('.')[0];

      for (const engine of engines) {
        let promptsVisible = 0;
        let promptsTested = 0;

        for (const prompt of prompts) {
          // Use flexible brand matching to catch variations like "airbnb.com" when searching for "Airbnb"
          const mentionCountResult = await this.dbPool.query<{ count: number }>(
            `SELECT COUNT(*)::int AS count
             FROM "mentions" m
             JOIN "answers" a ON a.id = m."answerId"
             JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
             JOIN "engines" e ON e.id = pr."engineId"
             WHERE pr."workspaceId" = $1
               AND pr."promptId" = $2
               AND e."key" = $3
               AND (
                 LOWER(m."brand") = LOWER($4)
                 OR LOWER(m."brand") = LOWER($5)
                 OR LOWER(REPLACE(REPLACE(REPLACE(m."brand", 'https://', ''), 'http://', ''), 'www.', '')) = LOWER($5)
                 OR LOWER(SPLIT_PART(REPLACE(REPLACE(REPLACE(m."brand", 'https://', ''), 'http://', ''), 'www.', ''), '.', 1)) = LOWER($6)
               )
               AND pr."status" = 'SUCCESS'`,
            [workspaceId, prompt.promptId, engine, brandName, normalizedBrand, brandBase]
          );

          promptsTested += 1;
          if (mentionCountResult.rows[0]?.count > 0) {
            promptsVisible += 1;
            totalVisible += 1;
          }
        }

        totalPrompts += promptsTested;
        const coverage = promptsTested > 0 ? (promptsVisible / promptsTested) * 100 : 0;

        details.perEngine.push({
          engine,
          coverage: Math.round(coverage),
          promptsTested,
          promptsVisible,
        });

        evidence.push(`${engine}: Visible in ${promptsVisible}/${promptsTested} prompts (${Math.round(coverage)}% coverage)`);
      }

      // Get per-prompt breakdown
      for (const prompt of prompts) {
        let enginesVisible = 0;

        for (const engine of engines) {
          // Use flexible brand matching (same as above)
          const mentionCountResult = await this.dbPool.query<{ count: number }>(
            `SELECT COUNT(*)::int AS count
             FROM "mentions" m
             JOIN "answers" a ON a.id = m."answerId"
             JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
             JOIN "engines" e ON e.id = pr."engineId"
             WHERE pr."workspaceId" = $1
               AND pr."promptId" = $2
               AND e."key" = $3
               AND (
                 LOWER(m."brand") = LOWER($4)
                 OR LOWER(m."brand") = LOWER($5)
                 OR LOWER(REPLACE(REPLACE(REPLACE(m."brand", 'https://', ''), 'http://', ''), 'www.', '')) = LOWER($5)
                 OR LOWER(SPLIT_PART(REPLACE(REPLACE(REPLACE(m."brand", 'https://', ''), 'http://', ''), 'www.', ''), '.', 1)) = LOWER($6)
               )
               AND pr."status" = 'SUCCESS'`,
            [workspaceId, prompt.promptId, engine, brandName, normalizedBrand, brandBase]
          );

          if (mentionCountResult.rows[0]?.count > 0) {
            enginesVisible += 1;
          }
        }

        details.perPrompt.push({
          prompt: prompt.promptText,
          enginesVisible,
          totalEngines: engines.length,
        });
      }

      // Calculate score: average coverage across all engines
      const avgCoverage = details.perEngine.length > 0 
        ? details.perEngine.reduce((sum, e) => sum + e.coverage, 0) / details.perEngine.length 
        : 0;
      const score = Math.round(avgCoverage);

      if (score < 50 && details.perEngine.length > 0) {
        missing.push(`Low visibility: Only ${Math.round(avgCoverage)}% average coverage across engines`);
      }

      // Only show explanation if we have engine data, otherwise use a generic message
      const enginesWithVisibility = details.perEngine.filter(e => e.coverage > 0).length;
      const totalPromptsTested = details.perEngine.reduce((sum, e) => sum + e.promptsTested, 0);
      const totalPromptsVisible = details.perEngine.reduce((sum, e) => sum + e.promptsVisible, 0);
      
      let explanation: string;
      if (details.perEngine.length === 0) {
        explanation = `AI Visibility analysis in progress. Data collection may still be ongoing.`;
      } else if (enginesWithVisibility === 0 && score === 0 && totalPromptsTested > 0) {
        // Clarify this is just the mention-based visibility component, not the total GEO score
        explanation = `Mention-based visibility: 0/100. No brand mentions detected across ${details.perEngine.length} engines after testing ${totalPromptsTested} prompts. Note: Your total GEO score includes other factors (EEAT, citations, schema) beyond mentions.`;
      } else if (score > 0) {
        // Use the calculated score, not 0
        explanation = `Mention-based visibility: ${score}/100 based on average coverage across ${details.perEngine.length} engines. ` +
          `${enginesWithVisibility} engine${enginesWithVisibility !== 1 ? 's' : ''} show visibility, with ${totalPromptsVisible} of ${totalPromptsTested} prompts containing mentions.`;
      } else {
        explanation = `Mention-based visibility: ${score}/100. Analysis completed across ${details.perEngine.length} engines. Note: Your total GEO score includes other factors beyond mentions.`;
      }

      return {
        score,
        weight,
        points: score * weight,
        details,
        evidence,
        explanation,
        missing,
      };
    } catch (error) {
      this.logger.error(`Failed to calculate AI visibility score: ${error instanceof Error ? error.message : String(error)}`);
      return {
        score: 0,
        weight,
        points: 0,
        details,
        evidence: [],
        explanation: 'AI visibility calculation failed',
        missing: ['AI visibility calculation failed'],
      };
    }
  }

  /**
   * Calculate EEAT score (25% weight)
   */
  private async calculateEEATScore(
    workspaceId: string,
    domain: string,
    brandName: string,
    weight: number
  ): Promise<PremiumGEOScore['breakdown']['eeat']> {
    try {
      const eeatScore = await this.eeatCalculator.calculateEEATScore(workspaceId);

      const evidence: string[] = [];
      const missing: string[] = [];

      // EEATCalculatorService returns different structure
      const normalized = (eeatScore.experience + eeatScore.expertise + eeatScore.authoritativeness + eeatScore.trustworthiness) / 4;
      
      evidence.push(`Expertise: ${eeatScore.expertise}/100`);
      evidence.push(`Authoritativeness: ${eeatScore.authoritativeness}/100`);
      evidence.push(`Trustworthiness: ${eeatScore.trustworthiness}/100`);
      evidence.push(`Experience: ${eeatScore.experience}/100`);

      const explanation = `EEAT score of ${Math.round(normalized)}/100. ` +
        `Breakdown: Expertise ${eeatScore.expertise}/100, Authoritativeness ${eeatScore.authoritativeness}/100, ` +
        `Trustworthiness ${eeatScore.trustworthiness}/100, Experience ${eeatScore.experience}/100.`;

      return {
        score: Math.round(normalized),
        weight,
        points: normalized * weight,
        breakdown: {
          expertise: eeatScore.expertise,
          authoritativeness: eeatScore.authoritativeness,
          trustworthiness: eeatScore.trustworthiness,
          experience: eeatScore.experience,
        },
        evidence,
        explanation,
        missing,
      };
    } catch (error) {
      this.logger.error(`Failed to calculate EEAT score: ${error instanceof Error ? error.message : String(error)}`);
      return {
        score: 0,
        weight,
        points: 0,
        breakdown: { expertise: 0, authoritativeness: 0, trustworthiness: 0, experience: 0 },
        evidence: [],
        explanation: 'EEAT calculation failed',
        missing: ['EEAT calculation failed'],
      };
    }
  }

  /**
   * Calculate Citations score (15% weight)
   */
  private async calculateCitationsScore(
    workspaceId: string,
    domain: string,
    weight: number
  ): Promise<PremiumGEOScore['breakdown']['citations']> {
    const evidence: string[] = [];
    const missing: string[] = [];

    try {
      // Get total citations
      const totalCitationsResult = await this.dbPool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM "citations" c
         JOIN "answers" a ON a.id = c."answerId"
         JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
         WHERE pr."workspaceId" = $1
           AND c."domain" LIKE $2`,
        [workspaceId, `%${domain}%`]
      );

      const total = totalCitationsResult.rows[0]?.count || 0;

      // Get licensed publisher citations
      const licensedCitationsResult = await this.dbPool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM "citations" c
         JOIN "answers" a ON a.id = c."answerId"
         JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
         WHERE pr."workspaceId" = $1
           AND c."domain" IN (
             'nytimes.com', 'wsj.com', 'ft.com', 'reuters.com', 'bloomberg.com',
             'forbes.com', 'techcrunch.com', 'wired.com', 'bbc.com', 'cnn.com'
           )`,
        [workspaceId]
      );

      const licensed = licensedCitationsResult.rows[0]?.count || 0;

      // Get citation categories
      const citationCategoriesResult = await this.dbPool.query<{ domain: string; count: number }>(
        `SELECT
           c."domain",
           COUNT(*)::int AS count
         FROM "citations" c
         JOIN "answers" a ON a.id = c."answerId"
         JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
         WHERE pr."workspaceId" = $1
         GROUP BY c."domain"
         ORDER BY COUNT(*) DESC
         LIMIT 10`,
        [workspaceId]
      );

      const citationCategories = citationCategoriesResult.rows;
      const categories: Record<string, number> = {};
      for (const cat of citationCategories) {
        const category = this.categorizeDomain(cat.domain);
        categories[category] = (categories[category] || 0) + cat.count;
      }

      // Calculate score: 0-100 based on citation count and quality
      let score = 0;
      if (total > 0) {
        score += Math.min(40, total * 2); // Base score from quantity
      }
      if (licensed > 0) {
        score += Math.min(40, licensed * 10); // Bonus for licensed publishers
      }
      score += Math.min(20, Object.keys(categories).length * 5); // Diversity bonus

      score = Math.min(100, score);

      evidence.push(`Total citations: ${total}`);
      evidence.push(`Licensed publisher citations: ${licensed}`);
      evidence.push(`Citation categories: ${Object.keys(categories).join(', ')}`);

      if (total < 5) {
        missing.push('Very few citations found');
      }
      if (licensed === 0) {
        missing.push('No licensed publisher citations');
      }

      const explanation = `Citations score of ${score}/100 based on ${total} total citations. ` +
        `${licensed} citations from licensed publishers (${licensed > 0 ? Math.round((licensed / total) * 100) : 0}% of total). ` +
        `Citations span ${Object.keys(categories).length} categories: ${Object.keys(categories).join(', ')}.`;

      return {
        score,
        weight,
        points: score * weight,
        details: {
          totalCitations: total,
          licensedPublisherCitations: licensed,
          averageAuthority: 0, // Would require external API
          citationCategories: categories,
        },
        evidence,
        explanation,
        missing,
      };
    } catch (error) {
      this.logger.error(`Failed to calculate citations score: ${error instanceof Error ? error.message : String(error)}`);
      return {
        score: 0,
        weight,
        points: 0,
        details: { totalCitations: 0, licensedPublisherCitations: 0, averageAuthority: 0, citationCategories: {} },
        evidence: [],
        explanation: 'Citations calculation failed',
        missing: ['Citations calculation failed'],
      };
    }
  }

  /**
   * Calculate Competitor Comparison score (15% weight)
   */
  private async calculateCompetitorComparisonScore(
    workspaceId: string,
    brandName: string,
    competitorNames: string[],
    weight: number
  ): Promise<PremiumGEOScore['breakdown']['competitorComparison']> {
    const evidence: string[] = [];
    const missing: string[] = [];

    try {
      // Get Share of Voice
      const allEntities = [brandName, ...competitorNames];
      const sov = await this.evidenceBackedSOV.calculateEvidenceBackedSOV(workspaceId, allEntities);

      const brandSOV = sov.find(s => s.entity.toLowerCase() === brandName.toLowerCase());
      const shareOfVoice = brandSOV?.sharePercentage || 0;

      // Calculate relative position
      const sortedSOV = sov.sort((a, b) => b.sharePercentage - a.sharePercentage);
      const brandPosition = sortedSOV.findIndex(s => s.entity.toLowerCase() === brandName.toLowerCase());
      const relativePosition = brandPosition >= 0
        ? (sov.length - brandPosition) / sov.length // 1.0 = leader, 0.0 = last
        : 0;

      // Calculate score: based on share of voice and relative position
      let score = shareOfVoice * 0.6; // 60% from share
      score += relativePosition * 100 * 0.4; // 40% from position

      score = Math.min(100, score);

      evidence.push(`Share of Voice: ${shareOfVoice}%`);
      evidence.push(`Position: ${brandPosition >= 0 ? brandPosition + 1 : 'N/A'} of ${sov.length}`);
      evidence.push(`Competitors analyzed: ${competitorNames.length}`);

      if (competitorNames.length === 0) {
        missing.push('No competitors provided for comparison');
      }
      if (shareOfVoice < 20) {
        missing.push(`Low share of voice: ${shareOfVoice}%`);
      }

      const explanation = `Competitor comparison score of ${Math.round(score)}/100. ` +
        `Share of Voice: ${shareOfVoice}% (${brandPosition >= 0 ? `ranked #${brandPosition + 1}` : 'not ranked'} of ${sov.length} entities). ` +
        `Compared against ${competitorNames.length} competitors. ` +
        `Relative position: ${Math.round(relativePosition * 100)}% (${relativePosition >= 0.7 ? 'leader' : relativePosition >= 0.4 ? 'middle' : 'trailing'}).`;

      return {
        score: Math.round(score),
        weight,
        points: score * weight,
        details: {
          shareOfVoice,
          competitorCount: competitorNames.length,
          relativePosition,
        },
        evidence,
        explanation,
        missing,
      };
    } catch (error) {
      this.logger.error(`Failed to calculate competitor comparison score: ${error instanceof Error ? error.message : String(error)}`);
      return {
        score: 0,
        weight,
        points: 0,
        details: { shareOfVoice: 0, competitorCount: 0, relativePosition: 0 },
        evidence: [],
        explanation: 'Competitor comparison calculation failed',
        missing: ['Competitor comparison calculation failed'],
      };
    }
  }

  /**
   * Calculate Schema/Technical score (10% weight)
   */
  private async calculateSchemaTechnicalScore(
    workspaceId: string,
    domain: string,
    weight: number
  ): Promise<PremiumGEOScore['breakdown']['schemaTechnical']> {
    const evidence: string[] = [];
    const missing: string[] = [];

    try {
      const schemaAudit = await this.schemaAuditor.auditPage(domain);
      const structuralScore = await this.structuralScoring.calculateStructuralScore(workspaceId);

      const schemaTypes = schemaAudit.schemaTypes || [];
      const schemaTypeNames = schemaTypes.map((st: any) => typeof st === 'string' ? st : st.type).filter(Boolean);
      const schemaCompleteness = schemaTypeNames.length > 0 ? (schemaTypeNames.length / 5) * 100 : 0; // Max 5 schema types
      const structuredDataQuality = structuralScore.overall || 0;

      // Calculate score
      let score = schemaCompleteness * 0.5; // 50% from schema completeness
      score += structuredDataQuality * 0.5; // 50% from structural quality

      score = Math.min(100, score);

      if (schemaTypeNames.length > 0) {
        evidence.push(`Schema types found: ${schemaTypeNames.join(', ')}`);
      } else {
        missing.push('No schema.org markup found');
      }

      evidence.push(`Schema completeness: ${Math.round(schemaCompleteness)}%`);
      evidence.push(`Structural quality: ${Math.round(structuredDataQuality)}%`);

      if (schemaCompleteness < 50) {
        missing.push('Incomplete schema markup');
      }

      const explanation = `Schema/Technical score of ${Math.round(score)}/100. ` +
        `${schemaTypeNames.length} schema types found: ${schemaTypeNames.join(', ')}. ` +
        `Schema completeness: ${Math.round(schemaCompleteness)}%, ` +
        `Structural quality: ${Math.round(structuredDataQuality)}%.`;

      return {
        score: Math.round(score),
        weight,
        points: score * weight,
        details: {
          schemaTypes: schemaTypeNames,
          schemaCompleteness: Math.round(schemaCompleteness),
          structuredDataQuality: Math.round(structuredDataQuality),
        },
        evidence,
        explanation,
        missing,
      };
    } catch (error) {
      this.logger.error(`Failed to calculate schema technical score: ${error instanceof Error ? error.message : String(error)}`);
      return {
        score: 0,
        weight,
        points: 0,
        details: { schemaTypes: [], schemaCompleteness: 0, structuredDataQuality: 0 },
        evidence: [],
        explanation: 'Schema technical calculation failed',
        missing: ['Schema technical calculation failed'],
      };
    }
  }

  /**
   * Categorize domain for citation analysis
   */
  private categorizeDomain(domain: string): string {
    const domainLower = domain.toLowerCase();
    if (domainLower.includes('reddit.com')) return 'social';
    if (domainLower.includes('yelp.com') || domainLower.includes('tripadvisor.com')) return 'review';
    if (domainLower.includes('google.com') || domainLower.includes('bing.com')) return 'directory';
    if (domainLower.includes('nytimes.com') || domainLower.includes('wsj.com') || 
        domainLower.includes('reuters.com') || domainLower.includes('bbc.com')) return 'news';
    if (domainLower.includes('blog') || domainLower.includes('medium.com')) return 'blog';
    return 'other';
  }

  /**
   * Generate diagnostic intelligence for GEO score breakdown
   */
  async generateGEOScoreDiagnostics(
    workspaceId: string,
    geoScore: PremiumGEOScore,
    industry?: string
  ): Promise<{
    insights: DiagnosticInsight[];
    recommendations: DiagnosticRecommendation[];
    priorityImprovements: Array<{
      category: string;
      currentScore: number;
      maxScore: number;
      priority: 'high' | 'medium' | 'low';
      expectedImpact: number;
      steps: string[];
    }>;
  }> {
    const insights: DiagnosticInsight[] = [];
    const priorityImprovements: Array<{
      category: string;
      currentScore: number;
      maxScore: number;
      priority: 'high' | 'medium' | 'low';
      expectedImpact: number;
      steps: string[];
    }> = [];

    // Analyze each sub-score
    const subScores = [
      { name: 'AI Visibility', data: geoScore.breakdown.aiVisibility, weight: geoScore.breakdown.aiVisibility.weight },
      { name: 'EEAT', data: geoScore.breakdown.eeat, weight: geoScore.breakdown.eeat.weight },
      { name: 'Citations', data: geoScore.breakdown.citations, weight: geoScore.breakdown.citations.weight },
      { name: 'Competitor Comparison', data: geoScore.breakdown.competitorComparison, weight: geoScore.breakdown.competitorComparison.weight },
      { name: 'Schema/Technical', data: geoScore.breakdown.schemaTechnical, weight: geoScore.breakdown.schemaTechnical.weight },
    ];

    for (const subScore of subScores) {
      const score = subScore.data.score;
      const maxPoints = subScore.weight * 100;
      const currentPoints = subScore.data.points;
      const gap = maxPoints - currentPoints;

      // Generate insight based on score
      if (score < 50) {
        insights.push({
          type: 'weakness',
          category: this.mapScoreToCategory(subScore.name),
          title: `Low ${subScore.name} Score`,
          description: `${subScore.name} score is ${score}/100, missing ${gap.toFixed(0)} potential points`,
          reasoning: `Low ${subScore.name} score reduces overall GEO score by ${(gap / 100 * 100).toFixed(0)} points. ${subScore.data.explanation}`,
          impact: gap > 20 ? 'high' : gap > 10 ? 'medium' : 'low',
          confidence: 0.9,
          evidence: subScore.data.evidence,
        });
      } else if (score >= 80) {
        insights.push({
          type: 'strength',
          category: this.mapScoreToCategory(subScore.name),
          title: `Strong ${subScore.name} Score`,
          description: `${subScore.name} score is ${score}/100, contributing ${currentPoints.toFixed(0)} points`,
          reasoning: `Strong ${subScore.name} score is a key strength. ${subScore.data.explanation}`,
          impact: 'high',
          confidence: 0.9,
          evidence: subScore.data.evidence,
        });
      }

      // Calculate priority improvement
      if (score < 80 && gap > 5) {
        const priority = gap > 20 ? 'high' : gap > 10 ? 'medium' : 'low';
        priorityImprovements.push({
          category: subScore.name,
          currentScore: score,
          maxScore: 100,
          priority,
          expectedImpact: gap, // Points that could be gained
          steps: this.generateImprovementSteps(subScore.name, subScore.data),
        });
      }
    }

    // Generate recommendations
    const recommendations = await this.diagnosticIntelligence.generateRecommendations(workspaceId, insights, {
      category: 'geo_score',
      currentScore: geoScore.total,
      maxScore: 100,
    });

    // Add score-specific recommendations
    for (const improvement of priorityImprovements.filter(i => i.priority === 'high')) {
      recommendations.push({
        id: `geo-score-${improvement.category.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
        title: `Improve ${improvement.category} Score`,
        description: `Increase ${improvement.category} from ${improvement.currentScore} to target 80+`,
        category: this.mapCategoryToRecommendation(improvement.category),
        priority: improvement.priority,
        difficulty: improvement.expectedImpact > 20 ? 'hard' : improvement.expectedImpact > 10 ? 'medium' : 'easy',
        expectedImpact: {
          scoreImprovement: Math.round(improvement.expectedImpact),
          description: `Expected ${Math.round(improvement.expectedImpact)} point improvement to GEO score`,
        },
        steps: improvement.steps,
        relatedInsights: insights.filter(i => i.title.includes(improvement.category)).map((_, idx) => `insight-${idx}`),
        estimatedTime: improvement.expectedImpact > 20 ? '4-8 weeks' : improvement.expectedImpact > 10 ? '2-4 weeks' : '1-2 weeks',
        evidence: [`Current score: ${improvement.currentScore}/100`, `Potential gain: ${improvement.expectedImpact.toFixed(0)} points`],
      });
    }

    // Add industry weight explanation if applicable
    if (industry) {
      insights.push({
        type: 'opportunity',
        category: 'technical',
        title: 'Industry-Specific Weighting Applied',
        description: `Score weights adjusted for ${industry} industry`,
        reasoning: `Industry-specific weights optimize scoring for ${industry} characteristics`,
        impact: 'medium',
        confidence: 0.8,
        evidence: [`Industry: ${industry}`, `Weights: Visibility ${(geoScore.breakdown.aiVisibility.weight * 100).toFixed(0)}%, EEAT ${(geoScore.breakdown.eeat.weight * 100).toFixed(0)}%, Citations ${(geoScore.breakdown.citations.weight * 100).toFixed(0)}%`],
      });
    }

    return { insights, recommendations, priorityImprovements };
  }

  private mapScoreToCategory(scoreName: string): DiagnosticInsight['category'] {
    const mapping: Record<string, DiagnosticInsight['category']> = {
      'AI Visibility': 'visibility',
      'EEAT': 'trust',
      'Citations': 'trust',
      'Competitor Comparison': 'competition',
      'Schema/Technical': 'technical',
    };
    return mapping[scoreName] || 'technical';
  }

  private mapCategoryToRecommendation(category: string): DiagnosticRecommendation['category'] {
    const mapping: Record<string, DiagnosticRecommendation['category']> = {
      'AI Visibility': 'content',
      'EEAT': 'trust',
      'Citations': 'citations',
      'Competitor Comparison': 'positioning',
      'Schema/Technical': 'schema',
    };
    return mapping[category] || 'technical';
  }

  private generateImprovementSteps(category: string, data: any): string[] {
    const steps: string[] = [];

    switch (category) {
      case 'AI Visibility':
        steps.push('Increase prompt coverage across all engines');
        steps.push('Improve mention frequency in AI responses');
        steps.push('Optimize content for high-value prompts');
        break;
      case 'EEAT':
        steps.push('Build authoritativeness through citations');
        steps.push('Improve expertise signals');
        steps.push('Strengthen trustworthiness markers');
        break;
      case 'Citations':
        steps.push('Build relationships with licensed publishers');
        steps.push('Create shareable, citable content');
        steps.push('Improve directory listings');
        break;
      case 'Competitor Comparison':
        steps.push('Analyze competitor strategies');
        steps.push('Improve share of voice');
        steps.push('Optimize for competitive prompts');
        break;
      case 'Schema/Technical':
        steps.push('Add comprehensive schema.org markup');
        steps.push('Improve structured data quality');
        steps.push('Fix technical SEO issues');
        break;
    }

    if (data.missing && data.missing.length > 0) {
      steps.push(`Address missing: ${data.missing.slice(0, 2).join(', ')}`);
    }

    return steps;
  }
}


/**
 * Trust Failure Detection Engine
 * 
 * Detects WHY an LLM mistrusts or deprioritizes a business.
 * Identifies specific trust failure categories with evidence.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { TrustFailure } from '../types/diagnostic.types';
import { EEATCalculatorService } from './eeat-calculator.service';
import { PremiumCitationService } from '../citations/premium-citation-service';
import { SchemaAuditorService } from '../structural/schema-auditor';

@Injectable()
export class TrustFailureService {
  private readonly logger = new Logger(TrustFailureService.name);
  private dbPool: Pool;

  constructor(
    private readonly eeatCalculator: EEATCalculatorService,
    private readonly citationService: PremiumCitationService,
    private readonly schemaAuditor: SchemaAuditorService,
  ) {
    this.dbPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
  }

  /**
   * Detect trust failures for a workspace
   */
  async detectTrustFailures(
    workspaceId: string,
    brandName: string
  ): Promise<TrustFailure[]> {
    this.logger.log(`Detecting trust failures for ${brandName}`);

    const failures: TrustFailure[] = [];

    try {
      // Check data incompleteness
      const dataIncompleteness = await this.checkDataIncompleteness(workspaceId, brandName);
      if (dataIncompleteness) failures.push(dataIncompleteness);

      // Check experience deficiency
      const experienceDeficiency = await this.checkExperienceDeficiency(workspaceId);
      if (experienceDeficiency) failures.push(experienceDeficiency);

      // Check missing authority markers
      const missingAuthority = await this.checkMissingAuthority(workspaceId, brandName);
      if (missingAuthority) failures.push(missingAuthority);

      // Check missing trust signals
      const missingTrustSignals = await this.checkMissingTrustSignals(workspaceId);
      if (missingTrustSignals) failures.push(missingTrustSignals);

      // Check inconsistent entity data
      const inconsistentEntity = await this.checkInconsistentEntityData(workspaceId, brandName);
      if (inconsistentEntity) failures.push(inconsistentEntity);

      // Check low citation density
      const lowCitations = await this.checkLowCitationDensity(workspaceId, brandName);
      if (lowCitations) failures.push(lowCitations);

      // Check low quality reviews
      const lowReviews = await this.checkLowQualityReviews(workspaceId, brandName);
      if (lowReviews) failures.push(lowReviews);

      // Check schema mismatch
      const schemaMismatch = await this.checkSchemaMismatch(workspaceId);
      if (schemaMismatch) failures.push(schemaMismatch);

      // Check brand instability
      const brandInstability = await this.checkBrandInstability(workspaceId, brandName);
      if (brandInstability) failures.push(brandInstability);

      // Check conflicting content
      const conflictingContent = await this.checkConflictingContent(workspaceId, brandName);
      if (conflictingContent) failures.push(conflictingContent);

      // Check thin content coverage
      const thinContent = await this.checkThinContentCoverage(workspaceId, brandName);
      if (thinContent) failures.push(thinContent);

      // Check low semantic relevance
      const lowSemantic = await this.checkLowSemanticRelevance(workspaceId, brandName);
      if (lowSemantic) failures.push(lowSemantic);

      // Check high competitor dominance
      const competitorDominance = await this.checkHighCompetitorDominance(workspaceId, brandName);
      if (competitorDominance) failures.push(competitorDominance);

      return failures;
    } catch (error) {
      this.logger.error(`Failed to detect trust failures: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Check data incompleteness
   */
  private async checkDataIncompleteness(
    workspaceId: string,
    brandName: string
  ): Promise<TrustFailure | null> {
    // Check for missing basic data
    const result = await this.dbPool.query<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM "citations" c
       WHERE c."workspaceId" = $1
         AND LOWER(c."brand") = LOWER($2)`,
      [workspaceId, brandName]
    );

    const citationCount = result.rows[0]?.count || 0;

    if (citationCount < 5) {
      return {
        category: 'data_incompleteness',
        severity: citationCount === 0 ? 90 : 70,
        confidence: 0.9,
        evidence: [`Only ${citationCount} citations found. Insufficient data for LLM trust.`],
        engineNotes: [
          { engine: 'all', note: 'Insufficient citation data across all engines', impact: 'high' },
        ],
        description: 'Incomplete data profile prevents LLMs from building trust in the brand',
        recommendedFixes: [
          'Acquire citations from authoritative sources',
          'Build comprehensive entity profile',
          'Ensure consistent brand data across platforms',
        ],
      };
    }

    return null;
  }

  /**
   * Check experience deficiency
   */
  private async checkExperienceDeficiency(workspaceId: string): Promise<TrustFailure | null> {
    try {
      const eeatScore = await this.eeatCalculator.calculateEEATScore(workspaceId);

      if (eeatScore.experience < 50) {
        return {
          category: 'experience_deficiency',
          severity: Math.round((50 - eeatScore.experience) * 2),
          confidence: 0.8,
          evidence: [
            `Experience score: ${eeatScore.experience}/100`,
            `Case studies: ${eeatScore.breakdown.experience.caseStudies}`,
            `Testimonials: ${eeatScore.breakdown.experience.testimonials}`,
          ],
          engineNotes: [
            { engine: 'all', note: 'Low experience signals reduce trust', impact: 'high' },
          ],
          description: 'Insufficient experience signals (case studies, testimonials, user-generated content)',
          recommendedFixes: [
            'Add case studies and success stories',
            'Collect and display customer testimonials',
            'Encourage user-generated content and reviews',
          ],
        };
      }
    } catch (error) {
      this.logger.warn(`Could not check experience deficiency: ${error instanceof Error ? error.message : String(error)}`);
    }

    return null;
  }

  /**
   * Check missing authority markers
   */
  private async checkMissingAuthority(
    workspaceId: string,
    brandName: string
  ): Promise<TrustFailure | null> {
    try {
      const eeatScore = await this.eeatCalculator.calculateEEATScore(workspaceId);

      if (eeatScore.authoritativeness < 50) {
        const citationResult = await this.dbPool.query<{ count: number }>(
          `SELECT COUNT(*) as count
           FROM "citations" c
           WHERE c."workspaceId" = $1
             AND LOWER(c."brand") = LOWER($2)`,
          [workspaceId, brandName]
        );

        const citationCount = citationResult.rows[0]?.count || 0;

        return {
          category: 'missing_authority',
          severity: Math.round((50 - eeatScore.authoritativeness) * 2),
          confidence: 0.8,
          evidence: [
            `Authoritativeness score: ${eeatScore.authoritativeness}/100`,
            `Citations: ${citationCount}`,
            `Backlinks: ${eeatScore.breakdown.authoritativeness.backlinks}`,
          ],
          engineNotes: [
            { engine: 'all', note: 'Missing authority markers reduce trust', impact: 'high' },
          ],
          description: 'Insufficient authority signals (citations, backlinks, industry recognition)',
          recommendedFixes: [
            'Build citations from licensed publishers',
            'Acquire high-quality backlinks',
            'Seek industry recognition and awards',
          ],
        };
      }
    } catch (error) {
      this.logger.warn(`Could not check missing authority: ${error instanceof Error ? error.message : String(error)}`);
    }

    return null;
  }

  /**
   * Check missing trust signals
   */
  private async checkMissingTrustSignals(workspaceId: string): Promise<TrustFailure | null> {
    try {
      const eeatScore = await this.eeatCalculator.calculateEEATScore(workspaceId);

      if (eeatScore.trustworthiness < 50) {
        return {
          category: 'missing_trust_signals',
          severity: Math.round((50 - eeatScore.trustworthiness) * 2),
          confidence: 0.8,
          evidence: [
            `Trustworthiness score: ${eeatScore.trustworthiness}/100`,
            `Reviews: ${eeatScore.breakdown.trustworthiness.reviews}`,
            `Security badges: ${eeatScore.breakdown.trustworthiness.securityBadges}`,
          ],
          engineNotes: [
            { engine: 'all', note: 'Missing trust signals reduce confidence', impact: 'high' },
          ],
          description: 'Insufficient trust signals (reviews, security badges, transparency)',
          recommendedFixes: [
            'Collect and display customer reviews',
            'Add security badges and certifications',
            'Improve transparency (privacy policy, terms, contact info)',
          ],
        };
      }
    } catch (error) {
      this.logger.warn(`Could not check missing trust signals: ${error instanceof Error ? error.message : String(error)}`);
    }

    return null;
  }

  /**
   * Check inconsistent entity data
   */
  private async checkInconsistentEntityData(
    workspaceId: string,
    brandName: string
  ): Promise<TrustFailure | null> {
    // Check for inconsistent brand name mentions
    const result = await this.dbPool.query<{ brand: string; count: number }>(
      `SELECT 
        m."brand",
        COUNT(*) as count
      FROM "mentions" m
      JOIN "answers" a ON a.id = m."answerId"
      JOIN "prompt_runs" pr ON pr.id = a."promptRunId"
      WHERE pr."workspaceId" = $1
        AND pr."status" = 'SUCCESS'
      GROUP BY m."brand"
      HAVING LOWER(m."brand") != LOWER($2)
        AND LOWER(m."brand") LIKE LOWER($3)`,
      [workspaceId, brandName, `%${brandName}%`]
    );

    if (result.rows.length > 0) {
      return {
        category: 'inconsistent_entity_data',
        severity: 60,
        confidence: 0.7,
        evidence: [
          `Found ${result.rows.length} inconsistent brand name variations`,
          ...result.rows.map(r => `${r.brand}: ${r.count} mentions`),
        ],
        engineNotes: [
          { engine: 'all', note: 'Inconsistent entity data confuses LLMs', impact: 'medium' },
        ],
        description: 'Inconsistent brand name or entity data across mentions',
        recommendedFixes: [
          'Standardize brand name across all platforms',
          'Use consistent entity markup',
          'Ensure consistent NAP (Name, Address, Phone) data',
        ],
      };
    }

    return null;
  }

  /**
   * Check low citation density
   */
  private async checkLowCitationDensity(
    workspaceId: string,
    brandName: string
  ): Promise<TrustFailure | null> {
    const result = await this.dbPool.query<{ count: number; avgAuthority: number }>(
      `SELECT 
        COUNT(*) as count,
        AVG(c."authorityScore") as "avgAuthority"
      FROM "citations" c
      WHERE c."workspaceId" = $1
        AND LOWER(c."brand") = LOWER($2)`,
      [workspaceId, brandName]
    );

    const citationCount = result.rows[0]?.count || 0;
    const avgAuthority = result.rows[0]?.avgAuthority || 0;

    if (citationCount < 20 || avgAuthority < 50) {
      return {
        category: 'low_citation_density',
        severity: citationCount < 10 ? 80 : 60,
        confidence: 0.9,
        evidence: [
          `Citation count: ${citationCount}`,
          `Average authority: ${Math.round(avgAuthority)}`,
        ],
        engineNotes: [
          { engine: 'all', note: 'Low citation density reduces trust', impact: 'high' },
        ],
        description: 'Insufficient citation density or low authority citations',
        recommendedFixes: [
          'Acquire citations from high-authority sources',
          'Build citations from licensed publishers',
          'Increase citation frequency and diversity',
        ],
      };
    }

    return null;
  }

  /**
   * Check low quality reviews
   */
  private async checkLowQualityReviews(
    workspaceId: string,
    brandName: string
  ): Promise<TrustFailure | null> {
    // This would require review data - for now, check sentiment
    const result = await this.dbPool.query<{ sentiment: string; count: number }>(
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
      [workspaceId, brandName]
    );

    const negativeCount = result.rows.find(r => r.sentiment === 'NEG')?.count || 0;
    const totalCount = result.rows.reduce((sum, r) => sum + parseInt(r.count.toString()), 0);

    if (totalCount > 0 && (negativeCount / totalCount) > 0.3) {
      return {
        category: 'low_quality_reviews',
        severity: Math.round((negativeCount / totalCount) * 100),
        confidence: 0.7,
        evidence: [
          `Negative sentiment: ${Math.round((negativeCount / totalCount) * 100)}%`,
          `Total mentions: ${totalCount}`,
        ],
        engineNotes: [
          { engine: 'all', note: 'High negative sentiment reduces trust', impact: 'high' },
        ],
        description: 'High proportion of negative reviews or sentiment',
        recommendedFixes: [
          'Address negative feedback and improve service quality',
          'Encourage satisfied customers to leave reviews',
          'Respond professionally to negative reviews',
        ],
      };
    }

    return null;
  }

  /**
   * Check schema mismatch
   */
  private async checkSchemaMismatch(workspaceId: string): Promise<TrustFailure | null> {
    // Schema audit would be done here - for now, return null
    // In production, this would check for missing or invalid schema
    return null;
  }

  /**
   * Check brand instability
   */
  private async checkBrandInstability(
    workspaceId: string,
    brandName: string
  ): Promise<TrustFailure | null> {
    // Check for recent changes in brand mentions or visibility
    // For now, return null - would require historical data comparison
    return null;
  }

  /**
   * Check conflicting content
   */
  private async checkConflictingContent(
    workspaceId: string,
    brandName: string
  ): Promise<TrustFailure | null> {
    // Check for conflicting information across mentions
    // This would require more sophisticated analysis
    return null;
  }

  /**
   * Check thin content coverage
   */
  private async checkThinContentCoverage(
    workspaceId: string,
    brandName: string
  ): Promise<TrustFailure | null> {
    const result = await this.dbPool.query<{ count: number }>(
      `SELECT COUNT(DISTINCT pr."promptId") as count
       FROM "prompt_runs" pr
       JOIN "answers" a ON a."promptRunId" = pr.id
       JOIN "mentions" m ON m."answerId" = a.id
       WHERE pr."workspaceId" = $1
         AND LOWER(m."brand") = LOWER($2)
         AND pr."status" = 'SUCCESS'`,
      [workspaceId, brandName]
    );

    const promptCoverage = result.rows[0]?.count || 0;

    if (promptCoverage < 5) {
      return {
        category: 'thin_content_coverage',
        severity: 70,
        confidence: 0.8,
        evidence: [`Only ${promptCoverage} prompts have brand mentions`],
        engineNotes: [
          { engine: 'all', note: 'Thin content coverage reduces visibility', impact: 'high' },
        ],
        description: 'Insufficient content coverage across relevant prompts',
        recommendedFixes: [
          'Create content addressing high-value prompts',
          'Expand topical coverage',
          'Improve content depth and quality',
        ],
      };
    }

    return null;
  }

  /**
   * Check low semantic relevance
   */
  private async checkLowSemanticRelevance(
    workspaceId: string,
    brandName: string
  ): Promise<TrustFailure | null> {
    // This would require semantic analysis - for now, return null
    return null;
  }

  /**
   * Check high competitor dominance
   */
  private async checkHighCompetitorDominance(
    workspaceId: string,
    brandName: string
  ): Promise<TrustFailure | null> {
    const result = await this.dbPool.query<{ brand: string; count: number }>(
      `SELECT 
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
      LIMIT 1`,
      [workspaceId, brandName]
    );

    const topCompetitor = result.rows[0];
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
      return {
        category: 'high_competitor_dominance',
        severity: Math.min(90, Math.round((competitorCount / (yourCount + 1)) * 10)),
        confidence: 0.8,
        evidence: [
          `${topCompetitor.brand} has ${competitorCount} mentions vs your ${yourCount}`,
          `Competitor dominance ratio: ${Math.round((competitorCount / (yourCount + 1)) * 100)}%`,
        ],
        engineNotes: [
          { engine: 'all', note: 'High competitor dominance overshadows your brand', impact: 'high' },
        ],
        description: 'Competitors dominate visibility, overshadowing your brand',
        recommendedFixes: [
          'Improve content quality and relevance',
          'Build stronger citation profile',
          'Differentiate from competitors',
        ],
      };
    }

    return null;
  }
}


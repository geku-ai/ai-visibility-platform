/**
 * Orchestration Validator Service
 * 
 * Validates data quality, sanity checks, and ensures consistency
 * across the GEO intelligence pipeline.
 */

import { Injectable, Logger } from '@nestjs/common';
import { GEOIntelligenceResponse, VisibilityOpportunity, EnhancedRecommendation } from '../types/diagnostic.types';

@Injectable()
export class OrchestrationValidatorService {
  private readonly logger = new Logger(OrchestrationValidatorService.name);

  /**
   * Validate complete intelligence response
   */
  validateIntelligenceResponse(response: GEOIntelligenceResponse): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate required fields
    if (!response.workspaceId) errors.push('Missing workspaceId');
    if (!response.brandName) errors.push('Missing brandName');
    if (!response.domain) errors.push('Missing domain');
    if (!response.industry?.primary) errors.push('Missing industry.primary');

    // Validate prompts
    if (!Array.isArray(response.prompts)) {
      errors.push('Prompts must be an array');
    } else if (response.prompts.length === 0) {
      warnings.push('No prompts generated - this may indicate data availability issues');
    } else {
      response.prompts.forEach((p, i) => {
        if (!p.text || p.text.trim().length === 0) {
          warnings.push(`Prompt ${i} has empty text`);
        }
        if (typeof p.commercialValue !== 'number' || p.commercialValue < 0 || p.commercialValue > 100) {
          warnings.push(`Prompt ${i} has invalid commercialValue: ${p.commercialValue}`);
        }
      });
    }

    // Validate competitors (should exist for competitive industries)
    const competitiveIndustries = ['travel', 'e-commerce', 'saas', 'hotel', 'restaurant'];
    const isCompetitive = competitiveIndustries.some(ind => 
      response.industry?.primary?.toLowerCase().includes(ind)
    );
    if (isCompetitive && (!Array.isArray(response.competitors) || response.competitors.length === 0)) {
      warnings.push(`No competitors found for competitive industry: ${response.industry.primary}`);
    }

    // Validate GEO Score
    this.validateGEOScore(response.geoScore, errors, warnings);

    // Validate opportunities
    if (Array.isArray(response.opportunities)) {
      response.opportunities.forEach((opp, i) => {
        this.validateOpportunity(opp, i, errors, warnings);
      });
    }

    // Validate recommendations
    if (Array.isArray(response.recommendations)) {
      response.recommendations.forEach((rec, i) => {
        this.validateRecommendation(rec, i, errors, warnings);
      });
    }

    // Validate confidence
    if (response.metadata?.confidence !== undefined) {
      const conf = response.metadata.confidence;
      if (typeof conf !== 'number' || conf < 0 || conf > 1) {
        errors.push(`Invalid metadata.confidence: ${conf} (must be 0-1)`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate GEO Score formula and components
   * Formula: 35% AI Visibility + 25% EEAT + 15% Citations + 15% Competitor Comparison + 10% Schema/Technical
   */
  private validateGEOScore(
    geoScore: any,
    errors: string[],
    warnings: string[]
  ): void {
    if (!geoScore) {
      errors.push('Missing geoScore');
      return;
    }

    const total = geoScore.overall ?? geoScore.total;
    if (typeof total !== 'number') {
      errors.push('GEO Score total must be a number');
    } else if (total < 0 || total > 100) {
      errors.push(`GEO Score total out of range: ${total} (expected 0-100)`);
    }

    if (geoScore.breakdown) {
      const breakdown = geoScore.breakdown;
      
      // Check component scores
      const components = [
        { name: 'aiVisibility', weight: 0.35, score: breakdown.aiVisibility?.score },
        { name: 'eeat', weight: 0.25, score: breakdown.eeat?.score },
        { name: 'citations', weight: 0.15, score: breakdown.citations?.score },
        { name: 'competitorComparison', weight: 0.15, score: breakdown.competitorComparison?.score },
        { name: 'schemaTechnical', weight: 0.10, score: breakdown.schemaTechnical?.score },
      ];

      let weightedSum = 0;
      components.forEach(comp => {
        if (typeof comp.score === 'number') {
          if (comp.score < 0 || comp.score > 100) {
            warnings.push(`${comp.name} score out of range: ${comp.score}`);
          }
          weightedSum += comp.score * comp.weight;
        } else {
          warnings.push(`Missing ${comp.name} score in breakdown`);
        }
      });

      // Allow some tolerance (within 10 points)
      if (typeof total === 'number' && Math.abs(weightedSum - total) > 10) {
        warnings.push(
          `GEO Score formula mismatch: total=${total}, weighted sum=${weightedSum.toFixed(2)}. ` +
          `Expected components to sum to approximately ${total}`
        );
      }
    }
  }

  /**
   * Validate visibility opportunity
   */
  private validateOpportunity(
    opp: VisibilityOpportunity,
    index: number,
    errors: string[],
    warnings: string[]
  ): void {
    if (!opp.title || opp.title.trim().length === 0) {
      errors.push(`Opportunity ${index}: Missing title`);
    }

    // Validate AI visibility breakdown
    if (opp.aiVisibility) {
      const engines = ['chatgpt', 'claude', 'gemini', 'perplexity'] as const;
      engines.forEach(engine => {
        const score = opp.aiVisibility[engine];
        if (typeof score !== 'number' || score < 0 || score > 100) {
          warnings.push(`Opportunity ${index}: Invalid ${engine} visibility: ${score}`);
        }
      });
    } else {
      errors.push(`Opportunity ${index}: Missing aiVisibility`);
    }

    // Validate action steps
    if (!Array.isArray(opp.actionSteps) || opp.actionSteps.length < 3) {
      warnings.push(`Opportunity ${index}: Should have at least 3 action steps, found ${opp.actionSteps?.length || 0}`);
    }

    // Validate confidence
    if (typeof opp.confidence !== 'number' || opp.confidence < 0 || opp.confidence > 1) {
      warnings.push(`Opportunity ${index}: Invalid confidence: ${opp.confidence}`);
    }

    // Validate impact scores
    if (typeof opp.opportunityImpact !== 'number' || opp.opportunityImpact < 0 || opp.opportunityImpact > 100) {
      warnings.push(`Opportunity ${index}: Invalid opportunityImpact: ${opp.opportunityImpact}`);
    }
    if (typeof opp.difficulty !== 'number' || opp.difficulty < 0 || opp.difficulty > 100) {
      warnings.push(`Opportunity ${index}: Invalid difficulty: ${opp.difficulty}`);
    }
    if (typeof opp.value !== 'number' || opp.value < 0 || opp.value > 100) {
      warnings.push(`Opportunity ${index}: Invalid value: ${opp.value}`);
    }

    // Validate evidence
    if (!opp.evidence || typeof opp.evidence !== 'object') {
      warnings.push(`Opportunity ${index}: Missing or invalid evidence structure`);
    } else {
      const engines = ['chatgpt', 'claude', 'gemini', 'perplexity'] as const;
      engines.forEach(engine => {
        if (!Array.isArray(opp.evidence[engine])) {
          warnings.push(`Opportunity ${index}: Evidence.${engine} should be an array`);
        }
      });
    }
  }

  /**
   * Validate recommendation
   */
  private validateRecommendation(
    rec: EnhancedRecommendation,
    index: number,
    errors: string[],
    warnings: string[]
  ): void {
    if (!rec.id) {
      errors.push(`Recommendation ${index}: Missing id`);
    }
    if (!rec.title || rec.title.trim().length === 0) {
      errors.push(`Recommendation ${index}: Missing title`);
    }
    if (!rec.description || rec.description.trim().length === 0) {
      warnings.push(`Recommendation ${index}: Missing description`);
    }

    // Validate steps (should have at least 3)
    if (!Array.isArray(rec.steps) || rec.steps.length < 3) {
      warnings.push(`Recommendation ${index}: Should have at least 3 steps, found ${rec.steps?.length || 0}`);
    }

    // Validate priority
    const validPriorities = ['critical', 'high', 'medium', 'low'];
    if (!validPriorities.includes(rec.priority)) {
      warnings.push(`Recommendation ${index}: Invalid priority: ${rec.priority}`);
    }

    // Validate difficulty
    const validDifficulties = ['easy', 'medium', 'hard'];
    if (!validDifficulties.includes(rec.difficulty)) {
      warnings.push(`Recommendation ${index}: Invalid difficulty: ${rec.difficulty}`);
    }

    // Validate confidence
    if (typeof rec.confidence !== 'number' || rec.confidence < 0 || rec.confidence > 1) {
      warnings.push(`Recommendation ${index}: Invalid confidence: ${rec.confidence}`);
    }

    // Validate expected impact
    if (rec.expectedImpact) {
      if (rec.expectedImpact.geoScoreImprovement !== undefined) {
        if (typeof rec.expectedImpact.geoScoreImprovement !== 'number' || rec.expectedImpact.geoScoreImprovement < 0) {
          warnings.push(`Recommendation ${index}: Invalid geoScoreImprovement: ${rec.expectedImpact.geoScoreImprovement}`);
        }
      }
      if (rec.expectedImpact.visibilityGain !== undefined) {
        if (typeof rec.expectedImpact.visibilityGain !== 'number' || rec.expectedImpact.visibilityGain < 0 || rec.expectedImpact.visibilityGain > 100) {
          warnings.push(`Recommendation ${index}: Invalid visibilityGain: ${rec.expectedImpact.visibilityGain}`);
        }
      }
    }

    // Validate evidence
    if (!Array.isArray(rec.evidence)) {
      warnings.push(`Recommendation ${index}: Evidence should be an array`);
    }
  }

  /**
   * Validate that data quality meets minimum thresholds
   */
  validateDataQuality(response: GEOIntelligenceResponse): {
    meetsThreshold: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check prompts
    if (response.prompts.length < 5) {
      issues.push(`Only ${response.prompts.length} prompts generated (expected at least 5)`);
    }

    // Check competitors for competitive industries
    const competitiveIndustries = ['travel', 'e-commerce', 'saas', 'hotel', 'restaurant', 'booking'];
    const isCompetitive = competitiveIndustries.some(ind =>
      response.industry?.primary?.toLowerCase().includes(ind)
    );
    if (isCompetitive && response.competitors.length < 3) {
      issues.push(`Only ${response.competitors.length} competitors found for competitive industry (expected at least 3)`);
    }

    // Check opportunities
    if (response.opportunities.length === 0) {
      issues.push('No visibility opportunities generated');
    } else if (response.opportunities.length < 5) {
      issues.push(`Only ${response.opportunities.length} opportunities generated (expected at least 5 for comprehensive analysis)`);
    }

    // Check recommendations
    if (response.recommendations.length === 0) {
      issues.push('No recommendations generated');
    } else if (response.recommendations.length < 3) {
      issues.push(`Only ${response.recommendations.length} recommendations generated (expected at least 3)`);
    }

    // Check confidence
    if (response.metadata.confidence < 0.5) {
      issues.push(`Low overall confidence: ${response.metadata.confidence} (expected >= 0.5)`);
    }

    return {
      meetsThreshold: issues.length === 0,
      issues,
    };
  }
}


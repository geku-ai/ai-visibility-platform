/**
 * Enhanced Recommendation Service
 * 
 * Generates actionable recommendations by integrating:
 * - Trust failures → fixes
 * - Schema auditor → schema fixes
 * - Competitor advantages → strategy
 * - Prompt clusters → content roadmap
 * - Difficulty scoring → timelines
 * - Commercial value → priority ordering
 * 
 * Backend-only service - returns structured JSON.
 */

import { Injectable, Logger } from '@nestjs/common';
import { EnhancedRecommendation } from '../types/diagnostic.types';
import { TrustFailure } from '../types/diagnostic.types';
import { CompetitorAdvantageAnalysis } from '../types/diagnostic.types';
import { PromptCluster } from '../types/diagnostic.types';
import { FixDifficultyAnalysis } from '../types/diagnostic.types';
import { CommercialValueImpact } from '../types/diagnostic.types';
import { SchemaAuditorService } from '../structural/schema-auditor';
import { EEATCalculatorService } from '../trust/eeat-calculator.service';

@Injectable()
export class EnhancedRecommendationService {
  private readonly logger = new Logger(EnhancedRecommendationService.name);

  constructor(
    private readonly schemaAuditor: SchemaAuditorService,
    private readonly eeatCalculator: EEATCalculatorService,
  ) {}

  /**
   * Generate enhanced recommendations integrating all intelligence engines
   */
  async generateEnhancedRecommendations(
    workspaceId: string,
    brandName: string,
    context: {
      trustFailures: TrustFailure[];
      competitorAnalyses: CompetitorAdvantageAnalysis[];
      promptClusters: PromptCluster[];
      fixDifficulties: FixDifficultyAnalysis[];
      commercialValues: CommercialValueImpact[];
      geoScore?: any;
    }
  ): Promise<EnhancedRecommendation[]> {
    this.logger.log(`Generating enhanced recommendations for ${brandName}`);

    const recommendations: EnhancedRecommendation[] = [];

    try {
      // 1. Recommendations from trust failures
      recommendations.push(...this.generateTrustFailureRecommendations(context.trustFailures));

      // 2. Recommendations from schema gaps
      recommendations.push(...await this.generateSchemaRecommendations(workspaceId, brandName));

      // 3. Recommendations from competitor advantages
      recommendations.push(...this.generateCompetitorStrategyRecommendations(context.competitorAnalyses));

      // 4. Recommendations from prompt clusters
      recommendations.push(...this.generateContentRoadmapRecommendations(context.promptClusters, context.commercialValues));

      // 5. Recommendations from fix difficulty
      recommendations.push(...this.generateTimelineRecommendations(context.fixDifficulties));

      // 6. Recommendations from commercial value
      recommendations.push(...this.generatePriorityRecommendations(context.commercialValues, context.promptClusters));

      // 7. Recommendations from GEO Score
      if (context.geoScore) {
        recommendations.push(...this.generateGEOScoreRecommendations(context.geoScore));
      }

      // Sort by priority and commercial value
      return this.prioritizeRecommendations(recommendations);
    } catch (error) {
      this.logger.error(`Failed to generate recommendations: ${error instanceof Error ? error.message : String(error)}`);
      return recommendations;
    }
  }

  /**
   * Generate recommendations from trust failures
   */
  private generateTrustFailureRecommendations(
    trustFailures: TrustFailure[]
  ): EnhancedRecommendation[] {
    const recommendations: EnhancedRecommendation[] = [];

    for (const failure of trustFailures) {
      if (failure.severity > 50) {
        recommendations.push({
          id: `trust-failure-${failure.category}-${Date.now()}`,
          title: `Fix ${failure.category.replace(/_/g, ' ')}`,
          description: failure.description,
          category: this.mapTrustFailureToCategory(failure.category),
          priority: failure.severity > 80 ? 'critical' : failure.severity > 60 ? 'high' : 'medium',
          difficulty: failure.severity > 70 ? 'hard' : failure.severity > 50 ? 'medium' : 'easy',
          timeEstimate: this.estimateTimeFromSeverity(failure.severity),
          expectedImpact: {
            trustGain: Math.round(failure.severity * 0.8),
            description: `Addressing this trust failure could improve trustworthiness by ${Math.round(failure.severity * 0.8)}%`,
          },
          steps: failure.recommendedFixes,
          relatedTrustFailures: [failure.category],
          evidence: failure.evidence,
          confidence: failure.confidence,
          reasoning: `Trust failure detected with severity ${failure.severity}/100. ${failure.description}`,
        });
      }
    }

    return recommendations;
  }

  /**
   * Generate recommendations from schema gaps
   */
  private async generateSchemaRecommendations(
    workspaceId: string,
    brandName: string
  ): Promise<EnhancedRecommendation[]> {
    const recommendations: EnhancedRecommendation[] = [];

    try {
      // Check for missing schema types
      // In production, this would use schemaAuditor.auditPage()
      // For now, generate general schema recommendations

      recommendations.push({
        id: `schema-implementation-${Date.now()}`,
        title: 'Implement Comprehensive Schema Markup',
        description: 'Add structured data markup to improve AI engine understanding and visibility',
        category: 'schema',
        priority: 'high',
        difficulty: 'medium',
        timeEstimate: '2-4 weeks',
        expectedImpact: {
          geoScoreImprovement: 5,
          visibilityGain: 15,
          description: 'Schema markup can improve visibility by 15% and GEO Score by 5 points',
        },
        steps: [
          'Add Organization schema to homepage',
          'Implement Product/Service schema where applicable',
          'Add FAQ schema for common questions',
          'Include LocalBusiness schema if applicable',
          'Validate schema with Google Rich Results Test',
        ],
        evidence: ['Schema markup improves AI engine understanding'],
        confidence: 0.8,
        reasoning: 'Structured data helps AI engines better understand and represent your business',
      });
    } catch (error) {
      this.logger.warn(`Could not generate schema recommendations: ${error instanceof Error ? error.message : String(error)}`);
    }

    return recommendations;
  }

  /**
   * Generate recommendations from competitor advantages
   */
  private generateCompetitorStrategyRecommendations(
    competitorAnalyses: CompetitorAdvantageAnalysis[]
  ): EnhancedRecommendation[] {
    const recommendations: EnhancedRecommendation[] = [];

    for (const analysis of competitorAnalyses) {
      // Recommendations based on competitor weaknesses
      if (analysis.weaknessFactors.length > 0) {
        const topWeakness = analysis.weaknessFactors[0];
        recommendations.push({
          id: `competitor-strategy-${analysis.competitor}-${Date.now()}`,
          title: `Exploit ${analysis.competitor} Weakness: ${topWeakness.factor}`,
          description: `Target area where ${analysis.competitor} is weak: ${topWeakness.factor}`,
          category: 'competitor',
          priority: topWeakness.impact === 'high' ? 'high' : 'medium',
          difficulty: analysis.yourAdvantageOpportunity.difficulty > 70 ? 'hard' : analysis.yourAdvantageOpportunity.difficulty > 40 ? 'medium' : 'easy',
          timeEstimate: this.estimateTimeFromDifficulty(analysis.yourAdvantageOpportunity.difficulty),
          expectedImpact: {
            visibilityGain: Math.round((100 - analysis.structuralWeaknessScore) * 0.3),
            description: `Exploiting competitor weakness could gain ${Math.round((100 - analysis.structuralWeaknessScore) * 0.3)}% visibility`,
          },
          steps: [
            ...analysis.yourAdvantageOpportunity.shortTerm,
            ...analysis.yourAdvantageOpportunity.longTerm,
          ],
          relatedCompetitors: [analysis.competitor],
          evidence: topWeakness.evidence,
          confidence: 0.7,
          reasoning: `${analysis.competitor} has structural weakness score of ${analysis.structuralWeaknessScore}/100. Opportunity to gain advantage.`,
        });
      }
    }

    return recommendations;
  }

  /**
   * Generate content roadmap recommendations from prompt clusters
   */
  private generateContentRoadmapRecommendations(
    promptClusters: PromptCluster[],
    commercialValues: CommercialValueImpact[]
  ): EnhancedRecommendation[] {
    const recommendations: EnhancedRecommendation[] = [];

    // Find high-value, low-visibility clusters
    const highValueClusters = promptClusters
      .map((cluster, idx) => ({
        cluster,
        commercialValue: commercialValues[idx] || { commercialOpportunityScore: 0 },
      }))
      .filter(({ cluster, commercialValue }) => 
        commercialValue.commercialOpportunityScore > 60 && cluster.clusterVisibilityAverage < 30
      )
      .sort((a, b) => b.commercialValue.commercialOpportunityScore - a.commercialValue.commercialOpportunityScore)
      .slice(0, 5);

    for (const { cluster, commercialValue } of highValueClusters) {
      recommendations.push({
        id: `content-roadmap-${cluster.type}-${Date.now()}`,
        title: `Create Content for ${cluster.title} Cluster`,
        description: `High-value cluster (${commercialValue.commercialOpportunityScore}/100) with low visibility (${cluster.clusterVisibilityAverage}%)`,
        category: 'content',
        priority: commercialValue.commercialOpportunityScore > 80 ? 'high' : 'medium',
        difficulty: cluster.difficulty > 70 ? 'hard' : cluster.difficulty > 40 ? 'medium' : 'easy',
        timeEstimate: cluster.difficulty > 70 ? '4-6 weeks' : cluster.difficulty > 40 ? '2-4 weeks' : '1-2 weeks',
        expectedImpact: {
          visibilityGain: Math.round((100 - cluster.clusterVisibilityAverage) * 0.5),
          commercialValue: commercialValue.commercialOpportunityScore,
          description: `Content for this cluster could improve visibility by ${Math.round((100 - cluster.clusterVisibilityAverage) * 0.5)}%`,
        },
        steps: [
          ...cluster.contentGaps,
          `Create content addressing: ${cluster.prompts.slice(0, 3).join(', ')}`,
          `Implement required schema: ${cluster.requiredSchemaTypes.join(', ')}`,
          `Acquire ${cluster.citationsRequired} citations for this cluster`,
        ],
        relatedPromptClusters: [cluster.type],
        evidence: cluster.evidence,
        confidence: cluster.confidence,
        reasoning: cluster.rootCause,
      });
    }

    return recommendations;
  }

  /**
   * Generate timeline recommendations from fix difficulty
   */
  private generateTimelineRecommendations(
    fixDifficulties: FixDifficultyAnalysis[]
  ): EnhancedRecommendation[] {
    const recommendations: EnhancedRecommendation[] = [];

    // Group by time estimate
    const timeGroups = new Map<string, FixDifficultyAnalysis[]>();
    for (const difficulty of fixDifficulties) {
      const time = difficulty.timeEstimate;
      if (!timeGroups.has(time)) {
        timeGroups.set(time, []);
      }
      timeGroups.get(time)!.push(difficulty);
    }

    for (const [timeEstimate, difficulties] of timeGroups.entries()) {
      const avgDifficulty = difficulties.reduce((sum, d) => sum + d.difficultyScore, 0) / difficulties.length;
      
      recommendations.push({
        id: `timeline-${timeEstimate}-${Date.now()}`,
        title: `${timeEstimate} Implementation Plan`,
        description: `Plan for ${difficulties.length} fixes with average difficulty ${Math.round(avgDifficulty)}/100`,
        category: 'technical',
        priority: avgDifficulty > 70 ? 'high' : 'medium',
        difficulty: avgDifficulty > 70 ? 'hard' : avgDifficulty > 40 ? 'medium' : 'easy',
        timeEstimate,
        expectedImpact: {
          geoScoreImprovement: Math.round(avgDifficulty * 0.1),
          description: `Completing these fixes could improve GEO Score by ${Math.round(avgDifficulty * 0.1)} points`,
        },
        steps: [
          ...difficulties[0].primaryConstraints.map(c => `Address: ${c}`),
          ...difficulties[0].secondaryConstraints.map(c => `Consider: ${c}`),
        ],
        evidence: difficulties.flatMap(d => d.evidence),
        confidence: difficulties.reduce((sum, d) => sum + d.confidence, 0) / difficulties.length,
        reasoning: `${difficulties.length} fixes identified with ${timeEstimate} timeline`,
      });
    }

    return recommendations;
  }

  /**
   * Generate priority recommendations from commercial value
   */
  private generatePriorityRecommendations(
    commercialValues: CommercialValueImpact[],
    promptClusters: PromptCluster[]
  ): EnhancedRecommendation[] {
    const recommendations: EnhancedRecommendation[] = [];

    // Find highest commercial value opportunities
    const topOpportunities = commercialValues
      .map((value, idx) => ({ value, cluster: promptClusters[idx] }))
      .filter(item => item.cluster)
      .sort((a, b) => b.value.commercialOpportunityScore - a.value.commercialOpportunityScore)
      .slice(0, 3);

    for (const { value, cluster } of topOpportunities) {
      recommendations.push({
        id: `priority-${cluster.type}-${Date.now()}`,
        title: `Priority: ${cluster.title} (Commercial Score: ${value.commercialOpportunityScore}/100)`,
        description: `High commercial value opportunity with ${value.projectedVisibilityGain}% projected visibility gain`,
        category: 'positioning',
        priority: value.commercialOpportunityScore > 80 ? 'critical' : value.commercialOpportunityScore > 60 ? 'high' : 'medium',
        difficulty: cluster.difficulty > 70 ? 'hard' : cluster.difficulty > 40 ? 'medium' : 'easy',
        timeEstimate: cluster.difficulty > 70 ? '4-6 weeks' : '2-4 weeks',
        expectedImpact: {
          commercialValue: value.commercialOpportunityScore,
          visibilityGain: value.projectedVisibilityGain,
          geoScoreImprovement: Math.round(value.commercialOpportunityScore * 0.1),
          description: `This opportunity has commercial value of ${value.commercialOpportunityScore}/100 with ${value.projectedVisibilityGain}% visibility gain potential`,
        },
        steps: [
          `Focus on ${cluster.title} cluster`,
          `Target ${value.projectedRecommendationsGain} additional AI recommendations`,
          `Address cannibalization risk: ${value.cannibalizationRisk}/100`,
        ],
        relatedPromptClusters: [cluster.type],
        evidence: value.evidence,
        confidence: value.confidence,
        reasoning: `Commercial opportunity score: ${value.commercialOpportunityScore}/100. Cross-engine consensus multiplier: ${value.crossEngineConsensusMultiplier.toFixed(2)}`,
      });
    }

    return recommendations;
  }

  /**
   * Generate recommendations from GEO Score
   */
  private generateGEOScoreRecommendations(geoScore: any): EnhancedRecommendation[] {
    const recommendations: EnhancedRecommendation[] = [];

    if (geoScore.overall < 50) {
      recommendations.push({
        id: `geo-score-improvement-${Date.now()}`,
        title: 'Improve Overall GEO Score',
        description: `Current GEO Score is ${geoScore.overall}/100. Focus on improvement paths.`,
        category: 'positioning',
        priority: 'high',
        difficulty: 'medium',
        timeEstimate: '3-6 months',
        expectedImpact: {
          geoScoreImprovement: 20,
          description: 'Following improvement paths could increase GEO Score by 20+ points',
        },
        steps: [
          'Focus on top 5 improvement opportunities',
          'Address trust failures',
          'Build citation profile',
          'Improve content coverage',
        ],
        evidence: ['GEO Score analysis'],
        confidence: 0.8,
        reasoning: `Current score: ${geoScore.overall}/100. ${geoScore.improvementPaths?.length || 0} improvement paths identified.`,
      });
    }

    return recommendations;
  }

  /**
   * Prioritize recommendations
   */
  private prioritizeRecommendations(
    recommendations: EnhancedRecommendation[]
  ): EnhancedRecommendation[] {
    const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };

    return recommendations.sort((a, b) => {
      // First by priority
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;

      // Then by expected impact
      const impactA = a.expectedImpact.geoScoreImprovement || a.expectedImpact.visibilityGain || 0;
      const impactB = b.expectedImpact.geoScoreImprovement || b.expectedImpact.visibilityGain || 0;
      return impactB - impactA;
    });
  }

  /**
   * Map trust failure category to recommendation category
   */
  private mapTrustFailureToCategory(
    category: TrustFailure['category']
  ): EnhancedRecommendation['category'] {
    const mapping: Record<string, EnhancedRecommendation['category']> = {
      data_incompleteness: 'content',
      experience_deficiency: 'trust',
      missing_authority: 'citations',
      missing_trust_signals: 'trust',
      inconsistent_entity_data: 'technical',
      low_citation_density: 'citations',
      low_quality_reviews: 'trust',
      schema_mismatch: 'schema',
      brand_instability: 'positioning',
      conflicting_content: 'content',
      thin_content_coverage: 'content',
      low_semantic_relevance: 'content',
      high_competitor_dominance: 'competitor',
    };

    return mapping[category] || 'technical';
  }

  /**
   * Estimate time from severity
   */
  private estimateTimeFromSeverity(severity: number): string {
    if (severity > 80) return '3-6 months';
    if (severity > 60) return '2-3 months';
    if (severity > 40) return '1-2 months';
    return '2-4 weeks';
  }

  /**
   * Estimate time from difficulty
   */
  private estimateTimeFromDifficulty(difficulty: number): string {
    if (difficulty > 70) return '4-6 months';
    if (difficulty > 40) return '2-3 months';
    return '1-2 months';
  }
}


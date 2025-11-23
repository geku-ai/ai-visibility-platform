/**
 * Diagnostic Intelligence Service
 * Generates insights, recommendations, and reasoning for all GEO analysis modules
 */

import { Injectable, Logger } from '@nestjs/common';
import { LLMRouterService } from '@ai-visibility/shared';
import {
  DiagnosticInsight,
  DiagnosticRecommendation,
  EngineReasoning,
  VisibilityOpportunity,
  ThreatAssessment,
  CompetitiveThreat,
} from '../types/diagnostic.types';

@Injectable()
export class DiagnosticIntelligenceService {
  private readonly logger = new Logger(DiagnosticIntelligenceService.name);

  constructor(private readonly llmRouter: LLMRouterService) {}

  /**
   * Generate diagnostic insights from analysis data
   */
  async generateInsights(
    workspaceId: string,
    context: {
      category: string;
      data: any;
      competitors?: any[];
      engines?: string[];
    }
  ): Promise<DiagnosticInsight[]> {
    const insights: DiagnosticInsight[] = [];

    try {
      const prompt = `You are a GEO (Generative Engine Optimization) diagnostic analyst. Analyze the following data and generate diagnostic insights.

Context:
- Category: ${context.category}
- Engines: ${context.engines?.join(', ') || 'All'}

Data:
${JSON.stringify(context.data, null, 2)}

${context.competitors ? `Competitors: ${context.competitors.map(c => c.domain || c).join(', ')}` : ''}

Generate diagnostic insights following this structure:
1. Identify STRENGTHS (what's working well)
2. Identify WEAKNESSES (what's failing)
3. Identify RISKS (potential problems)
4. Identify OPPORTUNITIES (untapped potential)
5. Identify THREATS (competitive or technical threats)

For each insight, provide:
- type: "strength" | "weakness" | "risk" | "opportunity" | "threat"
- category: "visibility" | "trust" | "positioning" | "competition" | "technical" | "content"
- title: Short, actionable title
- description: What this means
- reasoning: Why this matters for AI engines
- impact: "high" | "medium" | "low"
- confidence: 0.0-1.0
- evidence: Array of evidence strings
- affectedEngines: Which engines this affects (optional)
- relatedCompetitors: Which competitors are involved (optional)

IMPORTANT: Return ONLY a valid JSON array. Do not include any explanatory text, markdown formatting, or code blocks. Start your response directly with [ and end with ].`;

      const response = await this.llmRouter.routeLLMRequest(workspaceId, prompt, {
        temperature: 0.3,
        maxTokens: 2000,
      });

      const text = (response.content || response.text || '').trim();
      const jsonText = this.extractJSON(text);
      const parsed = JSON.parse(jsonText) as DiagnosticInsight[];

      insights.push(...parsed);
    } catch (error) {
      this.logger.warn(`Failed to generate LLM insights: ${error instanceof Error ? error.message : String(error)}`);
      // Fallback to rule-based insights
      insights.push(...this.generateFallbackInsights(context));
    }

    return insights;
  }

  /**
   * Generate actionable recommendations
   */
  async generateRecommendations(
    workspaceId: string,
    insights: DiagnosticInsight[],
    context: {
      category: string;
      currentScore?: number;
      maxScore?: number;
    }
  ): Promise<DiagnosticRecommendation[]> {
    const recommendations: DiagnosticRecommendation[] = [];

    try {
      const prompt = `You are a GEO optimization consultant. Based on these diagnostic insights, generate actionable recommendations.

Category: ${context.category}
Current Score: ${context.currentScore || 0}/${context.maxScore || 100}

Insights:
${JSON.stringify(insights, null, 2)}

For each recommendation, provide:
- id: Unique identifier
- title: Action title
- description: What to do
- category: "schema" | "content" | "citations" | "trust" | "positioning" | "technical"
- priority: "high" | "medium" | "low"
- difficulty: "easy" | "medium" | "hard"
- expectedImpact: {
    scoreImprovement: Number of GEO score points (optional)
    visibilityGain: Percentage (optional)
    trustGain: Percentage (optional)
    description: Human-readable impact description
  }
- steps: Array of actionable steps
- relatedInsights: Array of insight IDs
- estimatedTime: e.g., "2 hours", "1 week"
- evidence: Array of evidence strings

Prioritize recommendations that:
1. Have highest impact on GEO score
2. Are easiest to implement
3. Address critical weaknesses or risks
4. Have clear evidence

IMPORTANT: Return ONLY a valid JSON array. Do not include any explanatory text, markdown formatting, or code blocks. Start your response directly with [ and end with ].`;

      const response = await this.llmRouter.routeLLMRequest(workspaceId, prompt, {
        temperature: 0.3,
        maxTokens: 2000,
      });

      const text = (response.content || response.text || '').trim();
      const jsonText = this.extractJSON(text);
      const parsed = JSON.parse(jsonText) as DiagnosticRecommendation[];

      recommendations.push(...parsed);
    } catch (error) {
      this.logger.warn(`Failed to generate LLM recommendations: ${error instanceof Error ? error.message : String(error)}`);
      // Fallback to rule-based recommendations
      recommendations.push(...this.generateFallbackRecommendations(insights, context));
    }

    return recommendations;
  }

  /**
   * Generate engine-specific reasoning
   */
  async generateEngineReasoning(
    workspaceId: string,
    engine: string,
    context: {
      businessSummary: string;
      visibility: boolean;
      competitors?: any[];
      citations?: any[];
    }
  ): Promise<EngineReasoning> {
    try {
      const prompt = `You are analyzing how the ${engine} AI engine interprets this business.

Business Summary: ${context.businessSummary}
Visibility: ${context.visibility ? 'Visible' : 'Not visible'}
${context.competitors ? `Competitors: ${context.competitors.map(c => c.domain || c).join(', ')}` : ''}
${context.citations ? `Citations: ${context.citations.length} found` : ''}

Generate engine reasoning:
- interpretation: How ${engine} likely views this business
- keySignals: Array of signals that influenced ${engine}'s view
- missingSignals: Array of signals that would improve visibility
- trustFactors: Array of trust signals ${engine} values
- visibilityExplanation: Why visibility succeeded or failed
- competitorPreference: If a competitor is preferred, explain why (optional)

IMPORTANT: Return ONLY a valid JSON object. Do not include any explanatory text, markdown formatting, or code blocks. Start your response directly with { and end with }.`;

      const response = await this.llmRouter.routeLLMRequest(workspaceId, prompt, {
        temperature: 0.3,
        maxTokens: 1000,
      });

      const text = (response.content || response.text || '').trim();
      const jsonText = this.extractJSON(text);
      const parsed = JSON.parse(jsonText) as EngineReasoning;

      return {
        engine,
        ...parsed,
      };
    } catch (error) {
      this.logger.warn(`Failed to generate engine reasoning for ${engine}: ${error instanceof Error ? error.message : String(error)}`);
      return this.generateFallbackEngineReasoning(engine, context);
    }
  }

  /**
   * Generate threat assessments
   */
  async generateThreatAssessments(
    workspaceId: string,
    context: {
      competitors: any[];
      visibility: any;
      prompts: any[];
      citations: any[];
    }
  ): Promise<ThreatAssessment[]> {
    const threats: ThreatAssessment[] = [];

    // Rule-based threat detection
    if (context.competitors && context.competitors.length > 0) {
      const highVisibilityCompetitors = context.competitors.filter((c: any) => 
        c.visibility?.overallVisibility > 50
      );
      
      if (highVisibilityCompetitors.length > 0) {
        threats.push({
          type: 'competitor_substitution',
          severity: 'high',
          description: `${highVisibilityCompetitors.length} competitor(s) have higher visibility`,
          affectedAreas: ['high-value prompts', 'trust signals'],
          evidence: highVisibilityCompetitors.map((c: any) => 
            `${c.brandName || c.domain}: ${c.visibility?.overallVisibility}% visibility`
          ),
          mitigation: [
            'Improve schema markup',
            'Increase citation quality',
            'Optimize for high-value prompts',
          ],
          relatedCompetitors: highVisibilityCompetitors.map((c: any) => c.domain || c.brandName),
        });
      }
    }

    if (context.citations && context.citations.length < 10) {
      threats.push({
        type: 'trust_degradation',
        severity: 'medium',
        description: 'Low citation count may reduce trust signals',
        affectedAreas: ['EEAT score', 'engine trust'],
        evidence: [`Only ${context.citations.length} citations found`],
        mitigation: [
          'Build relationships with licensed publishers',
          'Create shareable content',
          'Improve directory listings',
        ],
      });
    }

    return threats;
  }

  /**
   * Generate competitive threats
   */
  async generateCompetitiveThreats(
    workspaceId: string,
    competitors: any[],
    ownVisibility: number
  ): Promise<CompetitiveThreat[]> {
    const threats: CompetitiveThreat[] = [];

    for (const competitor of competitors) {
      const compVisibility = competitor.visibility?.overallVisibility || 0;
      const gap = compVisibility - ownVisibility;

      if (gap > 10) {
        threats.push({
          competitor: competitor.brandName || competitor.domain,
          threatLevel: gap > 30 ? 'high' : gap > 20 ? 'medium' : 'low',
          threatAreas: this.identifyThreatAreas(competitor),
          dominanceReason: this.explainDominance(competitor),
          visibilityGap: {
            current: ownVisibility,
            competitor: compVisibility,
            gap,
          },
          recommendedActions: this.generateCompetitorActions(competitor, gap),
        });
      }
    }

    return threats;
  }

  // Helper methods
  private generateFallbackInsights(context: any): DiagnosticInsight[] {
    const insights: DiagnosticInsight[] = [];

    // Rule-based fallback insights
    if (context.data?.confidence && context.data.confidence < 0.7) {
      insights.push({
        type: 'weakness',
        category: 'trust',
        title: 'Low Confidence Signals',
        description: 'Analysis confidence is below optimal threshold',
        reasoning: 'Low confidence may indicate missing data or unclear positioning',
        impact: 'medium',
        confidence: 0.8,
        evidence: [`Confidence: ${(context.data.confidence * 100).toFixed(0)}%`],
      });
    }

    return insights;
  }

  private generateFallbackRecommendations(
    insights: DiagnosticInsight[],
    context: any
  ): DiagnosticRecommendation[] {
    const recommendations: DiagnosticRecommendation[] = [];

    const weaknesses = insights.filter(i => i.type === 'weakness');
    for (const weakness of weaknesses) {
      recommendations.push({
        id: `rec-${weakness.category}-${Date.now()}`,
        title: `Address ${weakness.title}`,
        description: weakness.description,
        category: this.mapCategoryToRecommendation(weakness.category),
        priority: weakness.impact === 'high' ? 'high' : weakness.impact === 'medium' ? 'medium' : 'low',
        difficulty: 'medium',
        expectedImpact: {
          description: `Expected to improve ${weakness.category} metrics`,
        },
        steps: [`Review ${weakness.category} signals`, 'Implement improvements', 'Monitor results'],
        relatedInsights: [],
        evidence: weakness.evidence,
      });
    }

    return recommendations;
  }

  private generateFallbackEngineReasoning(
    engine: string,
    context: any
  ): EngineReasoning {
    return {
      engine,
      interpretation: `${engine} interprets this business based on available signals`,
      keySignals: context.citations ? ['Citations found'] : [],
      missingSignals: context.visibility ? [] : ['Clear positioning', 'Trust signals'],
      trustFactors: [],
      visibilityExplanation: context.visibility 
        ? 'Visibility achieved through available signals'
        : 'Visibility limited by missing signals',
    };
  }

  private identifyThreatAreas(competitor: any): string[] {
    const areas: string[] = [];
    if (competitor.visibility?.perEngine?.some((e: any) => e.visible)) {
      areas.push('high-value prompts');
    }
    if (competitor.evidence?.citationCount > 10) {
      areas.push('trust signals');
    }
    return areas;
  }

  private explainDominance(competitor: any): string {
    const reasons: string[] = [];
    if (competitor.evidence?.citationCount > 10) {
      reasons.push('strong citation profile');
    }
    if (competitor.visibility?.overallVisibility > 50) {
      reasons.push('high visibility across engines');
    }
    return reasons.join(', ') || 'competitive positioning';
  }

  private generateCompetitorActions(competitor: any, gap: number): string[] {
    return [
      `Analyze ${competitor.brandName || competitor.domain}'s citation strategy`,
      'Improve own citation quality and quantity',
      gap > 30 ? 'Prioritize high-value prompt optimization' : 'Focus on trust signal improvement',
    ];
  }

  private mapCategoryToRecommendation(category: string): DiagnosticRecommendation['category'] {
    const mapping: Record<string, DiagnosticRecommendation['category']> = {
      'technical': 'technical',
      'trust': 'trust',
      'positioning': 'positioning',
      'content': 'content',
      'visibility': 'citations',
      'competition': 'positioning',
    };
    return mapping[category] || 'technical';
  }

  /**
   * Extract JSON from text response, handling cases where JSON is embedded in explanatory text
   */
  private extractJSON(text: string): string {
    // First, try to remove markdown code blocks
    let cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/g, '').trim();
    
    // Try to parse directly first
    try {
      JSON.parse(cleaned);
      return cleaned;
    } catch {
      // If that fails, try to find JSON array or object in the text
      // Look for first [ or { and last matching ] or }
      const arrayStart = cleaned.indexOf('[');
      const objectStart = cleaned.indexOf('{');
      
      let startIndex = -1;
      let isArray = false;
      
      if (arrayStart !== -1 && (objectStart === -1 || arrayStart < objectStart)) {
        startIndex = arrayStart;
        isArray = true;
      } else if (objectStart !== -1) {
        startIndex = objectStart;
        isArray = false;
      }
      
      if (startIndex !== -1) {
        // Find the matching closing bracket/brace
        let depth = 0;
        let inString = false;
        let escapeNext = false;
        let endIndex = -1;
        
        for (let i = startIndex; i < cleaned.length; i++) {
          const char = cleaned[i];
          
          if (escapeNext) {
            escapeNext = false;
            continue;
          }
          
          if (char === '\\') {
            escapeNext = true;
            continue;
          }
          
          if (char === '"' && !escapeNext) {
            inString = !inString;
            continue;
          }
          
          if (inString) {
            continue;
          }
          
          if (char === (isArray ? '[' : '{')) {
            depth++;
          } else if (char === (isArray ? ']' : '}')) {
            depth--;
            if (depth === 0) {
              endIndex = i;
              break;
            }
          }
        }
        
        if (endIndex !== -1) {
          const jsonText = cleaned.substring(startIndex, endIndex + 1);
          try {
            JSON.parse(jsonText);
            return jsonText;
          } catch {
            // Fall through to error
          }
        }
      }
      
      // If we still can't find valid JSON, throw an error
      throw new Error(`Could not extract valid JSON from response. Response starts with: ${cleaned.substring(0, 100)}...`);
    }
  }
}


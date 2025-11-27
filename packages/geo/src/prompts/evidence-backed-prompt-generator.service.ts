import { Injectable, Logger } from '@nestjs/common';
import { LLMRouterService } from '@ai-visibility/shared';
import { IndustryDetectorService, IndustryContext } from '../industry/industry-detector.service';
import { EvidenceCollectorService, PromptEvidence } from '../evidence/evidence-collector.service';
import { DiagnosticIntelligenceService } from '../diagnostics/diagnostic-intelligence.service';
import {
  VisibilityOpportunity,
  DiagnosticInsight,
  DiagnosticRecommendation,
} from '../types/diagnostic.types';

export interface EvidenceBackedPrompt {
  text: string;
  intent: 'BEST' | 'ALTERNATIVES' | 'HOWTO' | 'PRICING' | 'COMPARISON' | 'LOCAL' | 'REVIEWS';
  industryRelevance: number; // 0-1
  commercialIntent: number; // 0-1
  evidence?: {
    hasBeenTested: boolean;
    visibilityScore?: number; // 0-100, if tested
    competitorsFound?: string[];
    confidence: number;
  };
  reasoning: string;
}

export interface PromptGenerationContext {
  industry: string;
  category: string;
  vertical: string;
  brandName: string;
  services: string[];
  geography?: {
    primary: string;
    serviceAreas?: string[];
  };
  marketType: 'B2B' | 'B2C' | 'B2B2C' | 'Marketplace';
  serviceType: 'Product' | 'Service' | 'Platform' | 'Hybrid';
}

@Injectable()
export class EvidenceBackedPromptGeneratorService {
  private readonly logger = new Logger(EvidenceBackedPromptGeneratorService.name);

  constructor(
    private readonly llmRouter: LLMRouterService,
    private readonly industryDetector: IndustryDetectorService,
    private readonly evidenceCollector: EvidenceCollectorService,
    private readonly diagnosticIntelligence: DiagnosticIntelligenceService,
  ) {}

  /**
   * Generate industry-specific, evidence-backed buyer prompts
   */
  async generateEvidenceBackedPrompts(
    workspaceId: string,
    context: PromptGenerationContext,
    testPrompts: boolean = false // If true, test prompts and collect evidence
  ): Promise<EvidenceBackedPrompt[]> {
    const prompts: EvidenceBackedPrompt[] = [];

    // Generate prompts for each intent category
    const intents: Array<'BEST' | 'ALTERNATIVES' | 'HOWTO' | 'PRICING' | 'COMPARISON' | 'LOCAL' | 'REVIEWS'> = [
      'BEST',
      'ALTERNATIVES',
      'COMPARISON',
      'PRICING',
      'HOWTO',
      'LOCAL',
      'REVIEWS',
    ];

    for (const intent of intents) {
      const intentPrompts = await this.generatePromptsForIntent(workspaceId, intent, context);
      prompts.push(...intentPrompts);
    }

    // If testing is enabled, collect evidence for each prompt
    if (testPrompts) {
      for (const prompt of prompts) {
        try {
          const evidence = await this.evidenceCollector.collectPromptEvidence(workspaceId, prompt.text);
          if (evidence.length > 0) {
            // Calculate visibility score based on evidence
            const enginesTested = new Set(evidence.map(e => e.engine));
            const visibilityScore = (enginesTested.size / 3) * 100; // 3 engines: Perplexity, AIO, Brave

            prompt.evidence = {
              hasBeenTested: true,
              visibilityScore,
              competitorsFound: [...new Set(evidence.flatMap(e => e.brandsFound))],
              confidence: evidence.reduce((sum, e) => sum + e.confidence, 0) / evidence.length,
            };
          }
        } catch (error) {
          this.logger.warn(`Failed to collect evidence for prompt "${prompt.text}": ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    return prompts;
  }

  /**
   * Generate prompts for a specific intent
   */
  private async generatePromptsForIntent(
    workspaceId: string,
    intent: 'BEST' | 'ALTERNATIVES' | 'HOWTO' | 'PRICING' | 'COMPARISON' | 'LOCAL' | 'REVIEWS',
    context: PromptGenerationContext
  ): Promise<EvidenceBackedPrompt[]> {
    const promptTemplates = this.getIntentTemplates(intent, context);
    const generatedPrompts: EvidenceBackedPrompt[] = [];

    // Use LLM to generate industry-specific variations
    const generationPrompt = `You are an expert at understanding buyer search intent in the ${context.industry} industry.

Context:
- Industry: ${context.industry}
- Category: ${context.category}
- Vertical: ${context.vertical}
- Market Type: ${context.marketType}
- Service Type: ${context.serviceType}
- Brand: ${context.brandName} (for reference only - focus on industry)
- Services: ${context.services.join(', ')}
${context.geography ? `- Geography: ${context.geography.primary}` : ''}

Intent Category: ${this.getIntentDescription(intent)}

Generate 2-3 REAL buyer search queries that:
1. Are specific to the ${context.industry} industry
2. Reflect actual buyer intent for this intent category
3. Would trigger comprehensive AI search results
4. Enable competitive benchmarking
5. Are natural and how real users would search

${intent === 'LOCAL' && context.geography ? `Include location: ${context.geography.primary}` : ''}
${intent === 'PRICING' ? 'Focus on pricing, costs, value comparison' : ''}
${intent === 'COMPARISON' ? 'Focus on comparing multiple options' : ''}
${intent === 'ALTERNATIVES' ? 'Focus on finding alternatives' : ''}
${intent === 'BEST' ? 'Focus on finding the best options' : ''}
${intent === 'HOWTO' ? 'Focus on how-to guides and tutorials' : ''}
${intent === 'REVIEWS' ? 'Focus on reviews and ratings' : ''}

Return JSON array:
[
  {
    "text": "query text",
    "reasoning": "why this query is relevant for this industry and intent",
    "commercialIntent": 0.0-1.0,
    "industryRelevance": 0.0-1.0
  }
]`;

    try {
      const response = await this.llmRouter.routeLLMRequest(workspaceId, generationPrompt, {
        temperature: 0.4,
        maxTokens: 600,
      });

      const text = (response.content || response.text || '').trim();
      const cleaned = text.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
      const parsed = JSON.parse(cleaned) as Array<{
        text: string;
        reasoning: string;
        commercialIntent: number;
        industryRelevance: number;
      }>;

      for (const item of parsed) {
        generatedPrompts.push({
          text: item.text,
          intent,
          industryRelevance: item.industryRelevance || 0.8,
          commercialIntent: item.commercialIntent || 0.7,
          reasoning: item.reasoning || `Generated for ${intent} intent in ${context.industry} industry`,
        });
      }
    } catch (error) {
      this.logger.warn(`LLM prompt generation failed for ${intent}, using templates: ${error instanceof Error ? error.message : String(error)}`);
      
      // Fallback to templates
      for (const template of promptTemplates) {
        generatedPrompts.push({
          text: template,
          intent,
          industryRelevance: 0.7,
          commercialIntent: 0.6,
          reasoning: `Template-based prompt for ${intent} intent`,
        });
      }
    }

    return generatedPrompts;
  }

  /**
   * Get intent description
   */
  private getIntentDescription(intent: string): string {
    const descriptions: Record<string, string> = {
      BEST: 'Queries seeking the best options or recommendations',
      ALTERNATIVES: 'Queries looking for alternatives or substitutes',
      HOWTO: 'Queries asking how to do something or use a product',
      PRICING: 'Queries about pricing, costs, or value',
      COMPARISON: 'Queries comparing multiple options (X vs Y)',
      LOCAL: 'Location-based queries (near me, in [city])',
      REVIEWS: 'Queries about reviews, ratings, or opinions',
    };
    return descriptions[intent] || 'General queries';
  }

  /**
   * Get intent templates (fallback)
   */
  private getIntentTemplates(
    intent: 'BEST' | 'ALTERNATIVES' | 'HOWTO' | 'PRICING' | 'COMPARISON' | 'LOCAL' | 'REVIEWS',
    context: PromptGenerationContext
  ): string[] {
    const industry = context.industry;
    const category = context.category;
    const location = context.geography?.primary;

    const templates: Record<string, string[]> = {
      BEST: [
        `Best ${industry} solutions`,
        `Top ${category} platforms`,
        `Best ${industry} options`,
      ],
      ALTERNATIVES: [
        `Best ${industry} alternatives`,
        `Top ${category} alternatives`,
        `Similar ${industry} platforms`,
      ],
      HOWTO: [
        `How to choose ${industry} platform`,
        `How does ${category} work`,
        `${industry} selection guide`,
      ],
      PRICING: [
        `${industry} pricing comparison`,
        `How much do ${category} services cost`,
        `${industry} platform costs`,
      ],
      COMPARISON: [
        `Compare ${industry} platforms`,
        `${category} services comparison`,
        `Best ${industry} vs alternatives`,
      ],
      LOCAL: location ? [
        `Best ${industry} in ${location}`,
        `Top ${category} services ${location}`,
        `${industry} platforms near me`,
      ] : [
        `Best ${industry} near me`,
        `Top ${category} local services`,
      ],
      REVIEWS: [
        `Best ${industry} reviews`,
        `${category} platform ratings`,
        `Top rated ${industry} solutions`,
      ],
    };

    return templates[intent] || templates.BEST;
  }

  /**
   * Generate visibility opportunities from prompts
   */
  async generatePromptOpportunities(
    workspaceId: string,
    prompts: EvidenceBackedPrompt[],
    competitors?: any[]
  ): Promise<VisibilityOpportunity[]> {
    const opportunities: VisibilityOpportunity[] = [];

    for (const prompt of prompts) {
      const visibilityScore = prompt.evidence?.visibilityScore || 0;
      const currentVisibility = visibilityScore / 100; // Normalize to 0-1
      const opportunityGap = 1 - currentVisibility;

      // Calculate competitor control
      const competitorCount = prompt.evidence?.competitorsFound?.length || 0;
      const competitorControl = Math.min(1, competitorCount / 5); // Normalize by max 5 competitors

      // Calculate commercial value (weighted by commercial intent and industry relevance)
      const commercialValue = (prompt.commercialIntent * 0.6 + prompt.industryRelevance * 0.4);

      // Note: This method creates a different structure than VisibilityOpportunity
      // It's used for prompt-level diagnostics, not the full opportunity structure
      opportunities.push({
        title: prompt.text, // Use title instead of prompt
        aiVisibility: {
          chatgpt: currentVisibility * 100,
          claude: currentVisibility * 100,
          gemini: currentVisibility * 100,
          perplexity: currentVisibility * 100,
          weighted: currentVisibility * 100,
        },
        competitors: [],
        whyYouAreLosing: `Low visibility (${(currentVisibility * 100).toFixed(0)}%) on high-value prompt`,
        opportunityImpact: opportunityGap * 100,
        difficulty: 50,
        value: commercialValue * 100,
        actionSteps: [this.generatePromptAction(prompt, currentVisibility, competitorControl)],
        evidence: {
          chatgpt: [],
          claude: [],
          gemini: [],
          perplexity: [],
        },
        confidence: prompt.evidence?.confidence || 0.7,
        warnings: [],
        geoScoreImpact: { min: 0, max: 0 },
      } as VisibilityOpportunity);
    }

    // Sort by opportunity (commercial value * opportunity gap)
    return opportunities.sort((a, b) => {
      const scoreA = a.commercialValue * a.opportunityGap;
      const scoreB = b.commercialValue * b.opportunityGap;
      return scoreB - scoreA;
    });
  }

  /**
   * Generate diagnostic insights for prompts
   */
  async generatePromptDiagnostics(
    workspaceId: string,
    prompts: EvidenceBackedPrompt[],
    opportunities: VisibilityOpportunity[]
  ): Promise<{
    insights: DiagnosticInsight[];
    recommendations: DiagnosticRecommendation[];
  }> {
    const insights: DiagnosticInsight[] = [];

    // Analyze prompt performance using VisibilityOpportunity structure
    const highValuePrompts = opportunities.filter(o => o.value > 70);
    const lowVisibilityPrompts = opportunities.filter(o => o.aiVisibility.weighted < 30);
    const competitorControlled = opportunities.filter(o => o.competitors.length > 3);

    // High-value, low-visibility = opportunity
    const missedOpportunities = opportunities.filter(
      o => o.value > 70 && o.aiVisibility.weighted < 30
    );

    if (missedOpportunities.length > 0) {
      insights.push({
        type: 'opportunity',
        category: 'visibility',
        title: 'High-Value Prompt Opportunities',
        description: `${missedOpportunities.length} high-value prompts have low visibility`,
        reasoning: 'These prompts have strong commercial intent but low current visibility, representing significant opportunity',
        impact: 'high',
        confidence: 0.9,
        evidence: missedOpportunities.map(o => `${o.title}: ${(100 - o.aiVisibility.weighted).toFixed(0)}% gap`),
      });
    }

    // Competitor-controlled prompts = threat
    if (competitorControlled.length > 0) {
      insights.push({
        type: 'threat',
        category: 'competition',
        title: 'Competitor-Controlled Prompts',
        description: `${competitorControlled.length} prompts are dominated by competitors`,
        reasoning: 'Competitors are winning visibility on these prompts, reducing your share of voice',
        impact: 'high',
        confidence: 0.8,
        evidence: competitorControlled.map(o => `${o.title}: ${o.competitors.length} competitors`),
      });
    }

    // Low visibility across all prompts = weakness
    const avgVisibility = opportunities.reduce((sum, o) => sum + o.aiVisibility.weighted, 0) / opportunities.length / 100;
    if (avgVisibility < 0.3) {
      insights.push({
        type: 'weakness',
        category: 'visibility',
        title: 'Low Overall Prompt Visibility',
        description: `Average visibility is ${(avgVisibility * 100).toFixed(0)}% across all prompts`,
        reasoning: 'Low visibility across prompts indicates systemic issues with positioning, citations, or trust signals',
        impact: 'high',
        confidence: 0.9,
        evidence: [`Average visibility: ${(avgVisibility * 100).toFixed(0)}%`, `${lowVisibilityPrompts.length} prompts below 30% visibility`],
      });
    }

    // Generate recommendations
    const recommendations = await this.diagnosticIntelligence.generateRecommendations(workspaceId, insights, {
      category: 'prompts',
    });

    // Add prompt-specific recommendations
    if (missedOpportunities.length > 0) {
      recommendations.push({
        id: `prompt-opportunity-${Date.now()}`,
        title: 'Optimize High-Value, Low-Visibility Prompts',
        description: `Focus on improving visibility for ${missedOpportunities.length} high-value prompts`,
        category: 'content',
        priority: 'high',
        difficulty: 'medium',
        expectedImpact: {
          visibilityGain: Math.round(missedOpportunities.reduce((sum, o) => sum + (100 - o.aiVisibility.weighted), 0) / missedOpportunities.length),
          description: `Expected ${Math.round(missedOpportunities.reduce((sum, o) => sum + (100 - o.aiVisibility.weighted), 0) / missedOpportunities.length)}% visibility gain`,
        },
        steps: [
          'Identify content gaps for high-value prompts',
          'Create targeted content addressing these prompts',
          'Build citations from authoritative sources',
          'Optimize schema markup for prompt intent',
        ],
        relatedInsights: insights.filter(i => i.type === 'opportunity').map((_, idx) => `insight-${idx}`),
        estimatedTime: '2-4 weeks',
        evidence: missedOpportunities.map(o => o.title),
      });
    }

    return { insights, recommendations };
  }

  private generatePromptAction(
    prompt: EvidenceBackedPrompt,
    currentVisibility: number,
    competitorControl: number
  ): string {
    if (currentVisibility < 0.3) {
      return `Improve visibility for "${prompt.text}" - currently below 30%`;
    }
    if (competitorControl > 0.6) {
      return `Compete for "${prompt.text}" - competitors dominate`;
    }
    return `Maintain visibility for "${prompt.text}"`;
  }

  private calculateExpectedImpact(
    prompt: EvidenceBackedPrompt,
    opportunityGap: number
  ): string {
    const potentialGain = opportunityGap * 100;
    if (potentialGain > 50) {
      return `High impact: ${potentialGain.toFixed(0)}% visibility gain possible`;
    }
    if (potentialGain > 25) {
      return `Medium impact: ${potentialGain.toFixed(0)}% visibility gain possible`;
    }
    return `Low impact: ${potentialGain.toFixed(0)}% visibility gain possible`;
  }
}


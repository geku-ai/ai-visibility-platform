/**
 * Cost Estimator Service
 * 
 * Estimates variable costs for GEO Copilot intelligence pipeline scenarios.
 * Uses configuration-based pricing (no live API calls to providers).
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  ScenarioKey,
  ScenarioCostEstimate,
  ProviderCostBreakdown,
  CostEstimationOptions,
  CopilotAutomationParams,
  ProviderKey,
  ProviderPricingConfig,
  StepCostAssumption,
} from './cost.types';
import {
  DEFAULT_PROVIDER_PRICING,
  DEFAULT_STEP_COSTS,
  getProviderPricing,
  getStepCostAssumption,
  getStepsForScenario,
} from './cost.config';

@Injectable()
export class CostEstimatorService {
  private readonly logger = new Logger(CostEstimatorService.name);

  /**
   * Estimate cost for a specific scenario
   */
  async estimateScenarioCost(
    scenario: ScenarioKey,
    options: CostEstimationOptions = {}
  ): Promise<ScenarioCostEstimate> {
    this.logger.log(`Estimating cost for scenario: ${scenario}`);

    const assumptions: string[] = [];
    let totalUsd = 0;
    const providerCosts = new Map<ProviderKey, ProviderCostBreakdown>();
    let totalLLMCalls = 0;
    let totalSearchCalls = 0;
    let totalTokens = 0;

    // Get steps for this scenario
    let steps: StepCostAssumption[] = [];
    if (scenario === 'instant-summary-v2') {
      steps = getStepsForScenario('instant-summary-v2');
      assumptions.push('Using lightweight 5-step pipeline');
      assumptions.push('Limited to ~10 prompts for performance');
    } else if (scenario === 'geo-intelligence-full') {
      steps = getStepsForScenario('geo-intelligence-full');
      assumptions.push('Using full 15-step pipeline');
      assumptions.push('Generates 20-50 prompts');
      assumptions.push('Analyzes 3-10 competitors');
    } else if (scenario === 'opportunities-only') {
      steps = [getStepCostAssumption('visibility-opportunities')!].filter(Boolean);
      assumptions.push('Assumes full intelligence already cached');
      assumptions.push('Only generating opportunities from existing data');
      if (options.assumeCached) {
        assumptions.push('Using cached prompt runs (no new search API calls)');
      }
    } else if (scenario === 'recommendations-only') {
      steps = [getStepCostAssumption('recommendations')!].filter(Boolean);
      assumptions.push('Assumes full intelligence already cached');
      assumptions.push('Only generating recommendations');
      assumptions.push('Using cached prompt runs (no new search API calls)');
    } else if (scenario.startsWith('copilot-weekly-')) {
      return this.estimateCopilotWeeklyCost(scenario, options);
    } else if (scenario === 'content-generation') {
      steps = [getStepCostAssumption('content-generation')!].filter(Boolean);
      assumptions.push('Single content item generation');
    }

    // Process each step
    for (const step of steps) {
      if (!step) continue;

      const stepAssumptions = this.processStepCost(
        step,
        options,
        providerCosts,
        assumptions
      );

      // Accumulate totals
      if (step.providers.some(p => this.isLLMProvider(p))) {
        const calls = this.getEstimatedCalls(step.estimatedCalls, options);
        totalLLMCalls += calls;
        const tokens = this.getEstimatedTokens(step.estimatedTokensPerCall, calls);
        totalTokens += tokens;
      }

      if (step.providers.some(p => this.isSearchProvider(p))) {
        const calls = this.getEstimatedCalls(step.estimatedCalls, options);
        if (!options.assumeCached || step.stepKey !== 'sov-analysis') {
          totalSearchCalls += calls;
        }
      }
    }

    // Calculate total cost from provider breakdowns
    for (const breakdown of providerCosts.values()) {
      totalUsd += breakdown.estimatedUsd;
    }

    // Apply pricing overrides if provided
    if (options.pricingOverrides) {
      for (const [provider, overridePrice] of Object.entries(options.pricingOverrides)) {
        const breakdown = providerCosts.get(provider as ProviderKey);
        if (breakdown) {
          const originalCost = breakdown.estimatedUsd;
          const pricing = getProviderPricing(provider as ProviderKey);
          if (pricing) {
            if (pricing.unit.unit === 'per-1k-tokens') {
              breakdown.estimatedUsd = (breakdown.estimatedTokens / 1000) * overridePrice;
            } else {
              breakdown.estimatedUsd = breakdown.estimatedRequests * overridePrice;
            }
            totalUsd = totalUsd - originalCost + breakdown.estimatedUsd;
            assumptions.push(`Applied pricing override for ${provider}: $${overridePrice}`);
          }
        }
      }
    }

    // Calculate confidence (lower if many assumptions, higher if specific)
    let confidence = 0.7; // Base confidence
    if (options.promptCount && options.competitorCount) {
      confidence = 0.85; // Higher confidence with specific counts
    }
    if (assumptions.length > 10) {
      confidence -= 0.1; // Lower confidence with many assumptions
    }
    confidence = Math.max(0.3, Math.min(1, confidence));

    return {
      scenario,
      totalUsd: Math.round(totalUsd * 10000) / 10000, // Round to 4 decimal places
      perProvider: Array.from(providerCosts.values()),
      assumptions,
      confidence,
      estimatedLLMCalls: totalLLMCalls,
      estimatedSearchCalls: totalSearchCalls,
      estimatedTotalTokens: totalTokens,
      metadata: {
        industry: options.industry,
        promptCount: options.promptCount,
        competitorCount: options.competitorCount,
        opportunityCount: options.opportunityCount,
        generatedAt: new Date(),
      },
    };
  }

  /**
   * Estimate cost for Instant Summary V2
   */
  async estimateInstantSummaryCost(domain: string): Promise<ScenarioCostEstimate> {
    return this.estimateScenarioCost('instant-summary-v2', {
      promptCount: 10, // Limited for performance
      assumeCached: false,
    });
  }

  /**
   * Estimate cost for Full Intelligence run
   */
  async estimateFullIntelligenceCost(
    workspaceId: string,
    options: CostEstimationOptions = {}
  ): Promise<ScenarioCostEstimate> {
    return this.estimateScenarioCost('geo-intelligence-full', {
      ...options,
      assumeCached: false,
    });
  }

  /**
   * Estimate monthly cost for Copilot automation
   */
  async estimateCopilotMonthlyCost(
    params: CopilotAutomationParams
  ): Promise<ScenarioCostEstimate> {
    const {
      automationLevel,
      pagesOptimizedPerWeek,
      reviewResponsesPerWeek,
      intelligenceRunsPerWeek = this.getIntelligenceRunsPerWeek(automationLevel),
    } = params;

    // Calculate weekly cost
    const weeklyCost = await this.estimateCopilotWeeklyCost(
      `copilot-weekly-${automationLevel}` as ScenarioKey,
      {
        pagesOptimizedPerWeek,
        reviewResponsesPerWeek,
        intelligenceRunsPerWeek,
      }
    );

    // Multiply by 4.33 (average weeks per month)
    const monthlyMultiplier = 4.33;
    const monthlyCost: ScenarioCostEstimate = {
      ...weeklyCost,
      scenario: `copilot-monthly-${automationLevel}` as ScenarioKey,
      totalUsd: weeklyCost.totalUsd * monthlyMultiplier,
      perProvider: weeklyCost.perProvider.map(p => ({
        ...p,
        estimatedRequests: p.estimatedRequests * monthlyMultiplier,
        estimatedTokens: p.estimatedTokens * monthlyMultiplier,
        estimatedUsd: p.estimatedUsd * monthlyMultiplier,
      })),
      assumptions: [
        ...weeklyCost.assumptions,
        `Monthly estimate based on ${monthlyMultiplier} weeks per month`,
      ],
      metadata: {
        ...weeklyCost.metadata,
        generatedAt: new Date(),
      },
    };

    return monthlyCost;
  }

  /**
   * Estimate weekly cost for Copilot automation
   */
  private async estimateCopilotWeeklyCost(
    scenario: ScenarioKey,
    options: CostEstimationOptions & {
      pagesOptimizedPerWeek?: number;
      reviewResponsesPerWeek?: number;
      intelligenceRunsPerWeek?: number;
    }
  ): Promise<ScenarioCostEstimate> {
    const assumptions: string[] = [];
    const providerCosts = new Map<ProviderKey, ProviderCostBreakdown>();

    const intelligenceRuns = options.intelligenceRunsPerWeek || 1;
    const pagesOptimized = options.pagesOptimizedPerWeek || 0;
    const reviewResponses = options.reviewResponsesPerWeek || 0;

    assumptions.push(`${intelligenceRuns} full intelligence run(s) per week`);
    assumptions.push(`${pagesOptimized} pages optimized per week`);
    assumptions.push(`${reviewResponses} review responses per week`);

    // Full intelligence runs
    for (let i = 0; i < intelligenceRuns; i++) {
      const fullIntelligence = await this.estimateScenarioCost('geo-intelligence-full', {
        ...options,
        assumeCached: i > 0, // Cache after first run
      });
      this.mergeProviderCosts(providerCosts, fullIntelligence.perProvider);
    }

    // Content generation (pages optimized)
    if (pagesOptimized > 0) {
      const contentStep = getStepCostAssumption('content-generation');
      if (contentStep) {
        for (let i = 0; i < pagesOptimized; i++) {
          this.processStepCost(contentStep, options, providerCosts, assumptions);
        }
      }
    }

    // Review responses (simple LLM calls)
    if (reviewResponses > 0) {
      const reviewStep: StepCostAssumption = {
        stepKey: 'review-response',
        description: 'Generate review response',
        providers: ['openai:gpt-4', 'anthropic:claude-3-5-sonnet'],
        estimatedCalls: 1,
        estimatedTokensPerCall: { min: 500, max: 1000 },
        notes: 'Single LLM call per review response',
      };
      for (let i = 0; i < reviewResponses; i++) {
        this.processStepCost(reviewStep, options, providerCosts, assumptions);
      }
    }

    // Calculate totals
    let totalUsd = 0;
    for (const breakdown of providerCosts.values()) {
      totalUsd += breakdown.estimatedUsd;
    }

    return {
      scenario,
      totalUsd: Math.round(totalUsd * 10000) / 10000,
      perProvider: Array.from(providerCosts.values()),
      assumptions,
      confidence: 0.75,
      metadata: {
        generatedAt: new Date(),
      },
    };
  }

  /**
   * Process a single step and accumulate costs
   */
  private processStepCost(
    step: StepCostAssumption,
    options: CostEstimationOptions,
    providerCosts: Map<ProviderKey, ProviderCostBreakdown>,
    assumptions: string[]
  ): void {
    const calls = this.getEstimatedCalls(step.estimatedCalls, options);
    const tokensPerCall = this.getEstimatedTokens(step.estimatedTokensPerCall, 1);

    for (const providerKey of step.providers) {
      const pricing = getProviderPricing(providerKey);
      if (!pricing || !pricing.enabled) continue;

      let existing = providerCosts.get(providerKey);
      if (!existing) {
        existing = {
          provider: providerKey,
          estimatedRequests: 0,
          estimatedTokens: 0,
          estimatedUsd: 0,
        };
        providerCosts.set(providerKey, existing);
      }

      existing.estimatedRequests += calls;

      if (pricing.unit.unit === 'per-1k-tokens') {
        const totalTokens = tokensPerCall * calls;
        existing.estimatedTokens += totalTokens;
        const cost = (totalTokens / 1000) * pricing.price;
        existing.estimatedUsd += cost;
      } else {
        // Per-request pricing
        const cost = calls * pricing.price;
        existing.estimatedUsd += cost;
      }
    }

    if (step.notes) {
      assumptions.push(`${step.stepKey}: ${step.notes}`);
    }
  }

  /**
   * Merge provider costs from another estimate
   */
  private mergeProviderCosts(
    target: Map<ProviderKey, ProviderCostBreakdown>,
    source: ProviderCostBreakdown[]
  ): void {
    for (const breakdown of source) {
      const existing = target.get(breakdown.provider);
      if (existing) {
        existing.estimatedRequests += breakdown.estimatedRequests;
        existing.estimatedTokens += breakdown.estimatedTokens;
        existing.estimatedUsd += breakdown.estimatedUsd;
      } else {
        target.set(breakdown.provider, { ...breakdown });
      }
    }
  }

  /**
   * Get estimated number of calls (handles ranges)
   */
  private getEstimatedCalls(
    estimatedCalls: number | { min: number; max: number },
    options: CostEstimationOptions
  ): number {
    if (typeof estimatedCalls === 'number') {
      return estimatedCalls;
    }

    // Use specific counts from options if available
    if (estimatedCalls.min === estimatedCalls.max) {
      return estimatedCalls.min;
    }

    // Use average for estimation
    const average = (estimatedCalls.min + estimatedCalls.max) / 2;

    // Override with specific counts if provided
    if (options.competitorCount && estimatedCalls.min >= 3 && estimatedCalls.max <= 10) {
      return options.competitorCount;
    }
    if (options.opportunityCount && estimatedCalls.min >= 20 && estimatedCalls.max <= 50) {
      return options.opportunityCount;
    }

    return Math.round(average);
  }

  /**
   * Get estimated tokens (handles ranges)
   */
  private getEstimatedTokens(
    estimatedTokens: number | { min: number; max: number } | undefined,
    calls: number
  ): number {
    if (!estimatedTokens) return 0;
    if (typeof estimatedTokens === 'number') {
      return estimatedTokens * calls;
    }

    // Use average for estimation
    const average = (estimatedTokens.min + estimatedTokens.max) / 2;
    return Math.round(average * calls);
  }

  /**
   * Check if provider is an LLM provider
   */
  private isLLMProvider(provider: ProviderKey): boolean {
    return provider.startsWith('openai:') ||
           provider.startsWith('anthropic:') ||
           provider.startsWith('gemini:') ||
           provider.startsWith('copilot:');
  }

  /**
   * Check if provider is a search provider
   */
  private isSearchProvider(provider: ProviderKey): boolean {
    return provider.startsWith('perplexity:') ||
           provider.startsWith('brave:') ||
           provider.startsWith('serpapi:');
  }

  /**
   * Get intelligence runs per week based on automation level
   */
  private getIntelligenceRunsPerWeek(level: 'low' | 'medium' | 'high'): number {
    switch (level) {
      case 'low':
        return 1;
      case 'medium':
        return 2;
      case 'high':
        return 4;
      default:
        return 1;
    }
  }
}



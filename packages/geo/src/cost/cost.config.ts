/**
 * Cost Model Configuration
 * 
 * Default pricing and cost assumptions for all providers and intelligence steps.
 * 
 * IMPORTANT: These are placeholder values. Update with actual pricing from provider dashboards.
 * Pricing is typically per 1K tokens for LLMs and per request for search APIs.
 */

import {
  ProviderPricingConfig,
  StepCostAssumption,
  ProviderKey,
} from './cost.types';

/**
 * Default provider pricing configuration
 * 
 * NOTE: Update these values with actual pricing from:
 * - OpenAI: https://openai.com/pricing
 * - Anthropic: https://www.anthropic.com/pricing
 * - Google: https://ai.google.dev/pricing
 * - Perplexity: https://www.perplexity.ai/pricing
 * - Brave: https://brave.com/search/api/
 * - SerpAPI: https://serpapi.com/pricing
 */
export const DEFAULT_PROVIDER_PRICING: ProviderPricingConfig[] = [
  // OpenAI Models
  {
    provider: 'openai:gpt-4',
    unit: { type: 'llm', unit: 'per-1k-tokens' },
    price: 0.03, // $0.03 per 1K input tokens, $0.06 per 1K output tokens (averaged)
    notes: 'GPT-4 pricing (input + output averaged)',
    enabled: true,
  },
  {
    provider: 'openai:gpt-4-turbo',
    unit: { type: 'llm', unit: 'per-1k-tokens' },
    price: 0.01, // Cheaper than GPT-4
    notes: 'GPT-4 Turbo pricing (input + output averaged)',
    enabled: true,
  },
  {
    provider: 'openai:gpt-3.5-turbo',
    unit: { type: 'llm', unit: 'per-1k-tokens' },
    price: 0.001, // Much cheaper
    notes: 'GPT-3.5 Turbo pricing (input + output averaged)',
    enabled: true,
  },
  // Anthropic Models
  {
    provider: 'anthropic:claude-3-5-sonnet',
    unit: { type: 'llm', unit: 'per-1k-tokens' },
    price: 0.015, // $0.003 input + $0.015 output (averaged)
    notes: 'Claude 3.5 Sonnet pricing (input + output averaged)',
    enabled: true,
  },
  {
    provider: 'anthropic:claude-3-opus',
    unit: { type: 'llm', unit: 'per-1k-tokens' },
    price: 0.045, // More expensive
    notes: 'Claude 3 Opus pricing (input + output averaged)',
    enabled: true,
  },
  {
    provider: 'anthropic:claude-3-haiku',
    unit: { type: 'llm', unit: 'per-1k-tokens' },
    price: 0.0008, // Cheapest Anthropic model
    notes: 'Claude 3 Haiku pricing (input + output averaged)',
    enabled: true,
  },
  // Google Gemini Models
  {
    provider: 'gemini:gemini-1.5-pro',
    unit: { type: 'llm', unit: 'per-1k-tokens' },
    price: 0.00125, // $0.0005 input + $0.002 output (averaged)
    notes: 'Gemini 1.5 Pro pricing (input + output averaged)',
    enabled: true,
  },
  {
    provider: 'gemini:gemini-1.5-flash',
    unit: { type: 'llm', unit: 'per-1k-tokens' },
    price: 0.00035, // Cheapest
    notes: 'Gemini 1.5 Flash pricing (input + output averaged)',
    enabled: true,
  },
  // Azure Copilot
  {
    provider: 'copilot:gpt-4',
    unit: { type: 'llm', unit: 'per-1k-tokens' },
    price: 0.03, // Similar to OpenAI GPT-4
    notes: 'Azure OpenAI GPT-4 pricing (input + output averaged)',
    enabled: true,
  },
  // Search Providers (Per-Request Pricing)
  {
    provider: 'perplexity:sonar',
    unit: { type: 'search', unit: 'per-request' },
    price: 0.001, // $0.001 per request (approximate)
    notes: 'Perplexity Sonar pricing per request',
    enabled: true,
  },
  {
    provider: 'perplexity:sonar-pro',
    unit: { type: 'search', unit: 'per-request' },
    price: 0.002, // $0.002 per request (approximate, more expensive)
    notes: 'Perplexity Sonar Pro pricing per request',
    enabled: true,
  },
  {
    provider: 'brave:web-search',
    unit: { type: 'search', unit: 'per-request' },
    price: 0.0005, // $0.0005 per request (approximate)
    notes: 'Brave Search API pricing per request (subscription-based)',
    enabled: true,
  },
  {
    provider: 'serpapi:google-search',
    unit: { type: 'search', unit: 'per-request' },
    price: 0.00005, // $0.00005 per request ($50/1M searches)
    notes: 'SerpAPI pricing per request ($50/1M searches after free tier)',
    enabled: true,
  },
];

/**
 * Default step cost assumptions
 * 
 * Maps each intelligence pipeline step to its cost drivers.
 * These are best-effort estimates based on typical usage patterns.
 */
export const DEFAULT_STEP_COSTS: StepCostAssumption[] = [
  // Step 1: Industry Detection
  {
    stepKey: 'industry-detection',
    description: 'Detect industry classification for domain',
    providers: ['openai:gpt-4', 'anthropic:claude-3-5-sonnet', 'gemini:gemini-1.5-pro'],
    estimatedCalls: 1,
    estimatedTokensPerCall: { min: 500, max: 1000 },
    notes: 'Single LLM call to classify industry',
    usedInInstantSummary: true,
    usedInFullIntelligence: true,
  },
  // Step 2: Business Summary
  {
    stepKey: 'business-summary',
    description: 'Generate premium business summary',
    providers: ['openai:gpt-4', 'anthropic:claude-3-5-sonnet', 'gemini:gemini-1.5-pro'],
    estimatedCalls: 1,
    estimatedTokensPerCall: { min: 2000, max: 4000 },
    notes: 'Single LLM call to generate comprehensive business summary',
    usedInInstantSummary: true,
    usedInFullIntelligence: true,
  },
  // Step 3: Prompt Generation
  {
    stepKey: 'prompt-generation',
    description: 'Generate evidence-backed search prompts',
    providers: ['openai:gpt-4', 'anthropic:claude-3-5-sonnet', 'gemini:gemini-1.5-pro'],
    estimatedCalls: 1,
    estimatedTokensPerCall: { min: 3000, max: 5000 },
    notes: 'Single LLM call that generates 20-50 prompts in batch',
    usedInInstantSummary: true,
    usedInFullIntelligence: true,
  },
  // Step 4: Prompt Clustering
  {
    stepKey: 'prompt-clustering',
    description: 'Cluster prompts by intent and semantic similarity',
    providers: ['openai:gpt-4', 'anthropic:claude-3-5-sonnet'],
    estimatedCalls: 1,
    estimatedTokensPerCall: { min: 2000, max: 4000 },
    notes: 'Single LLM call to cluster prompts',
    usedInInstantSummary: false,
    usedInFullIntelligence: true,
  },
  // Step 5: Competitor Detection
  {
    stepKey: 'competitor-detection',
    description: 'Detect competitors using LLM analysis',
    providers: ['openai:gpt-4', 'anthropic:claude-3-5-sonnet'],
    estimatedCalls: { min: 3, max: 10 }, // 1 call per competitor
    estimatedTokensPerCall: { min: 1500, max: 3000 },
    notes: 'Multiple LLM calls, one per competitor (typically 3-10 competitors)',
    usedInInstantSummary: false,
    usedInFullIntelligence: true,
  },
  // Step 6: Share of Voice (SOV) Analysis
  {
    stepKey: 'sov-analysis',
    description: 'Calculate share of voice across engines',
    providers: ['perplexity:sonar-pro', 'brave:web-search', 'serpapi:google-search'],
    estimatedCalls: { min: 40, max: 200 }, // #prompts × #engines (typically 10-50 prompts × 4 engines)
    estimatedTokensPerCall: undefined, // Not applicable for search APIs
    notes: 'Search API calls: #prompts × #engines. Instant Summary uses ~10 prompts × 4 engines = 40 calls. Full Intelligence uses 20-50 prompts × 4 engines = 80-200 calls.',
    usedInInstantSummary: true,
    usedInFullIntelligence: true,
  },
  // Step 7: Citation Analysis
  {
    stepKey: 'citation-analysis',
    description: 'Analyze citations from prompt runs',
    providers: [], // Database queries only, no external cost
    estimatedCalls: 0,
    estimatedTokensPerCall: undefined,
    notes: 'Database queries only, no external API cost',
    usedInInstantSummary: false,
    usedInFullIntelligence: true,
  },
  // Step 8: Commercial Value Analysis
  {
    stepKey: 'commercial-value',
    description: 'Calculate commercial value impact for prompt clusters',
    providers: ['openai:gpt-4', 'anthropic:claude-3-5-sonnet'],
    estimatedCalls: { min: 5, max: 10 }, // 1 call per cluster
    estimatedTokensPerCall: { min: 1000, max: 2000 },
    notes: 'Multiple LLM calls, one per prompt cluster (typically 5-10 clusters)',
    usedInInstantSummary: false,
    usedInFullIntelligence: true,
  },
  // Step 9: Cross-Engine Pattern Recognition
  {
    stepKey: 'cross-engine-patterns',
    description: 'Analyze patterns across different AI engines',
    providers: ['openai:gpt-4', 'anthropic:claude-3-5-sonnet'],
    estimatedCalls: 1,
    estimatedTokensPerCall: { min: 2000, max: 3000 },
    notes: 'Single LLM call to analyze cross-engine patterns',
    usedInInstantSummary: false,
    usedInFullIntelligence: true,
  },
  // Step 10: Competitor Advantage Analysis
  {
    stepKey: 'competitor-advantage',
    description: 'Analyze competitor advantages and weaknesses',
    providers: ['openai:gpt-4', 'anthropic:claude-3-5-sonnet'],
    estimatedCalls: { min: 3, max: 10 }, // 1 call per competitor
    estimatedTokensPerCall: { min: 1500, max: 2500 },
    notes: 'Multiple LLM calls, one per competitor (typically 3-10 competitors)',
    usedInInstantSummary: false,
    usedInFullIntelligence: true,
  },
  // Step 11: Trust Failure Detection
  {
    stepKey: 'trust-failure',
    description: 'Detect trust failures and root causes',
    providers: ['openai:gpt-4', 'anthropic:claude-3-5-sonnet'],
    estimatedCalls: 1,
    estimatedTokensPerCall: { min: 1500, max: 2500 },
    notes: 'Single LLM call to detect trust failures',
    usedInInstantSummary: false,
    usedInFullIntelligence: true,
  },
  // Step 12: Fix Difficulty Calculation
  {
    stepKey: 'fix-difficulty',
    description: 'Calculate difficulty of fixing identified issues',
    providers: ['openai:gpt-4', 'anthropic:claude-3-5-sonnet'],
    estimatedCalls: { min: 20, max: 50 }, // 1 call per opportunity
    estimatedTokensPerCall: { min: 1000, max: 2000 },
    notes: 'Multiple LLM calls, one per opportunity (typically 20-50 opportunities)',
    usedInInstantSummary: false,
    usedInFullIntelligence: true,
  },
  // Step 13: GEO Score Computation
  {
    stepKey: 'geo-score',
    description: 'Calculate comprehensive GEO score',
    providers: [], // Database queries only
    estimatedCalls: 0,
    estimatedTokensPerCall: undefined,
    notes: 'Database queries only, no external API cost',
    usedInInstantSummary: true,
    usedInFullIntelligence: true,
  },
  // Step 14: Visibility Opportunities
  {
    stepKey: 'visibility-opportunities',
    description: 'Generate visibility opportunities with root cause analysis',
    providers: ['openai:gpt-4', 'anthropic:claude-3-5-sonnet'],
    estimatedCalls: { min: 20, max: 100 }, // 1-2 calls per opportunity
    estimatedTokensPerCall: { min: 1500, max: 3000 },
    notes: 'Multiple LLM calls, 1-2 per opportunity (typically 20-50 opportunities)',
    usedInInstantSummary: false,
    usedInFullIntelligence: true,
  },
  // Step 15: Enhanced Recommendations
  {
    stepKey: 'recommendations',
    description: 'Generate actionable recommendations',
    providers: ['openai:gpt-4', 'anthropic:claude-3-5-sonnet'],
    estimatedCalls: { min: 10, max: 20 }, // 1 call per recommendation
    estimatedTokensPerCall: { min: 1500, max: 2500 },
    notes: 'Multiple LLM calls, one per recommendation (typically 10-20 recommendations)',
    usedInInstantSummary: false,
    usedInFullIntelligence: true,
  },
  // Additional: Content Generation
  {
    stepKey: 'content-generation',
    description: 'Generate GEO-optimized content (blog posts, pages, etc.)',
    providers: ['openai:gpt-4', 'anthropic:claude-3-5-sonnet', 'gemini:gemini-1.5-pro'],
    estimatedCalls: 1, // 1 call per content item
    estimatedTokensPerCall: { min: 5000, max: 10000 },
    notes: 'Single LLM call per content item (blog post, page, etc.)',
    usedInInstantSummary: false,
    usedInFullIntelligence: false,
  },
];

/**
 * Get pricing config for a provider
 */
export function getProviderPricing(provider: ProviderKey): ProviderPricingConfig | undefined {
  return DEFAULT_PROVIDER_PRICING.find(p => p.provider === provider);
}

/**
 * Get step cost assumption for a step
 */
export function getStepCostAssumption(stepKey: string): StepCostAssumption | undefined {
  return DEFAULT_STEP_COSTS.find(s => s.stepKey === stepKey);
}

/**
 * Get all steps used in a scenario
 */
export function getStepsForScenario(scenario: 'instant-summary-v2' | 'geo-intelligence-full'): StepCostAssumption[] {
  return DEFAULT_STEP_COSTS.filter(step => {
    if (scenario === 'instant-summary-v2') {
      return step.usedInInstantSummary === true;
    } else {
      return step.usedInFullIntelligence === true;
    }
  });
}



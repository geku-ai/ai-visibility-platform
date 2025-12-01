/**
 * Cost & Usage Intelligence Types
 * 
 * Defines types for cost estimation and usage tracking across GEO Copilot intelligence pipeline.
 * All costs are estimated in USD based on provider pricing configuration.
 */

/**
 * Provider identifier key
 * Format: "provider:model" or "provider" for non-model providers
 */
export type ProviderKey =
  // LLM Providers
  | 'openai:gpt-4'
  | 'openai:gpt-4-turbo'
  | 'openai:gpt-3.5-turbo'
  | 'anthropic:claude-3-5-sonnet'
  | 'anthropic:claude-3-opus'
  | 'anthropic:claude-3-haiku'
  | 'gemini:gemini-1.5-pro'
  | 'gemini:gemini-1.5-flash'
  | 'copilot:gpt-4'
  // Search Providers
  | 'perplexity:sonar'
  | 'perplexity:sonar-pro'
  | 'brave:web-search'
  | 'serpapi:google-search';

/**
 * Cost unit type and measurement
 */
export interface CostUnit {
  /** Type of cost unit */
  type: 'llm' | 'search' | 'scrape' | 'other';
  /** Unit of measurement */
  unit: 'per-1k-tokens' | 'per-request' | 'per-page' | 'per-hour';
  /** Notes about the unit */
  notes?: string;
}

/**
 * Provider pricing configuration
 * Defines the cost structure for each provider/model combination
 */
export interface ProviderPricingConfig {
  /** Provider identifier */
  provider: ProviderKey;
  /** Cost unit definition */
  unit: CostUnit;
  /** Price in USD */
  price: number;
  /** Additional notes about pricing */
  notes?: string;
  /** Whether this provider is currently enabled */
  enabled?: boolean;
}

/**
 * Step cost assumption
 * Maps intelligence pipeline steps to their cost drivers
 */
export interface StepCostAssumption {
  /** Step identifier (e.g., "industry-detection", "competitor-detection") */
  stepKey: string;
  /** Human-readable description */
  description: string;
  /** Which providers are called in this step */
  providers: ProviderKey[];
  /** Estimated number of calls (can be a range) */
  estimatedCalls: number | { min: number; max: number };
  /** Estimated tokens per call (for LLM providers, can be a range) */
  estimatedTokensPerCall?: number | { min: number; max: number };
  /** Additional notes */
  notes?: string;
  /** Whether this step is used in Instant Summary V2 */
  usedInInstantSummary?: boolean;
  /** Whether this step is used in Full Intelligence */
  usedInFullIntelligence?: boolean;
}

/**
 * Scenario identifier
 */
export type ScenarioKey =
  | 'instant-summary-v2'
  | 'geo-intelligence-full'
  | 'opportunities-only'
  | 'recommendations-only'
  | 'copilot-weekly-default'
  | 'copilot-weekly-low'
  | 'copilot-weekly-medium'
  | 'copilot-weekly-high'
  | 'content-generation';

/**
 * Provider cost breakdown
 */
export interface ProviderCostBreakdown {
  /** Provider identifier */
  provider: ProviderKey;
  /** Estimated number of requests */
  estimatedRequests: number;
  /** Estimated tokens (for LLM providers) */
  estimatedTokens: number;
  /** Estimated cost in USD */
  estimatedUsd: number;
  /** Breakdown by step (optional) */
  stepBreakdown?: Array<{
    stepKey: string;
    requests: number;
    tokens: number;
    cost: number;
  }>;
}

/**
 * Scenario cost estimate
 * Complete cost breakdown for a given scenario
 */
export interface ScenarioCostEstimate {
  /** Scenario identifier */
  scenario: ScenarioKey;
  /** Total estimated cost in USD */
  totalUsd: number;
  /** Cost breakdown per provider */
  perProvider: ProviderCostBreakdown[];
  /** Assumptions made in this estimate */
  assumptions: string[];
  /** Confidence level (0-1) */
  confidence: number;
  /** Estimated number of LLM calls */
  estimatedLLMCalls?: number;
  /** Estimated number of search API calls */
  estimatedSearchCalls?: number;
  /** Estimated total tokens (LLM only) */
  estimatedTotalTokens?: number;
  /** Metadata */
  metadata?: {
    industry?: string;
    promptCount?: number;
    competitorCount?: number;
    opportunityCount?: number;
    generatedAt: Date;
  };
}

/**
 * Cost estimation options
 */
export interface CostEstimationOptions {
  /** Industry context (affects prompt/competitor counts) */
  industry?: string;
  /** Expected number of prompts */
  promptCount?: number;
  /** Expected number of competitors */
  competitorCount?: number;
  /** Expected number of opportunities */
  opportunityCount?: number;
  /** Whether to assume cached prompt runs (reduces search API calls) */
  assumeCached?: boolean;
  /** Custom provider pricing overrides */
  pricingOverrides?: Partial<Record<ProviderKey, number>>;
}

/**
 * Copilot automation parameters
 */
export interface CopilotAutomationParams {
  /** Workspace identifier */
  workspaceId: string;
  /** Automation level */
  automationLevel: 'low' | 'medium' | 'high';
  /** Pages optimized per week */
  pagesOptimizedPerWeek: number;
  /** Review responses per week */
  reviewResponsesPerWeek: number;
  /** Full intelligence runs per week */
  intelligenceRunsPerWeek?: number;
}



import { Injectable } from '@nestjs/common';
import { LLMConfigService, LLMConfig } from './llm-config.service';

export interface LLMResponse {
  text: string;
  content?: string; // Alias for text for compatibility
  usage?: { promptTokens: number; completionTokens: number };
  tokens?: { prompt: number; completion: number }; // Alias for usage
  cost?: number;
  metadata?: Record<string, any>;
}

export interface BaseLLMProvider {
  query(prompt: string, options?: any): Promise<LLMResponse>;
  isAvailable(): Promise<boolean>;
}

@Injectable()
export class LLMRouterService {
  constructor(private llmConfigService: LLMConfigService) {}

  /**
   * Route LLM request to configured provider for workspace
   * Tries all available providers with proper fallback and graceful degradation
   */
  async routeLLMRequest(
    workspaceId: string,
    prompt: string,
    options: any = {}
  ): Promise<LLMResponse> {
    // Get primary config
    const primaryConfig = await this.llmConfigService.getWorkspaceLLMConfig(workspaceId);
    
    // Get all available providers with API keys, prioritizing primary
    const availableProviders = await this.getAllAvailableProviders(primaryConfig.provider);
    
    console.log(`[LLM Router] Found ${availableProviders.length} available LLM provider(s) for workspace ${workspaceId}:`, 
      availableProviders.map(p => `${p.provider} (${p.model})`).join(', '));
    
    if (availableProviders.length === 0) {
      console.error(`[LLM Router] No LLM providers available for workspace ${workspaceId}. All API keys are missing.`);
      // Return a graceful fallback response instead of throwing
      return this.createFallbackResponse(prompt);
    }
    
    // Try each provider in order
    const errors: Array<{ provider: string; error: string }> = [];
    
    for (const providerConfig of availableProviders) {
      try {
        console.log(`[LLM Router] 🔄 Attempting provider: ${providerConfig.provider} (model: ${providerConfig.model})`);
        const provider = await this.createProvider(providerConfig);
        const response = await provider.query(prompt, { ...options, model: providerConfig.model });
        console.log(`[LLM Router] ✅ Success with provider: ${providerConfig.provider} (model: ${providerConfig.model})`);
        return response;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`[LLM Router] ❌ Provider ${providerConfig.provider} failed: ${errorMessage}`);
        errors.push({ provider: providerConfig.provider, error: errorMessage });
        // Continue to next provider - don't give up yet
        continue;
      }
    }
    
    // All providers failed - log all errors and return graceful fallback
    console.error(`[LLM Router] ⚠️ All ${availableProviders.length} LLM providers failed for workspace ${workspaceId}. Errors:`, 
      errors.map(e => `${e.provider}: ${e.error}`).join('; '));
    return this.createFallbackResponse(prompt, errors);
  }

  /**
   * Create provider instance from config
   */
  private async createProvider(config: LLMConfig): Promise<any> {
    switch (config.provider) {
      // Dynamic imports to avoid build-time dependencies
      case 'openai':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { OpenAIProvider } = require('@ai-visibility/providers');
        return new OpenAIProvider({ 
          apiKey: config.apiKey,
          apiKeys: (config as any).apiKeys, // Pass apiKeys array if available
        });
      
      case 'anthropic':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { AnthropicProvider } = require('@ai-visibility/providers');
        return new AnthropicProvider({ apiKey: config.apiKey });
      
      case 'gemini':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { GeminiProvider } = require('@ai-visibility/providers');
        return new GeminiProvider({ apiKey: config.apiKey });
      
      default:
        throw new Error(`Unsupported LLM provider: ${config.provider}`);
    }
  }

  /**
   * Get all available providers with API keys, prioritizing the primary provider
   * This ensures we try ALL configured providers, not just the primary one
   */
  private async getAllAvailableProviders(primaryProvider: string): Promise<LLMConfig[]> {
    // Check ALL possible LLM providers - we want exhaustive coverage
    const allProviders: string[] = ['openai', 'anthropic', 'gemini'];
    const available: LLMConfig[] = [];
    const others: LLMConfig[] = [];
    const skipped: string[] = [];
    
    console.log(`[LLM Router] Checking ${allProviders.length} LLM providers for availability...`);
    
    // Check each provider for API key availability
    for (const provider of allProviders) {
      try {
        const config = await this.getProviderConfig(provider);
        // If this is the primary provider, add it first
        if (provider === primaryProvider) {
          available.unshift(config);
          console.log(`[LLM Router] ✅ ${provider} is available (primary provider, model: ${config.model})`);
        } else {
          others.push(config);
          console.log(`[LLM Router] ✅ ${provider} is available (fallback provider, model: ${config.model})`);
        }
      } catch (error) {
        // API key not available for this provider, skip it
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`[LLM Router] ⚠️ Provider ${provider} not available: ${errorMsg}`);
        skipped.push(provider);
      }
    }
    
    if (skipped.length > 0) {
      console.log(`[LLM Router] Skipped ${skipped.length} provider(s) due to missing API keys: ${skipped.join(', ')}`);
    }
    
    // Combine: primary first, then others
    const result = [...available, ...others];
    console.log(`[LLM Router] Will attempt ${result.length} provider(s) in order: ${result.map(p => p.provider).join(' → ')}`);
    return result;
  }

  /**
   * Get provider configuration for fallback providers
   */
  private async getProviderConfig(provider: string): Promise<LLMConfig> {
    switch (provider) {
      case 'openai':
        // Support multiple OpenAI keys for rotation
        const openaiKeys: string[] = [];
        
        // Method 1: Check for comma-separated OPENAI_API_KEY
        const singleKey = process.env.OPENAI_API_KEY;
        if (singleKey && singleKey.includes(',')) {
          openaiKeys.push(...singleKey.split(',').map(k => k.trim()).filter(k => k.length > 0));
        } else if (singleKey) {
          openaiKeys.push(singleKey);
        }
        
        // Method 2: Check for individual keys (OPENAI_API_KEY_1, OPENAI_API_KEY_2, etc.)
        for (let i = 1; i <= 10; i++) {
          const key = process.env[`OPENAI_API_KEY_${i}`];
          if (key && key.length > 0 && !openaiKeys.includes(key)) {
            openaiKeys.push(key);
          }
        }
        
        if (openaiKeys.length === 0) {
          throw new Error('OPENAI_API_KEY environment variable is not set');
        }
        
        return {
          provider: 'openai',
          model: process.env.OPENAI_MODEL || 'gpt-4',
          apiKey: openaiKeys.join(','),
          apiKeys: openaiKeys.length > 0 ? openaiKeys : undefined,
        };
      
      case 'anthropic':
        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        if (!anthropicKey) {
          throw new Error('ANTHROPIC_API_KEY environment variable is not set');
        }
        // Log first 10 chars of key for debugging (safe - doesn't expose full key)
        console.log(`[LLM Router] Using Anthropic key: ${anthropicKey.substring(0, 10)}... (length: ${anthropicKey.length})`);
        return {
          provider: 'anthropic',
          model: process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307', // Using haiku (most available, used in isAvailable test)
          apiKey: anthropicKey,
        };
      
      case 'gemini':
        const geminiKey = process.env.GOOGLE_AI_API_KEY;
        if (!geminiKey) {
          throw new Error('GOOGLE_AI_API_KEY environment variable is not set');
        }
        return {
          provider: 'gemini',
          model: process.env.GEMINI_MODEL || 'gemini-1.5-pro', // Trying 1.5-pro (1.5-flash returned 404)
          apiKey: geminiKey,
        };
      
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Create a graceful fallback response when all providers fail
   * This ensures the application doesn't break even if all LLMs are unavailable
   */
  private createFallbackResponse(prompt: string, errors?: Array<{ provider: string; error: string }>): LLMResponse {
    const errorSummary = errors && errors.length > 0 
      ? ` Errors: ${errors.map(e => `${e.provider}: ${e.error}`).join('; ')}`
      : '';
    
    console.warn(`[LLM Router] All providers failed, returning fallback response.${errorSummary}`);
    
    // Return a basic response that won't break the application
    // Services should handle this gracefully
    return {
      text: `[LLM Service Unavailable] Unable to process request at this time. All LLM providers are currently unavailable. Please check your API keys and provider status.${errorSummary}`,
      content: `[LLM Service Unavailable] Unable to process request at this time. All LLM providers are currently unavailable. Please check your API keys and provider status.${errorSummary}`,
      usage: { promptTokens: 0, completionTokens: 0 },
      tokens: { prompt: 0, completion: 0 },
      cost: 0,
      metadata: {
        fallback: true,
        error: 'All LLM providers failed',
        errors: errors || [],
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Track usage and cost for LLM requests
   */
  async trackUsage(
    workspaceId: string,
    provider: string,
    model: string,
    promptTokens: number,
    completionTokens: number,
    cost: number
  ): Promise<void> {
    // TODO: Implement cost tracking in database
    // This would create entries in CostLedger and WorkspaceDailyCost tables
    
    console.log(`Tracking LLM usage for workspace ${workspaceId}:`, {
      provider,
      model,
      promptTokens,
      completionTokens,
      cost,
    });
  }

  /**
   * Get usage statistics for a workspace
   */
  async getUsageStats(workspaceId: string): Promise<{
    totalRequests: number;
    totalCost: number;
    providerBreakdown: Record<string, { requests: number; cost: number }>;
    dailyUsage: Array<{ date: string; cost: number; requests: number }>;
  }> {
    // TODO: Implement usage statistics from database
    return {
      totalRequests: 0,
      totalCost: 0,
      providerBreakdown: {},
      dailyUsage: [],
    };
  }

  /**
   * Check if workspace has exceeded budget
   */
  async checkBudgetLimit(workspaceId: string): Promise<{
    exceeded: boolean;
    currentCost: number;
    budgetLimit: number;
    remainingBudget: number;
  }> {
    // TODO: Implement budget checking from database
    const budgetLimit = 100.0; // Default budget
    const currentCost = 0; // TODO: Get from database
    
    return {
      exceeded: currentCost >= budgetLimit,
      currentCost,
      budgetLimit,
      remainingBudget: Math.max(0, budgetLimit - currentCost),
    };
  }
}


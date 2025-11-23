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
   */
  async routeLLMRequest(
    workspaceId: string,
    prompt: string,
    options: any = {}
  ): Promise<LLMResponse> {
    const config = await this.llmConfigService.getWorkspaceLLMConfig(workspaceId);
    
    try {
      const provider = await this.createProvider(config);
      return await provider.query(prompt, { ...options, model: config.model });
    } catch (error) {
      // If primary provider fails, try fallback providers
      console.warn(`Primary LLM provider failed for workspace ${workspaceId}:`, error instanceof Error ? error.message : String(error));
      
      const fallbackProviders = this.getFallbackProviders(config.provider);
      
      for (const fallbackProvider of fallbackProviders) {
        try {
          const fallbackConfig = await this.getProviderConfig(fallbackProvider);
          const provider = await this.createProvider(fallbackConfig);
          return await provider.query(prompt, { ...options, model: fallbackConfig.model });
        } catch (fallbackError) {
          console.warn(`Fallback provider ${fallbackProvider} also failed:`, fallbackError instanceof Error ? fallbackError.message : String(fallbackError));
          continue;
        }
      }
      
      throw new Error(`All LLM providers failed for workspace ${workspaceId}`);
    }
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
   * Get fallback providers for a given provider
   */
  private getFallbackProviders(primaryProvider: string): string[] {
    const fallbackMap: Record<string, string[]> = {
      'openai': ['anthropic', 'gemini'],
      'anthropic': ['openai', 'gemini'],
      'gemini': ['openai', 'anthropic'],
    };
    return fallbackMap[primaryProvider] || ['openai'];
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
        
        return {
          provider: 'openai',
          model: 'gpt-4',
          apiKey: openaiKeys.length > 0 ? openaiKeys.join(',') : process.env.OPENAI_API_KEY!,
          apiKeys: openaiKeys.length > 0 ? openaiKeys : undefined,
        };
      
      case 'anthropic':
        return {
          provider: 'anthropic',
          model: process.env.ANTHROPIC_MODEL || 'claude-3-sonnet-20240229', // Using sonnet (more reliable than opus)
          apiKey: process.env.ANTHROPIC_API_KEY!,
        };
      
      case 'gemini':
        return {
          provider: 'gemini',
          model: process.env.GEMINI_MODEL || 'gemini-1.5-flash', // Using 1.5-flash (works with v1beta API)
          apiKey: process.env.GOOGLE_AI_API_KEY!,
        };
      
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
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


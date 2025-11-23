import Anthropic from '@anthropic-ai/sdk';
import { BaseLLMProvider, LLMResponse, EngineAnswer } from './base-llm-provider';
import { ProviderConfig } from '../types';

export class AnthropicProvider extends BaseLLMProvider {
  private client: Anthropic;

  constructor(config: ProviderConfig) {
    super(config);
    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
  }

  async query(prompt: string, options: any = {}): Promise<LLMResponse> {
    try {
      const response = await this.client.messages.create({
        model: options.model || process.env.ANTHROPIC_MODEL || 'claude-3-sonnet-20240229', // Using sonnet (more reliable)
        max_tokens: options.maxTokens || 1000,
        temperature: options.temperature || 0.7,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
      const usage = response.usage;

      return {
        content,
        citations: this.extractCitations(content),
        mentions: this.extractMentions(content, options.brandName),
        sentiment: this.analyzeSentiment(content),
        cost: this.calculateCost({
          content,
          tokens: {
            prompt: usage.input_tokens,
            completion: usage.output_tokens,
            total: usage.input_tokens + usage.output_tokens,
          },
        } as LLMResponse),
        tokens: {
          prompt: usage.input_tokens,
          completion: usage.output_tokens,
          total: usage.input_tokens + usage.output_tokens,
        },
      };
    } catch (error) {
      throw new Error(`Anthropic API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  normalizeResponse(response: LLMResponse, originalPrompt: string): EngineAnswer {
    return {
      engine: 'anthropic',
      answer: response.content,
      citations: response.citations || [],
      mentions: response.mentions || [],
      sentiment: response.sentiment || 'neutral',
      confidence: this.calculateConfidence(response),
      timestamp: new Date(),
      cost: response.cost,
    };
  }

  calculateCost(response: LLMResponse): number {
    if (response.tokens) {
      // Claude-3 Opus pricing (as of 2024)
      const promptCostPer1K = 0.015;
      const completionCostPer1K = 0.075;
      
      const promptCost = (response.tokens.prompt / 1000) * promptCostPer1K;
      const completionCost = (response.tokens.completion / 1000) * completionCostPer1K;
      
      return promptCost + completionCost;
    }
    
    // Fallback: estimate based on content length
    const estimatedTokens = response.content.length / 4; // Rough estimate
    return (estimatedTokens / 1000) * 0.075; // Use completion rate as average
  }

  getProviderName(): string {
    return 'anthropic';
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Test with a simple request
      await this.client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'test' }],
      });
      return true;
    } catch (error) {
      return false;
    }
  }
}
import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseLLMProvider, LLMResponse, EngineAnswer } from './base-llm-provider';
import { ProviderConfig } from '../types';

export class GeminiProvider extends BaseLLMProvider {
  private client: GoogleGenerativeAI;
  private model: any;

  constructor(config: ProviderConfig) {
    super(config);
    if (!config.apiKey) {
      throw new Error('Google AI API key is required');
    }
    this.client = new GoogleGenerativeAI(config.apiKey);
    // Trying gemini-1.5-pro (1.5-flash returned 404 for v1 API)
    const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-pro';
    this.model = this.client.getGenerativeModel({ model: modelName });
  }

  async query(prompt: string, options: any = {}): Promise<LLMResponse> {
    try {
      const model = options.model ? this.client.getGenerativeModel({ model: options.model }) : this.model;
      
      const result = await model.generateContent({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: options.maxTokens || 1000,
          temperature: options.temperature || 0.7,
        },
      });

      const content = result.response.text();
      const usage = result.response.usageMetadata;

      return {
        content,
        citations: this.extractCitations(content),
        mentions: this.extractMentions(content, options.brandName),
        sentiment: this.analyzeSentiment(content),
        cost: this.calculateCost({
          content,
          tokens: {
            prompt: usage?.promptTokenCount || 0,
            completion: usage?.candidatesTokenCount || 0,
            total: usage?.totalTokenCount || 0,
          },
        } as LLMResponse),
        tokens: {
          prompt: usage?.promptTokenCount || 0,
          completion: usage?.candidatesTokenCount || 0,
          total: usage?.totalTokenCount || 0,
        },
      };
    } catch (error) {
      throw new Error(`Gemini API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  normalizeResponse(response: LLMResponse, originalPrompt: string): EngineAnswer {
    return {
      engine: 'gemini',
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
      // Gemini Pro pricing (as of 2024)
      const promptCostPer1K = 0.0005;
      const completionCostPer1K = 0.0015;
      
      const promptCost = (response.tokens.prompt / 1000) * promptCostPer1K;
      const completionCost = (response.tokens.completion / 1000) * completionCostPer1K;
      
      return promptCost + completionCost;
    }
    
    // Fallback: estimate based on content length
    const estimatedTokens = response.content.length / 4; // Rough estimate
    return (estimatedTokens / 1000) * 0.0015; // Use completion rate as average
  }

  getProviderName(): string {
    return 'gemini';
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Test with a simple request
      const result = await this.model.generateContent({
        contents: [{ parts: [{ text: 'test' }] }],
        generationConfig: {
          maxOutputTokens: 10,
        },
      });
      return !!result.response.text();
    } catch (error) {
      return false;
    }
  }
}
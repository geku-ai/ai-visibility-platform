/**
 * Perplexity AI provider implementation with mock responses
 */

import { EngineKey, EngineAnswer, Sentiment } from '@ai-visibility/shared';
import { BaseProvider } from './base-provider';
import { ProviderRequestOptions, ProviderHealth, CostEstimate } from './types';
import { loadFixture } from './fixture-loader';
import { MOCK_PROVIDERS } from './env';

export class PerplexityProvider extends BaseProvider {
  readonly engineType: 'search' | 'llm' = 'search';

  constructor(config: any = {}) {
    super(EngineKey.PERPLEXITY, 'Perplexity AI', '1.0.0', config);
  }

  async ask(prompt: string, options?: ProviderRequestOptions): Promise<EngineAnswer> {
    if (MOCK_PROVIDERS) {
      return this.executeWithRetry(async () => {
        // Simulate latency
        await this.simulateLatency(200, 800);

        // Check for simulated errors
        if (this.shouldSimulateError()) {
          throw new Error('Simulated Perplexity API error');
        }

        // Load fixture response
        const fixture = await loadFixture('perplexity', prompt);
        if (fixture) {
          return fixture.response;
        }

        // Fallback mock response
        return this.createMockResponse(prompt);
      }, 'Perplexity ask');
    }
    
    // Real Perplexity API call
    const apiKey = process.env.PERPLEXITY_API_KEY || this.config?.apiKey;
    if (!apiKey) {
      throw new Error('PERPLEXITY_API_KEY is required');
    }

    const startTime = Date.now();
    
    try {
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: options?.model || 'sonar-pro',
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: options?.temperature || 0.7,
          max_tokens: options?.maxTokens || 1000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Perplexity API error: ${response.status} ${errorText}`;
        
        // Provide clear error messages for common issues
        if (response.status === 401) {
          errorMessage = `Perplexity API authentication failed (401). The API key is invalid, expired, or missing. Please check your PERPLEXITY_API_KEY environment variable. Error: ${errorText}`;
        } else if (response.status === 429) {
          errorMessage = `Perplexity API rate limit exceeded (429). Please wait before retrying. Error: ${errorText}`;
        } else if (response.status === 403) {
          errorMessage = `Perplexity API access forbidden (403). Your API key may not have permission for this operation. Error: ${errorText}`;
        }
        
        const error = new Error(errorMessage);
        (error as any).statusCode = response.status;
        (error as any).isAuthError = response.status === 401;
        throw error;
      }

      const data = await response.json() as any;
      const content = data.choices?.[0]?.message?.content || '';
      const usage = data.usage || {};
      
      // Extract citations from Perplexity response
      const citations: Array<{ url: string; domain: string; confidence?: number }> = [];
      if (data.citations && Array.isArray(data.citations)) {
        for (const citation of data.citations) {
          try {
            const url = typeof citation === 'string' ? citation : (citation as any).url || citation;
            const domain = new URL(url as string).hostname.replace('www.', '');
            citations.push({ url: url as string, domain, confidence: 0.9 });
          } catch (e) {
            // Invalid URL, skip
          }
        }
      }

      // Extract mentions from content
      const mentions = this.extractMentions(content, options?.brandName || '');

      const latency = Date.now() - startTime;

      return this.createEngineAnswer(
        prompt,
        content,
        mentions,
        citations,
        {
          model: data.model || 'llama-3.1-sonar-pro-128k-online',
          tokens: usage.total_tokens || 0,
          latency,
          cost: this.calculateCostFromTokens(usage.total_tokens || 0),
        }
      );
    } catch (error) {
      // If error already has statusCode, it's a structured error from above - re-throw as-is
      if (error instanceof Error && (error as any).statusCode) {
        console.error(`[Perplexity] API error (${(error as any).statusCode}):`, error.message);
        throw error;
      }
      
      // Otherwise, wrap in a generic error
      console.error('[Perplexity] API call failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Perplexity API call failed: ${errorMessage}`);
    }
  }

  private calculateCostFromTokens(tokens: number): number {
    // Perplexity pricing: $0.001 per 1K tokens (approximate)
    return (tokens / 1000) * 0.001;
  }

  private extractMentions(content: string, brandName?: string): Array<{ brand: string; position: number; sentiment: Sentiment; snippet: string }> {
    const mentions: Array<{ brand: string; position: number; sentiment: Sentiment; snippet: string }> = [];
    
    if (brandName) {
      const brandRegex = new RegExp(brandName, 'gi');
      const matches = [...content.matchAll(brandRegex)];
      
      matches.forEach((match, index) => {
        const position = match.index || 0;
        const contextStart = Math.max(0, position - 50);
        const contextEnd = Math.min(content.length, position + 50);
        const snippet = content.substring(contextStart, contextEnd);
        
        // Simple sentiment analysis
        const positiveWords = ['great', 'excellent', 'best', 'amazing', 'good', 'top'];
        const negativeWords = ['bad', 'worst', 'poor', 'terrible', 'awful'];
        const context = snippet.toLowerCase();
        
        let sentiment = Sentiment.NEU;
        if (positiveWords.some(word => context.includes(word))) {
          sentiment = Sentiment.POS;
        } else if (negativeWords.some(word => context.includes(word))) {
          sentiment = Sentiment.NEG;
        }
        
        mentions.push({
          brand: brandName,
          position: index + 1,
          sentiment,
          snippet,
        });
      });
    }
    
    return mentions;
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const apiKey = process.env.PERPLEXITY_API_KEY || this.config?.apiKey;
      if (!apiKey) {
        return {
          status: 'unhealthy',
          lastCheck: new Date(),
          error: 'PERPLEXITY_API_KEY not configured',
        };
      }

      const startTime = Date.now();
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.1-sonar-small-128k-online',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 10,
        }),
      });

      const latency = Date.now() - startTime;

      if (!response.ok) {
        return {
          status: 'unhealthy',
          latency,
          lastCheck: new Date(),
          error: `API returned ${response.status}`,
        };
      }

      return {
        status: 'healthy',
        latency,
        lastCheck: new Date(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getCostEstimate(prompt: string, options?: ProviderRequestOptions): Promise<CostEstimate> {
    const inputTokens = Math.ceil(prompt.length / 4); // Rough token estimation
    const outputTokens = 500; // Estimated response length
    
    return {
      inputTokens,
      outputTokens,
      costCents: Math.ceil((inputTokens * 0.0001 + outputTokens * 0.0002) * 100),
      currency: 'USD',
    };
  }

  private createMockResponse(prompt: string): EngineAnswer {
    const responses = [
      {
        answer: "Based on the latest information, here are the top project management tools for small teams: 1. **Asana** - Excellent for task management and team collaboration. 2. **Trello** - Simple kanban boards perfect for small teams. 3. **Monday.com** - Highly customizable with great automation features. 4. **Notion** - All-in-one workspace with project management capabilities. 5. **ClickUp** - Feature-rich with time tracking and reporting.",
        mentions: [
          { brand: "Asana", position: 1, sentiment: Sentiment.POS, snippet: "Excellent for task management and team collaboration" },
          { brand: "Trello", position: 2, sentiment: Sentiment.POS, snippet: "Simple kanban boards perfect for small teams" },
          { brand: "Monday.com", position: 3, sentiment: Sentiment.POS, snippet: "Highly customizable with great automation features" },
          { brand: "Notion", position: 4, sentiment: Sentiment.POS, snippet: "All-in-one workspace with project management capabilities" },
          { brand: "ClickUp", position: 5, sentiment: Sentiment.POS, snippet: "Feature-rich with time tracking and reporting" }
        ],
        citations: [
          { url: "https://asana.com", domain: "asana.com", confidence: 0.95 },
          { url: "https://trello.com", domain: "trello.com", confidence: 0.92 },
          { url: "https://monday.com", domain: "monday.com", confidence: 0.88 },
          { url: "https://notion.so", domain: "notion.so", confidence: 0.90 },
          { url: "https://clickup.com", domain: "clickup.com", confidence: 0.85 }
        ]
      },
      {
        answer: "Here are the best alternatives to Asana for task management: 1. **Monday.com** - More visual and customizable than Asana. 2. **ClickUp** - Offers more features including time tracking and Gantt charts. 3. **Wrike** - Better for complex project management with advanced reporting. 4. **Smartsheet** - Spreadsheet-like interface with powerful automation. 5. **Airtable** - Database-like approach with flexible views and integrations.",
        mentions: [
          { brand: "Monday.com", position: 1, sentiment: Sentiment.POS, snippet: "More visual and customizable than Asana" },
          { brand: "ClickUp", position: 2, sentiment: Sentiment.POS, snippet: "Offers more features including time tracking and Gantt charts" },
          { brand: "Wrike", position: 3, sentiment: Sentiment.POS, snippet: "Better for complex project management with advanced reporting" },
          { brand: "Smartsheet", position: 4, sentiment: Sentiment.POS, snippet: "Spreadsheet-like interface with powerful automation" },
          { brand: "Airtable", position: 5, sentiment: Sentiment.POS, snippet: "Database-like approach with flexible views and integrations" }
        ],
        citations: [
          { url: "https://monday.com", domain: "monday.com", confidence: 0.93 },
          { url: "https://clickup.com", domain: "clickup.com", confidence: 0.91 },
          { url: "https://wrike.com", domain: "wrike.com", confidence: 0.89 },
          { url: "https://smartsheet.com", domain: "smartsheet.com", confidence: 0.87 },
          { url: "https://airtable.com", domain: "airtable.com", confidence: 0.85 }
        ]
      }
    ];

    const response = responses[Math.floor(Math.random() * responses.length)];
    
    return this.createEngineAnswer(
      prompt,
      response.answer,
      response.mentions,
      response.citations,
      {
        model: 'llama-3.1-sonar-pro-128k-online',
        tokens: Math.floor(Math.random() * 1000) + 500,
        latency: Math.random() * 500 + 200,
      }
    );
  }
}

/**
 * LLM Structured Extraction Service
 * Extracts structured JSON from LLM responses using function calling/structured output
 */

export interface StructuredMention {
  brand: string;
  canonicalBrand: string;
  context: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  relationship?: 'direct_competitor' | 'indirect_competitor' | 'partner' | 'supplier' | 'other';
  comparison?: string;
  confidence: number;
  position?: number;
  snippet?: string;
}

export interface StructuredCompetitor {
  brand: string;
  relationship: 'direct_competitor' | 'indirect_competitor' | 'partner' | 'supplier' | 'other';
  mentionCount: number;
  contexts: string[];
  confidence: number;
}

export interface StructuredExtraction {
  mentions: StructuredMention[];
  competitors: StructuredCompetitor[];
  insights: string[];
  metadata: {
    extractionModel: string;
    extractionTimestamp: string;
    confidence: number;
    source: 'cache' | 'fresh';
  };
}

export interface ExtractionOptions {
  model?: 'gpt-4o-mini' | 'gpt-4o' | 'claude-haiku' | 'claude-sonnet';
  brandsToSearch?: string[];
  minConfidence?: number;
  includeInsights?: boolean;
}

/**
 * LLM Structured Extraction Service
 * Uses LLM function calling to extract structured data from responses
 */
export class LLMStructuredExtractionService {
  /**
   * Extract structured data from LLM response
   * This is a placeholder that will be implemented with actual LLM calls
   */
  async extract(
    responseText: string,
    promptText: string,
    options: ExtractionOptions = {}
  ): Promise<StructuredExtraction> {
    const {
      model = 'gpt-4o-mini',
      brandsToSearch = [],
      minConfidence = 0.7,
      includeInsights = true,
    } = options;

    // TODO: Implement actual LLM function calling
    // For now, return structured format that matches the schema
    // This will be implemented in the next step with actual provider integration

    return {
      mentions: [],
      competitors: [],
      insights: includeInsights ? [] : [],
      metadata: {
        extractionModel: model,
        extractionTimestamp: new Date().toISOString(),
        confidence: 0.8,
        source: 'fresh',
      },
    };
  }

  /**
   * Generate extraction prompt for LLM
   */
  private generateExtractionPrompt(
    responseText: string,
    promptText: string,
    brandsToSearch: string[]
  ): string {
    return `Extract structured information from the following AI response.

Original Prompt: ${promptText}

AI Response:
${responseText}

Please extract:
1. All brand mentions (including variations like "Booking" and "booking.com")
2. Competitors mentioned
3. Key insights and patterns
4. Relationships between brands

Brands to specifically look for: ${brandsToSearch.join(', ') || 'all brands mentioned'}

Return structured JSON with mentions, competitors, and insights.`;
  }

  /**
   * Parse LLM extraction response
   */
  private parseExtractionResponse(llmResponse: string): StructuredExtraction {
    try {
      // Try to parse as JSON
      const parsed = JSON.parse(llmResponse);
      return this.validateAndNormalize(parsed);
    } catch (error) {
      // If not JSON, try to extract JSON from markdown code blocks
      const jsonMatch = llmResponse.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          return this.validateAndNormalize(parsed);
        } catch (e) {
          console.error('[LLMStructuredExtraction] Failed to parse JSON from code block:', e);
        }
      }
      
      // Fallback: return empty extraction
      console.warn('[LLMStructuredExtraction] Failed to parse LLM response, returning empty extraction');
      return {
        mentions: [],
        competitors: [],
        insights: [],
        metadata: {
          extractionModel: 'unknown',
          extractionTimestamp: new Date().toISOString(),
          confidence: 0.0,
          source: 'fresh',
        },
      };
    }
  }

  /**
   * Validate and normalize extraction response
   */
  private validateAndNormalize(parsed: any): StructuredExtraction {
    return {
      mentions: Array.isArray(parsed.mentions)
        ? parsed.mentions.map((m: any) => ({
            brand: String(m.brand || ''),
            canonicalBrand: String(m.canonicalBrand || m.brand || ''),
            context: String(m.context || ''),
            sentiment: ['positive', 'neutral', 'negative'].includes(m.sentiment)
              ? m.sentiment
              : 'neutral',
            relationship: m.relationship || undefined,
            comparison: m.comparison || undefined,
            confidence: Number(m.confidence || 0.7),
            position: m.position ? Number(m.position) : undefined,
            snippet: m.snippet || undefined,
          }))
        : [],
      competitors: Array.isArray(parsed.competitors)
        ? parsed.competitors.map((c: any) => ({
            brand: String(c.brand || ''),
            relationship: c.relationship || 'other',
            mentionCount: Number(c.mentionCount || 0),
            contexts: Array.isArray(c.contexts) ? c.contexts.map(String) : [],
            confidence: Number(c.confidence || 0.7),
          }))
        : [],
      insights: Array.isArray(parsed.insights) ? parsed.insights.map(String) : [],
      metadata: {
        extractionModel: String(parsed.metadata?.extractionModel || 'unknown'),
        extractionTimestamp: String(
          parsed.metadata?.extractionTimestamp || new Date().toISOString()
        ),
        confidence: Number(parsed.metadata?.confidence || 0.8),
        source: (parsed.metadata?.source || 'fresh') as 'cache' | 'fresh',
      },
    };
  }
}


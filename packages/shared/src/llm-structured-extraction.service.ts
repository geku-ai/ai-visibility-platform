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
   * Extract structured data from LLM response using an LLM provider
   * @param responseText - The original LLM response text to extract from
   * @param promptText - The original prompt that generated the response
   * @param askProvider - Function to call an LLM provider (e.g., provider.ask())
   * @param options - Extraction options
   */
  async extract(
    responseText: string,
    promptText: string,
    askProvider: (prompt: string) => Promise<{ answerText: string }>,
    options: ExtractionOptions = {}
  ): Promise<StructuredExtraction> {
    const {
      model = 'gpt-4o-mini',
      brandsToSearch = [],
      minConfidence = 0.7,
      includeInsights = true,
    } = options;

    try {
      // Generate extraction prompt with JSON schema
      const extractionPrompt = this.generateExtractionPrompt(responseText, promptText, brandsToSearch);
      
      // Call LLM provider to extract structured data
      const llmResponse = await askProvider(extractionPrompt);
      
      // Parse the structured response
      const extraction = this.parseExtractionResponse(llmResponse.answerText);
      
      // Filter by minConfidence
      const filteredMentions = extraction.mentions.filter(m => m.confidence >= minConfidence);
      const filteredCompetitors = extraction.competitors.filter(c => c.confidence >= minConfidence);
      
      return {
        mentions: filteredMentions,
        competitors: filteredCompetitors,
        insights: includeInsights ? extraction.insights : [],
        metadata: {
          extractionModel: model,
          extractionTimestamp: new Date().toISOString(),
          confidence: extraction.metadata.confidence,
          source: 'fresh',
        },
      };
    } catch (error) {
      console.error('[LLMStructuredExtraction] Failed to extract structured data:', error);
      // Fallback: return empty extraction
      return this.getEmptyExtraction();
    }
  }

  /**
   * Generate extraction prompt for LLM with JSON schema
   */
  private generateExtractionPrompt(
    responseText: string,
    promptText: string,
    brandsToSearch: string[]
  ): string {
    // Truncate response text if too long to avoid token limits
    const maxResponseLength = 3000;
    const truncatedResponse = responseText.length > maxResponseLength 
      ? responseText.substring(0, maxResponseLength) + '...'
      : responseText;

    return `Extract structured data from this AI response. Return ONLY valid JSON, no markdown, no code blocks, no explanations.

Original Prompt: ${promptText.substring(0, 500)}

AI Response:
${truncatedResponse}

Brands to find: ${brandsToSearch.join(', ') || 'all brands'}

Extract:
1. Mentions: All brand mentions with brand, canonicalBrand, context, sentiment (positive/neutral/negative), relationship (direct_competitor/indirect_competitor/partner/supplier/other), comparison (if any), confidence (0.0-1.0), position, snippet
2. Competitors: Competitor brands with brand, relationship (direct_competitor/indirect_competitor), mentionCount, contexts array, confidence (0.0-1.0)
3. Insights: Array of insight strings

Return this JSON structure only:
{"mentions":[{"brand":"string","canonicalBrand":"string","context":"string","sentiment":"positive|neutral|negative","relationship":"direct_competitor|indirect_competitor|partner|supplier|other|null","comparison":"string|null","confidence":0.0-1.0,"position":number|null,"snippet":"string|null"}],"competitors":[{"brand":"string","relationship":"direct_competitor|indirect_competitor","mentionCount":number,"contexts":["string"],"confidence":0.0-1.0}],"insights":["string"]}

JSON only, no other text.`;
  }

  /**
   * Parse LLM extraction response
   */
  private parseExtractionResponse(llmResponse: string): StructuredExtraction {
    if (!llmResponse || typeof llmResponse !== 'string') {
      console.warn('[LLMStructuredExtraction] Empty or invalid response');
      return this.getEmptyExtraction();
    }

    // Clean the response
    let cleaned = llmResponse.trim();
    
    // Remove markdown code blocks if present
    cleaned = cleaned.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    
    // Try to find JSON object in the response
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }

    try {
      // Try to parse as JSON
      const parsed = JSON.parse(cleaned);
      return this.validateAndNormalize(parsed);
    } catch (error) {
      // Log the actual response for debugging (first 500 chars)
      const preview = cleaned.substring(0, 500);
      console.error('[LLMStructuredExtraction] Failed to parse JSON. Response preview:', preview);
      console.error('[LLMStructuredExtraction] Parse error:', error instanceof Error ? error.message : String(error));
      
      // Try one more time with more aggressive cleaning
      try {
        // Remove any text before first {
        const firstBrace = cleaned.indexOf('{');
        if (firstBrace > 0) {
          cleaned = cleaned.substring(firstBrace);
        }
        // Remove any text after last }
        const lastBrace = cleaned.lastIndexOf('}');
        if (lastBrace > 0 && lastBrace < cleaned.length - 1) {
          cleaned = cleaned.substring(0, lastBrace + 1);
        }
        
        const parsed = JSON.parse(cleaned);
        return this.validateAndNormalize(parsed);
      } catch (e2) {
        console.warn('[LLMStructuredExtraction] Failed to parse LLM response after cleaning, returning empty extraction');
        return this.getEmptyExtraction();
      }
    }
  }

  /**
   * Get empty extraction structure
   */
  private getEmptyExtraction(): StructuredExtraction {
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


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
      return {
        mentions: [],
        competitors: [],
        insights: [],
        metadata: {
          extractionModel: model,
          extractionTimestamp: new Date().toISOString(),
          confidence: 0.0,
          source: 'fresh',
        },
      };
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
    return `You are an expert data extraction system. Extract structured information from the following AI response.

Original Prompt: ${promptText}

AI Response:
${responseText}

Brands to specifically look for: ${brandsToSearch.join(', ') || 'all brands mentioned'}

Extract the following information:
1. **Mentions**: All brand mentions found in the response, including:
   - brand: The exact brand name as mentioned
   - canonicalBrand: Normalized brand name (e.g., "booking.com" -> "Booking")
   - context: Surrounding text/sentence where the brand is mentioned
   - sentiment: "positive", "neutral", or "negative"
   - relationship: "direct_competitor", "indirect_competitor", "partner", "supplier", or "other"
   - comparison: Any comparison made with the brand (if applicable)
   - confidence: Confidence score 0.0-1.0
   - position: Character position in text (if determinable)
   - snippet: A relevant snippet of text (50-100 chars)

2. **Competitors**: Brands that are competitors (direct or indirect):
   - brand: Competitor brand name
   - relationship: "direct_competitor" or "indirect_competitor"
   - mentionCount: Number of times mentioned
   - contexts: Array of context strings where mentioned
   - confidence: Confidence score 0.0-1.0

3. **Insights**: Key insights, patterns, or observations from the response (array of strings)

Return ONLY valid JSON in this exact format:
{
  "mentions": [
    {
      "brand": "string",
      "canonicalBrand": "string",
      "context": "string",
      "sentiment": "positive" | "neutral" | "negative",
      "relationship": "direct_competitor" | "indirect_competitor" | "partner" | "supplier" | "other" | null,
      "comparison": "string" | null,
      "confidence": 0.0-1.0,
      "position": number | null,
      "snippet": "string" | null
    }
  ],
  "competitors": [
    {
      "brand": "string",
      "relationship": "direct_competitor" | "indirect_competitor",
      "mentionCount": number,
      "contexts": ["string"],
      "confidence": 0.0-1.0
    }
  ],
  "insights": ["string"]
}

Return ONLY the JSON object, no markdown, no code blocks, no explanations.`;
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


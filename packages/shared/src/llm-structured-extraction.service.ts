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

    // Use a simpler, more robust format that's easier to parse
    return `Extract brand mentions and competitors from this AI response.

Original Prompt: ${promptText.substring(0, 300)}

AI Response:
${truncatedResponse}

Brands to find: ${brandsToSearch.join(', ') || 'all brands'}

Return a JSON object with this structure. Keep it simple - use null for missing values, keep strings short.

{
  "mentions": [
    {"brand": "BrandName", "canonicalBrand": "BrandName", "context": "short context", "sentiment": "positive|neutral|negative", "relationship": "direct_competitor|indirect_competitor|other", "confidence": 0.9}
  ],
  "competitors": [
    {"brand": "CompetitorName", "relationship": "direct_competitor|indirect_competitor", "mentionCount": 1, "confidence": 0.9}
  ],
  "insights": ["insight 1", "insight 2"]
}

Rules:
- Keep context strings under 100 characters
- Use simple sentiment: positive, neutral, or negative
- Use simple relationship: direct_competitor, indirect_competitor, or other
- Confidence is 0.0 to 1.0
- Return valid JSON only - no markdown, no code blocks`;
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
      // Log the actual response for debugging (first 1000 chars)
      const preview = cleaned.substring(0, 1000);
      console.error('[LLMStructuredExtraction] Failed to parse JSON. Response preview:', preview);
      console.error('[LLMStructuredExtraction] Parse error:', error instanceof Error ? error.message : String(error));
      
      // Try to fix common JSON issues
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
        
        // Fix common escape sequence issues
        // Replace invalid escape sequences with valid ones
        cleaned = cleaned.replace(/\\(?!["\\/bfnrtu])/g, '\\\\'); // Fix invalid escapes
        // Fix broken Unicode escapes (e.g., \u0027 that might be malformed)
        cleaned = cleaned.replace(/\\u([0-9a-fA-F]{0,3})(?![0-9a-fA-F])/g, (match, hex) => {
          // If incomplete Unicode escape, replace with escaped quote
          if (hex.length < 4) {
            return '\\"';
          }
          return match;
        });
        
        // Try to fix truncated arrays/objects by finding the deepest nesting level
        let openBraces = 0;
        let openBrackets = 0;
        let inString = false;
        let escapeNext = false;
        let lastValidIndex = cleaned.length;
        
        for (let i = 0; i < cleaned.length; i++) {
          const char = cleaned[i];
          
          // Track string state (ignore braces/brackets inside strings)
          if (escapeNext) {
            escapeNext = false;
            continue;
          }
          if (char === '\\') {
            escapeNext = true;
            continue;
          }
          if (char === '"' && !escapeNext) {
            inString = !inString;
            continue;
          }
          
          if (!inString) {
            if (char === '{') openBraces++;
            if (char === '}') openBraces--;
            if (char === '[') openBrackets++;
            if (char === ']') openBrackets--;
            
            // If we've closed all braces and brackets, this is a valid end point
            if (openBraces === 0 && openBrackets === 0 && i > 0) {
              lastValidIndex = i + 1;
              break;
            }
          }
        }
        
        // If we have unclosed braces/brackets, try to close them
        if (openBraces > 0 || openBrackets > 0) {
          // Remove incomplete trailing content
          cleaned = cleaned.substring(0, lastValidIndex);
          // Close any remaining open structures
          while (openBrackets > 0) {
            cleaned += ']';
            openBrackets--;
          }
          while (openBraces > 0) {
            cleaned += '}';
            openBraces--;
          }
        }
        
        // Try parsing again
        const parsed = JSON.parse(cleaned);
        return this.validateAndNormalize(parsed);
      } catch (e2) {
        // Last resort: try to extract partial data using regex
        try {
          const partial: any = { mentions: [], competitors: [], insights: [] };
          
          // Try to extract brand names from mentions array even if JSON is broken
          const mentionsPattern = /"mentions"\s*:\s*\[([\s\S]*?)(?:\]|$)/;
          const mentionsMatch = cleaned.match(mentionsPattern);
          if (mentionsMatch) {
            const mentionsText = mentionsMatch[1];
            // Extract brand names using regex
            const brandPattern = /"brand"\s*:\s*"([^"]+)"/g;
            let brandMatch;
            while ((brandMatch = brandPattern.exec(mentionsText)) !== null) {
              const brand = brandMatch[1];
              const sentimentMatch = mentionsText.substring(0, brandMatch.index).match(/"sentiment"\s*:\s*"([^"]+)"/);
              const relationshipMatch = mentionsText.substring(0, brandMatch.index).match(/"relationship"\s*:\s*"([^"]+)"/);
              partial.mentions.push({
                brand,
                canonicalBrand: brand,
                context: '',
                sentiment: sentimentMatch ? sentimentMatch[1] : 'neutral',
                relationship: relationshipMatch ? relationshipMatch[1] : 'other',
                confidence: 0.7,
              });
            }
          }
          
          // Try to extract competitors
          const competitorsPattern = /"competitors"\s*:\s*\[([\s\S]*?)(?:\]|$)/;
          const competitorsMatch = cleaned.match(competitorsPattern);
          if (competitorsMatch) {
            const competitorsText = competitorsMatch[1];
            const brandPattern = /"brand"\s*:\s*"([^"]+)"/g;
            let brandMatch;
            while ((brandMatch = brandPattern.exec(competitorsText)) !== null) {
              const brand = brandMatch[1];
              const relationshipMatch = competitorsText.substring(0, brandMatch.index).match(/"relationship"\s*:\s*"([^"]+)"/);
              partial.competitors.push({
                brand,
                relationship: relationshipMatch ? relationshipMatch[1] : 'other',
                mentionCount: 1,
                confidence: 0.7,
              });
            }
          }
          
          // If we extracted anything, return it
          if (partial.mentions.length > 0 || partial.competitors.length > 0) {
            console.warn('[LLMStructuredExtraction] Extracted partial data from broken JSON:', {
              mentions: partial.mentions.length,
              competitors: partial.competitors.length,
            });
            return this.validateAndNormalize(partial);
          }
        } catch (e3) {
          // Ignore regex extraction errors
        }
        
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


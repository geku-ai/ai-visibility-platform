/**
 * Mention extraction utilities
 * Extracts brand mentions from text with fuzzy matching and context
 */

import { Sentiment } from '@ai-visibility/shared';

export interface Mention {
  brand: string;
  position?: number;
  sentiment: Sentiment;
  snippet: string;
  confidence: number;
}

export interface MentionExtractionOptions {
  allowlist?: string[];
  denylist?: string[];
  contextWindow?: number;
  minConfidence?: number;
  caseSensitive?: boolean;
}

/**
 * Extract brand mentions from text with fuzzy matching
 */
export function extractMentions(
  text: string,
  brands: string[],
  options: MentionExtractionOptions = {}
): Mention[] {
  const {
    allowlist = [],
    denylist = [],
    contextWindow = 120,
    minConfidence = 0.6,
    caseSensitive = false,
  } = options;

  const mentions: Mention[] = [];
  const processedText = caseSensitive ? text : text.toLowerCase();
  
  // Create mapping from lowercase brand to original brand (preserve first occurrence as canonical)
  const brandMap = new Map<string, string>();
  for (const brand of brands) {
    const key = caseSensitive ? brand : brand.toLowerCase();
    if (!brandMap.has(key)) {
      brandMap.set(key, brand);
    }
  }
  
  const processedBrands = caseSensitive ? brands : brands.map(b => b.toLowerCase());

  // Filter brands based on allowlist/denylist
  const filteredBrands = processedBrands.filter(brand => {
    if (allowlist.length > 0 && !allowlist.some(a => a.toLowerCase() === brand)) {
      return false;
    }
    if (denylist.some(d => d.toLowerCase() === brand)) {
      return false;
    }
    return true;
  });

  // Also create variations of brands (e.g., "booking.com" -> "booking", "Booking.com" -> "booking")
  // This helps catch mentions where the domain extension is omitted or the case differs
  const brandVariations = new Set<string>();
  const variationToOriginal = new Map<string, string>();
  
  for (const brand of filteredBrands) {
    brandVariations.add(brand);
    const original = brandMap.get(brand) || brand;
    variationToOriginal.set(brand, original);
    
    // Add domain without extension (e.g., "booking.com" -> "booking")
    const domainMatch = brand.match(/^([^.]+)\./);
    if (domainMatch) {
      const baseDomain = domainMatch[1].toLowerCase();
      if (baseDomain !== brand && baseDomain.length > 2) {
        brandVariations.add(baseDomain);
        variationToOriginal.set(baseDomain, original);
      }
    }
    
    // Add brand without common TLDs
    const withoutTld = brand.replace(/\.(com|net|org|io|co|ai|app)$/, '').toLowerCase();
    if (withoutTld !== brand && withoutTld.length > 2) {
      brandVariations.add(withoutTld);
      variationToOriginal.set(withoutTld, original);
    }
  }

  for (const brand of brandVariations) {
    const mentions_found = findBrandMentions(
      text,
      processedText,
      brand,
      contextWindow,
      minConfidence,
      variationToOriginal
    );
    mentions.push(...mentions_found);
  }

  // Remove duplicates and sort by position
  return deduplicateMentions(mentions).sort((a, b) => (a.position || 0) - (b.position || 0));
}

/**
 * Find mentions of a specific brand in text
 */
function findBrandMentions(
  originalText: string,
  processedText: string,
  brand: string,
  contextWindow: number,
  minConfidence: number,
  brandMap: Map<string, string>
): Mention[] {
  const mentions: Mention[] = [];
  const brandWords = brand.split(/\s+/);
  const textWords = processedText.split(/\s+/);
  
  // Get original brand name from map
  const originalBrand = brandMap.get(brand) || brand;
  
  // Look for exact matches first
  let index = 0;
  while ((index = processedText.indexOf(brand, index)) !== -1) {
    const confidence = calculateExactMatchConfidence(brand, index, processedText);
    if (confidence >= minConfidence) {
      const snippet = extractSnippet(originalText, index, contextWindow);
      const position = getPositionInList(originalText, index);
      const sentiment = analyzeSentiment(snippet);
      
      mentions.push({
        brand: originalBrand,
        position,
        sentiment,
        snippet,
        confidence,
      });
    }
    index += brand.length;
  }

  // Look for fuzzy matches
  for (let i = 0; i < textWords.length - brandWords.length + 1; i++) {
    const window = textWords.slice(i, i + brandWords.length);
    const confidence = calculateFuzzyMatchConfidence(brandWords, window);
    
    if (confidence >= minConfidence) {
      const startIndex = getWordIndexInText(processedText, i);
      const snippet = extractSnippet(originalText, startIndex, contextWindow);
      const position = getPositionInList(originalText, startIndex);
      const sentiment = analyzeSentiment(snippet);
      
      mentions.push({
        brand: originalBrand,
        position,
        sentiment,
        snippet,
        confidence,
      });
    }
  }

  return mentions;
}

/**
 * Calculate confidence for exact matches
 */
function calculateExactMatchConfidence(
  brand: string,
  index: number,
  text: string
): number {
  let confidence = 1.0;
  
  // Check context for brand indicators
  const before = text.substring(Math.max(0, index - 20), index);
  const after = text.substring(index + brand.length, index + brand.length + 20);
  
  // Boost confidence for brand indicators
  const brandIndicators = ['by', 'from', 'using', 'with', 'via', 'powered by'];
  if (brandIndicators.some(indicator => before.includes(indicator))) {
    confidence += 0.1;
  }
  
  // Reduce confidence for common words
  const commonWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for'];
  if (commonWords.includes(brand.toLowerCase())) {
    confidence -= 0.3;
  }
  
  return Math.max(0, Math.min(1, confidence));
}

/**
 * Calculate confidence for fuzzy matches
 */
function calculateFuzzyMatchConfidence(
  brandWords: string[],
  window: string[]
): number {
  if (brandWords.length !== window.length) {
    return 0;
  }
  
  let matches = 0;
  for (let i = 0; i < brandWords.length; i++) {
    if (brandWords[i] === window[i]) {
      matches++;
    } else if (calculateLevenshteinSimilarity(brandWords[i], window[i]) > 0.8) {
      matches += 0.8;
    }
  }
  
  return matches / brandWords.length;
}

/**
 * Calculate Levenshtein similarity between two strings
 */
function calculateLevenshteinSimilarity(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
  
  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + indicator
      );
    }
  }
  
  const distance = matrix[str2.length][str1.length];
  return 1 - (distance / Math.max(str1.length, str2.length));
}

/**
 * Extract snippet with context window
 */
function extractSnippet(text: string, index: number, contextWindow: number): string {
  const start = Math.max(0, index - contextWindow);
  const end = Math.min(text.length, index + contextWindow);
  return text.substring(start, end);
}

/**
 * Get position in ordered list if applicable
 */
function getPositionInList(text: string, index: number): number | undefined {
  // Look for numbered lists
  const beforeText = text.substring(Math.max(0, index - 50), index);
  const match = beforeText.match(/(\d+)\.\s*$/);
  if (match) {
    return parseInt(match[1], 10);
  }
  
  // Look for bullet points
  const bulletMatch = beforeText.match(/^[\s]*[-*]\s*$/);
  if (bulletMatch) {
    // Count bullet points before this one
    const textBefore = text.substring(0, index);
    const bullets = (textBefore.match(/^[\s]*[-*]\s/gm) || []).length;
    return bullets;
  }
  
  return undefined;
}

/**
 * Get word index in text
 */
function getWordIndexInText(text: string, wordIndex: number): number {
  const words = text.split(/\s+/);
  let index = 0;
  for (let i = 0; i < wordIndex && i < words.length; i++) {
    index += words[i].length + 1; // +1 for space
  }
  return index;
}

/**
 * Extract all potential brand/company names from text (not just specific brands)
 * This helps find competitors and other brands mentioned in responses
 */
export function extractAllBrandMentions(
  text: string,
  excludeBrands: string[] = [],
  options: { minLength?: number; contextWindow?: number } = {}
): Mention[] {
  const { minLength = 3, contextWindow = 120 } = options;
  const mentions: Mention[] = [];
  const excludeSet = new Set(excludeBrands.map(b => b.toLowerCase()));
  
  // Pattern 1: Domain names (e.g., "vrbo.com", "booking.com")
  const domainPattern = /\b([a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]\.(?:com|net|org|io|co|ai|app|dev|tv|me|us|uk|ca|au|de|fr|es|it|nl|se|no|dk|fi|pl|cz|hu|ro|gr|pt|ie|be|at|ch|lu|is|ee|lt|lv|sk|si|hr|bg|rs|mk|al|ba|me|md|ua|by|ge|am|az|kz|kg|tj|tm|uz|mn|vn|th|ph|id|my|sg|hk|tw|jp|kr|in|pk|bd|lk|np|mm|kh|la|bn|mo|mn|af|ir|iq|sa|ae|om|ye|kw|qa|bh|jo|lb|sy|il|ps|tr|cy|mt|gi|ad|mc|sm|va|li|fo|gl|ax|sj|bv|tf|hm|gs|pn|tk|nu|nf|cx|cc|aq|um|as|gu|mp|vi|pr|vg|ky|bm|tc|ms|fk|gg|je|im|io|ac|sh|pm|wf|yt|re|bl|mf|gp|mq|nc|pf|tf|gf|pm|yt|re|bl|mf|gp|mq|nc|pf|tf|gf))\b/gi;
  let match;
  while ((match = domainPattern.exec(text)) !== null) {
    const brand = match[1];
    const brandLower = brand.toLowerCase();
    if (!excludeSet.has(brandLower) && brand.length >= minLength) {
      const index = match.index;
      const snippet = extractSnippet(text, index, contextWindow);
      mentions.push({
        brand,
        position: getPositionInList(text, index),
        sentiment: analyzeSentiment(snippet),
        snippet,
        confidence: 0.8, // High confidence for domain names
      });
    }
  }
  
  // Pattern 2: Capitalized brand names (e.g., "Vrbo", "Booking", "Expedia")
  // Look for capitalized words that appear to be brand names (not common words)
  const commonWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how',
    'all', 'each', 'every', 'some', 'any', 'no', 'many', 'much', 'more', 'most', 'few', 'little', 'less', 'least',
    'one', 'two', 'three', 'first', 'second', 'third', 'last', 'next', 'previous', 'other', 'another',
    'here', 'there', 'where', 'everywhere', 'somewhere', 'nowhere', 'anywhere',
    'today', 'yesterday', 'tomorrow', 'now', 'then', 'when', 'before', 'after', 'during', 'while',
    'about', 'above', 'across', 'after', 'against', 'along', 'among', 'around', 'before', 'behind', 'below',
    'beneath', 'beside', 'between', 'beyond', 'during', 'except', 'inside', 'outside', 'through', 'throughout',
    'under', 'underneath', 'until', 'upon', 'within', 'without'
  ]);
  
  // Match capitalized words/phrases that look like brand names
  // Pattern: Start of sentence or after punctuation, followed by capitalized word(s)
  const brandNamePattern = /(?:^|[.!?;:\-–—\s])([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\.[a-z]+)?)(?=\s|$|[.!?;:\-–—,])/g;
  while ((match = brandNamePattern.exec(text)) !== null) {
    const brand = match[1].trim();
    const brandLower = brand.toLowerCase();
    const firstWord = brand.split(/\s+/)[0].toLowerCase();
    
    // Skip if it's a common word, excluded brand, or too short
    if (excludeSet.has(brandLower) || commonWords.has(firstWord) || brand.length < minLength) {
      continue;
    }
    
    // Skip if it looks like a sentence start (common words at start)
    if (commonWords.has(firstWord)) {
      continue;
    }
    
    // Skip if it's a date, number, or other non-brand pattern
    if (/^\d+/.test(brand) || /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(brand)) {
      continue;
    }
    
    const index = match.index + (match[0].length - brand.length);
    const snippet = extractSnippet(text, index, contextWindow);
    
    // Check if this brand was already found (avoid duplicates)
    const existing = mentions.find(m => m.brand.toLowerCase() === brandLower && 
      Math.abs((m.position || 0) - (getPositionInList(text, index) || 0)) < 10);
    if (!existing) {
      mentions.push({
        brand,
        position: getPositionInList(text, index),
        sentiment: analyzeSentiment(snippet),
        snippet,
        confidence: 0.6, // Medium confidence for capitalized words
      });
    }
  }
  
  // Remove duplicates and sort by position
  return deduplicateMentions(mentions).sort((a, b) => (a.position || 0) - (b.position || 0));
}

/**
 * Analyze sentiment of snippet
 */
function analyzeSentiment(snippet: string): Sentiment {
  const positiveWords = ['excellent', 'great', 'best', 'amazing', 'outstanding', 'superior', 'top', 'leading', 'premium', 'advanced'];
  const negativeWords = ['poor', 'worst', 'terrible', 'awful', 'bad', 'inferior', 'cheap', 'basic', 'limited', 'outdated'];
  
  const words = snippet.toLowerCase().split(/\s+/);
  let positiveScore = 0;
  let negativeScore = 0;
  
  for (const word of words) {
    if (positiveWords.includes(word)) positiveScore++;
    if (negativeWords.includes(word)) negativeScore++;
  }
  
  if (positiveScore > negativeScore) return Sentiment.POS;
  if (negativeScore > positiveScore) return Sentiment.NEG;
  return Sentiment.NEU;
}

/**
 * Get original brand name (preserve case)
 * @deprecated Use brandMap parameter in findBrandMentions instead
 */
function getOriginalBrandName(brand: string): string {
  // This function is kept for backward compatibility but is no longer used
  // The brandMap in findBrandMentions now handles preserving original case
  return brand;
}

/**
 * Remove duplicate mentions
 */
function deduplicateMentions(mentions: Mention[]): Mention[] {
  const seen = new Set<string>();
  return mentions.filter(mention => {
    const key = `${mention.brand.toLowerCase()}-${mention.position || 0}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

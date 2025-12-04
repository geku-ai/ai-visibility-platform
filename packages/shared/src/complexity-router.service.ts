/**
 * Complexity Router Service
 * Routes responses to appropriate extractor based on complexity
 * 80% simple (free), 15% medium (cheap), 5% complex (expensive)
 */

export enum ExtractionComplexity {
  SIMPLE = 'simple',    // Rule-based extraction (FREE)
  MEDIUM = 'medium',    // GPT-4o-mini ($0.15/1M tokens)
  COMPLEX = 'complex',  // GPT-4o ($2.50/1M tokens)
}

export interface ComplexityAnalysis {
  complexity: ExtractionComplexity;
  confidence: number;
  reasoning: string;
  estimatedCost: number;
}

export class ComplexityRouterService {
  /**
   * Analyze response complexity
   * Simple heuristics to determine extraction complexity
   */
  analyzeComplexity(responseText: string, promptText: string): ComplexityAnalysis {
    const textLength = responseText.length;
    const wordCount = responseText.split(/\s+/).length;
    
    // Count potential entities (capitalized words, domains, etc.)
    const entityCount = this.countEntities(responseText);
    
    // Check for complex structures (lists, comparisons, relationships)
    const hasComplexStructures = this.hasComplexStructures(responseText);
    
    // Check prompt complexity
    const promptComplexity = this.analyzePromptComplexity(promptText);
    
    // CONSERVATIVE APPROACH: Default to simple unless clearly complex
    // This ensures we use fast, reliable rule-based extraction when possible
    
    // Complex: Only for very long responses with many entities AND complex structures
    if (
      textLength > 3000 &&
      entityCount > 15 &&
      hasComplexStructures &&
      promptComplexity === 'complex'
    ) {
      return {
        complexity: ExtractionComplexity.COMPLEX,
        confidence: 0.80,
        reasoning: 'Very long response with many entities and complex structures, requires advanced LLM',
        estimatedCost: 0.01, // ~$0.01 per response for GPT-4o
      };
    }
    
    // Medium: Only for moderately long responses with some complexity
    if (
      textLength > 1500 &&
      entityCount > 8 &&
      (hasComplexStructures || promptComplexity === 'complex')
    ) {
      return {
        complexity: ExtractionComplexity.MEDIUM,
        confidence: 0.75,
        reasoning: 'Moderate complexity, suitable for cheaper LLM extraction',
        estimatedCost: 0.001, // ~$0.001 per response for GPT-4o-mini
      };
    }
    
    // Simple: Default for most cases (conservative approach)
    // Rule-based extraction is fast, reliable, and free
    return {
      complexity: ExtractionComplexity.SIMPLE,
      confidence: 0.85,
      reasoning: 'Response suitable for rule-based extraction (default for reliability)',
      estimatedCost: 0,
    };
  }

  /**
   * Count potential entities in text
   */
  private countEntities(text: string): number {
    // Count capitalized words (potential brand names)
    const capitalizedWords = (text.match(/\b[A-Z][a-z]+\b/g) || []).length;
    
    // Count domain names
    const domains = (text.match(/\b[a-zA-Z0-9-]+\.[a-zA-Z]{2,}\b/g) || []).length;
    
    // Count quoted strings (potential brand names)
    const quoted = (text.match(/["']([^"']+)["']/g) || []).length;
    
    return capitalizedWords + domains + quoted;
  }

  /**
   * Check for complex structures
   */
  private hasComplexStructures(text: string): boolean {
    // Check for lists
    const hasList = /^\s*[-*•]\s+/m.test(text) || /^\s*\d+\.\s+/m.test(text);
    
    // Check for comparisons
    const hasComparison = /\b(vs|versus|compared to|compared with|better than|worse than)\b/i.test(text);
    
    // Check for relationships
    const hasRelationships = /\b(partner|competitor|supplier|customer|alliance|merger|acquisition)\b/i.test(text);
    
    // Check for multiple sentences with entities
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const sentencesWithEntities = sentences.filter(s => this.countEntities(s) > 0).length;
    const hasMultipleEntitySentences = sentencesWithEntities > 3;
    
    return hasList || hasComparison || hasRelationships || hasMultipleEntitySentences;
  }

  /**
   * Analyze prompt complexity
   */
  private analyzePromptComplexity(promptText: string): 'simple' | 'medium' | 'complex' {
    const length = promptText.length;
    const questionCount = (promptText.match(/\?/g) || []).length;
    const hasMultipleQuestions = questionCount > 1;
    const hasComplexKeywords = /\b(compare|analyze|evaluate|relationship|strategy|trend)\b/i.test(promptText);
    
    if (length > 500 || hasMultipleQuestions || hasComplexKeywords) {
      return 'complex';
    }
    
    if (length > 200 || questionCount > 0) {
      return 'medium';
    }
    
    return 'simple';
  }

  /**
   * Get recommended model for complexity level
   */
  getRecommendedModel(complexity: ExtractionComplexity): string {
    switch (complexity) {
      case ExtractionComplexity.SIMPLE:
        return 'rule-based'; // No LLM needed
      case ExtractionComplexity.MEDIUM:
        return 'gpt-4o-mini'; // Cheap model
      case ExtractionComplexity.COMPLEX:
        return 'gpt-4o'; // Better model
    }
  }

  /**
   * Get cost estimate for extraction
   */
  getCostEstimate(complexity: ExtractionComplexity, responseLength: number): number {
    // Rough estimates based on token counts (1 token ≈ 4 characters)
    const tokens = Math.ceil(responseLength / 4);
    
    switch (complexity) {
      case ExtractionComplexity.SIMPLE:
        return 0; // Free
      case ExtractionComplexity.MEDIUM:
        // GPT-4o-mini: $0.15/1M input tokens, $0.60/1M output tokens
        // Assume 1000 input tokens + 500 output tokens
        return (tokens / 1_000_000) * 0.15 + (tokens / 2_000_000) * 0.60;
      case ExtractionComplexity.COMPLEX:
        // GPT-4o: $2.50/1M input tokens, $10/1M output tokens
        return (tokens / 1_000_000) * 2.50 + (tokens / 2_000_000) * 10;
    }
  }
}


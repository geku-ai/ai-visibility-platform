/**
 * Diagnostic intelligence types for premium GEO analysis
 * These types add interpretation, reasoning, and recommendations to all outputs
 */

export interface DiagnosticInsight {
  type: 'strength' | 'weakness' | 'risk' | 'opportunity' | 'threat';
  category: 'visibility' | 'trust' | 'positioning' | 'competition' | 'technical' | 'content';
  title: string;
  description: string;
  reasoning: string;
  impact: 'high' | 'medium' | 'low';
  confidence: number; // 0-1
  evidence: string[];
  affectedEngines?: string[];
  relatedCompetitors?: string[];
}

export interface DiagnosticRecommendation {
  id: string;
  title: string;
  description: string;
  category: 'schema' | 'content' | 'citations' | 'trust' | 'positioning' | 'technical';
  priority: 'high' | 'medium' | 'low';
  difficulty: 'easy' | 'medium' | 'hard';
  expectedImpact: {
    scoreImprovement?: number; // Points added to GEO score
    visibilityGain?: number; // Percentage
    trustGain?: number; // Percentage
    description: string;
  };
  steps: string[];
  relatedInsights: string[]; // IDs of related insights
  estimatedTime?: string; // e.g., "2 hours", "1 week"
  evidence: string[];
}

export interface EngineReasoning {
  engine: string;
  interpretation: string; // How this engine views the business
  keySignals: string[]; // Signals that influenced the engine's view
  missingSignals: string[]; // Signals that would improve visibility
  trustFactors: string[]; // Trust signals the engine values
  visibilityExplanation: string; // Why visibility succeeded/failed
  competitorPreference?: {
    competitor: string;
    reason: string;
    evidence: string[];
  };
}

/**
 * Comprehensive Visibility Opportunity - AI Search Console Intelligence
 * Each opportunity represents a specific prompt cluster where visibility can be improved
 */
export interface VisibilityOpportunity {
  /** Clean, human-readable opportunity title (e.g., "best online travel agencies for booking hotels") */
  title: string;
  
  /** AI Visibility breakdown per engine + weighted average */
  aiVisibility: {
    chatgpt: number; // 0-100 percentage
    claude: number; // 0-100 percentage
    gemini: number; // 0-100 percentage
    perplexity: number; // 0-100 percentage
    weighted: number; // Weighted average across all engines
  };
  
  /** Current owners (competitors) for this opportunity */
  competitors: Array<{
    name: string; // Competitor brand/domain name
    rankStrength: number; // 0-100, how strong their ranking is
    sentiment: 'positive' | 'neutral' | 'negative';
    evidenceSnippet: string; // Raw evidence snippet from AI response
    engines: {
      chatgpt: number; // Rank position (0 if not found)
      claude: number;
      gemini: number;
      perplexity: number;
    };
    confidence: number; // 0-1 confidence in this competitor data
  }>;
  
  /** Root cause analysis - why you are losing this opportunity */
  whyYouAreLosing: string;
  
  /** Opportunity Impact Score (0-100%) - how much improvement is possible */
  opportunityImpact: number;
  
  /** Difficulty Score (0-100%) - how hard it will be to capture this opportunity */
  difficulty: number;
  
  /** Value Score (0-100%) - adjusted by industry (OTAs → comparison queries high value, etc.) */
  value: number;
  
  /** Concrete, implementable action steps (3-7 items) */
  actionSteps: string[];
  
  /** Raw AI evidence per engine */
  evidence: {
    chatgpt: string[]; // Raw ranking snippets
    claude: string[];
    gemini: string[];
    perplexity: string[];
  };
  
  /** Confidence score (0-1) based on evidence completeness and consistency */
  confidence: number;
  
  /** Warnings if data is thin or unreliable */
  warnings: string[];
  
  /** GEO Score impact estimate */
  geoScoreImpact: {
    min: number; // Minimum points improvement
    max: number; // Maximum points improvement
  };
}

export interface ThreatAssessment {
  type: 'competitor_substitution' | 'visibility_loss' | 'hallucination_risk' | 'misclassification' | 'trust_degradation';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  affectedAreas: string[];
  evidence: string[];
  mitigation: string[];
  relatedCompetitors?: string[];
  relatedPrompts?: string[];
}

export interface CompetitiveThreat {
  competitor: string;
  threatLevel: 'high' | 'medium' | 'low';
  threatAreas: string[]; // e.g., ["high-value prompts", "local search", "trust signals"]
  dominanceReason: string;
  visibilityGap: {
    current: number;
    competitor: number;
    gap: number;
  };
  recommendedActions: string[];
}

export interface DiagnosticBreakdown {
  insights: DiagnosticInsight[];
  strengths: DiagnosticInsight[]; // Filtered insights where type='strength'
  weaknesses: DiagnosticInsight[]; // Filtered insights where type='weakness'
  risks: ThreatAssessment[];
  recommendations: DiagnosticRecommendation[];
  engineReasoning: EngineReasoning[];
  opportunities: VisibilityOpportunity[];
  competitiveThreats: CompetitiveThreat[];
}

// ============================================================================
// NEW INTELLIGENCE ENGINE TYPES
// ============================================================================

/**
 * Commercial Value Impact Analysis
 */
export interface CommercialValueImpact {
  /** Estimated AI visibility value index (0-100) */
  visibilityValueIndex: number;
  /** Projected incremental visibility if fixed (percentage points) */
  projectedVisibilityGain: number;
  /** Projected incremental AI recommendations (count) */
  projectedRecommendationsGain: number;
  /** Relative revenue/commercial upside (scaled 0-100) */
  commercialUpside: number;
  /** Competitor cannibalization risk (0-100) */
  cannibalizationRisk: number;
  /** Engine-by-engine value projection */
  engineValueProjection: {
    chatgpt: number;
    claude: number;
    gemini: number;
    perplexity: number;
  };
  /** High-value multiplier when cross-engine consensus exists */
  crossEngineConsensusMultiplier: number;
  /** Final Commercial Opportunity Score (0-100) */
  commercialOpportunityScore: number;
  /** Evidence backing the analysis */
  evidence: string[];
  /** Confidence in the analysis (0-1) */
  confidence: number;
}

/**
 * LLM Reasoning-Based Prompt Cluster
 */
export interface PromptCluster {
  /** Cluster type */
  type: 'BEST' | 'ALTERNATIVES' | 'COMPARISONS' | 'CATEGORY' | 'LOCAL' | 'HOWTO' | 'TRUST' | 'EXPERT';
  /** Cluster title */
  title: string;
  /** Prompts in this cluster */
  prompts: string[];
  /** Value score (0-100) */
  value: number;
  /** Difficulty score (0-100) */
  difficulty: number;
  /** Cluster visibility average */
  clusterVisibilityAverage: number;
  /** Competitor dominance map */
  competitorDominance: Array<{
    competitor: string;
    dominanceScore: number;
    evidence: string[];
  }>;
  /** Missing trust/signal requirements */
  missingTrustSignals: string[];
  /** Required schema types */
  requiredSchemaTypes: string[];
  /** Content gaps needed to rank */
  contentGaps: string[];
  /** Citations required */
  citationsRequired: number;
  /** Root cause per cluster */
  rootCause: string;
  /** Expected GEO score lift */
  expectedGEOScoreLift: {
    min: number;
    max: number;
  };
  /** Evidence for cluster assignment */
  evidence: string[];
  /** Confidence (0-1) */
  confidence: number;
}

/**
 * Cross-Engine Pattern Recognition
 */
export interface CrossEnginePattern {
  /** Which engines recognize the brand */
  enginesRecognizing: Array<{
    engine: string;
    recognitionScore: number;
    reasoning: string;
    evidence: string[];
  }>;
  /** Which engines suppress the brand */
  enginesSuppressing: Array<{
    engine: string;
    suppressionScore: number;
    reasoning: string;
    evidence: string[];
  }>;
  /** Consistency vs inconsistency pattern */
  consistencyPattern: {
    consistencyScore: number; // 0-100
    consistentEngines: string[];
    inconsistentEngines: string[];
    explanation: string;
  };
  /** Competitor favorability patterns */
  competitorFavorability: Array<{
    competitor: string;
    engines: string[];
    favorabilityScore: number;
    evidence: string[];
  }>;
  /** Latent intent clustering differences */
  intentClusteringDifferences: Array<{
    intent: string;
    engineDifferences: {
      engine: string;
      interpretation: string;
      evidence: string[];
    }[];
  }>;
  /** Cross-engine ranking stability score */
  rankingStabilityScore: number; // 0-100
  /** Conflicting reasoning signals */
  conflictingSignals: Array<{
    engines: string[];
    conflict: string;
    evidence: string[];
  }>;
  /** Missing signals per engine */
  missingSignalsPerEngine: Array<{
    engine: string;
    missingSignals: string[];
    impact: 'high' | 'medium' | 'low';
  }>;
  /** Raw evidence snippets */
  evidence: string[];
  /** Confidence per engine */
  engineConfidence: {
    chatgpt: number;
    claude: number;
    gemini: number;
    perplexity: number;
  };
  /** Pattern-level explanations */
  patternExplanation: string;
}

/**
 * Competitor Advantage & Weakness Analysis
 */
export interface CompetitorAdvantageAnalysis {
  competitor: string;
  /** Factors giving them advantage */
  advantageFactors: Array<{
    factor: string;
    impact: 'high' | 'medium' | 'low';
    evidence: string[];
  }>;
  /** Factors showing weakness */
  weaknessFactors: Array<{
    factor: string;
    impact: 'high' | 'medium' | 'low';
    evidence: string[];
  }>;
  /** Structural advantage score (0-100) */
  structuralAdvantageScore: number;
  /** Structural weakness score (0-100) */
  structuralWeaknessScore: number;
  /** Evidence items */
  evidence: Array<{
    type: 'citation' | 'schema' | 'content' | 'authority' | 'trust' | 'entity';
    description: string;
    source: string;
    confidence: number;
  }>;
  /** Engine-specific competitor strength */
  engineStrength: {
    chatgpt: number;
    claude: number;
    gemini: number;
    perplexity: number;
  };
  /** Historical vs real-time signal interpretation */
  signalInterpretation: {
    historical: {
      strength: number;
      evidence: string[];
    };
    realTime: {
      strength: number;
      evidence: string[];
    };
    trend: 'improving' | 'declining' | 'stable';
  };
  /** What advantage your business can take (short vs long term) */
  yourAdvantageOpportunity: {
    shortTerm: string[];
    longTerm: string[];
    difficulty: number; // 0-100
  };
}

/**
 * Trust Failure Detection
 */
export interface TrustFailure {
  /** Failure category */
  category: 'data_incompleteness' | 'experience_deficiency' | 'missing_authority' | 'missing_trust_signals' | 
            'inconsistent_entity_data' | 'low_citation_density' | 'low_quality_reviews' | 'schema_mismatch' | 
            'brand_instability' | 'conflicting_content' | 'thin_content_coverage' | 'low_semantic_relevance' | 
            'high_competitor_dominance';
  /** Severity (0-100) */
  severity: number;
  /** Confidence (0-1) */
  confidence: number;
  /** Evidence */
  evidence: string[];
  /** Engine-specific notes */
  engineNotes: Array<{
    engine: string;
    note: string;
    impact: 'high' | 'medium' | 'low';
  }>;
  /** Description of the failure */
  description: string;
  /** Recommended fixes */
  recommendedFixes: string[];
}

/**
 * Fix Difficulty Analysis
 */
export interface FixDifficultyAnalysis {
  /** Overall difficulty score (0-100) */
  difficultyScore: number;
  /** Difficulty breakdown by dimension */
  difficultyBreakdown: {
    content: {
      score: number; // 0-100
      factors: string[];
      timeEstimate: string;
    };
    schema: {
      score: number;
      factors: string[];
      timeEstimate: string;
    };
    citation: {
      score: number;
      factors: string[];
      timeEstimate: string;
    };
    trust: {
      score: number;
      factors: string[];
      timeEstimate: string;
    };
    competitive: {
      score: number;
      factors: string[];
      timeEstimate: string;
    };
    technical: {
      score: number;
      factors: string[];
      timeEstimate: string;
    };
  };
  /** Primary constraints */
  primaryConstraints: string[];
  /** Secondary constraints */
  secondaryConstraints: string[];
  /** Overall time estimate */
  timeEstimate: string;
  /** Confidence (0-1) */
  confidence: number;
  /** Evidence */
  evidence: string[];
}

/**
 * Enhanced PremiumResponse with diagnostic intelligence
 * Note: EvidenceItem is defined in premium-response.types.ts to avoid circular dependencies
 */
export interface DiagnosticPremiumResponse<T> {
  data: T;
  evidence: any[]; // EvidenceItem[] - defined in premium-response.types.ts
  confidence: number;
  warnings: string[];
  explanation: string;
  // Diagnostic intelligence layer
  diagnostics: DiagnosticBreakdown;
  metadata?: {
    generatedAt: Date;
    serviceVersion?: string;
    industry?: string;
    missingData?: string[];
  };
}


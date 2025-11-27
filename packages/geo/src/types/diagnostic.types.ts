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


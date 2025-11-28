/**
 * DTOs for GEO Intelligence API endpoints
 * Backend-only types for request/response validation
 * 
 * All DTOs match the actual service return types from @ai-visibility/geo
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { 
  GEOIntelligenceResponse, 
  VisibilityOpportunity, 
  EnhancedRecommendation,
  CommercialValueImpact,
  PromptCluster,
  CrossEnginePattern,
  CompetitorAdvantageAnalysis,
  TrustFailure,
  FixDifficultyAnalysis,
} from '@ai-visibility/geo';

/**
 * Error response structure
 */
export class ErrorResponseDto {
  @ApiProperty({ example: 'INTERNAL_ERROR' })
  code: 'INTERNAL_ERROR' | 'VALIDATION_ERROR' | 'MISSING_WORKSPACE' | 'DATA_UNAVAILABLE';

  @ApiProperty({ example: 'Human-readable error message' })
  message: string;

  @ApiPropertyOptional({ example: {} })
  details?: Record<string, any>;
}

/**
 * Warning structure
 */
export class WarningDto {
  @ApiProperty({ example: 'CommercialValueImpactService' })
  source: string;

  @ApiProperty({ example: 'Skipped due to rate-limit from upstream engine' })
  message: string;
}

/**
 * Metadata structure
 */
export class MetadataDto {
  @ApiProperty({ example: '2025-11-26T12:00:00Z' })
  generatedAt: string;

  @ApiProperty({ example: '2.0.0' })
  serviceVersion: string;

  @ApiProperty({ example: 'travel' })
  industry: string;

  @ApiProperty({ example: 0.88 })
  confidence: number;

  @ApiProperty({ type: [WarningDto], required: false })
  warnings?: WarningDto[];

  @ApiProperty({ type: [ErrorResponseDto], required: false })
  errors?: ErrorResponseDto[];

  @ApiProperty({ required: false })
  total?: number;

  @ApiProperty({ required: false })
  highPriorityCount?: number;
}

/**
 * Commercial Value Impact DTO (matches CommercialValueImpact interface)
 */
export class CommercialValueImpactDto implements CommercialValueImpact {
  @ApiProperty({ example: 75 })
  visibilityValueIndex: number;

  @ApiProperty({ example: 15.5 })
  projectedVisibilityGain: number;

  @ApiProperty({ example: 8 })
  projectedRecommendationsGain: number;

  @ApiProperty({ example: 65 })
  commercialUpside: number;

  @ApiProperty({ example: 25 })
  cannibalizationRisk: number;

  @ApiProperty()
  engineValueProjection: {
    chatgpt: number;
    claude: number;
    gemini: number;
    perplexity: number;
  };

  @ApiProperty({ example: 1.2 })
  crossEngineConsensusMultiplier: number;

  @ApiProperty({ example: 80 })
  commercialOpportunityScore: number;

  @ApiProperty({ type: [String] })
  evidence: string[];

  @ApiProperty({ example: 0.85 })
  confidence: number;
}

/**
 * Prompt Cluster DTO (matches PromptCluster interface)
 */
export class PromptClusterDto implements PromptCluster {
  @ApiProperty({ enum: ['BEST', 'ALTERNATIVES', 'COMPARISONS', 'CATEGORY', 'LOCAL', 'HOWTO', 'TRUST', 'EXPERT'] })
  type: 'BEST' | 'ALTERNATIVES' | 'COMPARISONS' | 'CATEGORY' | 'LOCAL' | 'HOWTO' | 'TRUST' | 'EXPERT';

  @ApiProperty({ example: 'Best online travel agencies' })
  title: string;

  @ApiProperty({ type: [String] })
  prompts: string[];

  @ApiProperty({ example: 85 })
  value: number;

  @ApiProperty({ example: 60 })
  difficulty: number;

  @ApiProperty({ example: 45 })
  clusterVisibilityAverage: number;

  @ApiProperty({ type: [Object] })
  competitorDominance: Array<{
    competitor: string;
    dominanceScore: number;
    evidence: string[];
  }>;

  @ApiProperty({ type: [String] })
  missingTrustSignals: string[];

  @ApiProperty({ type: [String] })
  requiredSchemaTypes: string[];

  @ApiProperty({ type: [String] })
  contentGaps: string[];

  @ApiProperty({ example: 5 })
  citationsRequired: number;

  @ApiProperty({ example: 'Missing authoritative citations' })
  rootCause: string;

  @ApiProperty()
  expectedGEOScoreLift: {
    min: number;
    max: number;
  };

  @ApiProperty({ type: [String] })
  evidence: string[];

  @ApiProperty({ example: 0.8 })
  confidence: number;
}

/**
 * Cross-Engine Pattern DTO (matches CrossEnginePattern interface)
 */
export class CrossEnginePatternDto implements CrossEnginePattern {
  @ApiProperty({ type: [Object] })
  enginesRecognizing: Array<{
    engine: string;
    recognitionScore: number;
    reasoning: string;
    evidence: string[];
  }>;

  @ApiProperty({ type: [Object] })
  enginesSuppressing: Array<{
    engine: string;
    suppressionScore: number;
    reasoning: string;
    evidence: string[];
  }>;

  @ApiProperty()
  consistencyPattern: {
    consistencyScore: number;
    consistentEngines: string[];
    inconsistentEngines: string[];
    explanation: string;
  };

  @ApiProperty({ type: [Object] })
  competitorFavorability: Array<{
    competitor: string;
    engines: string[];
    favorabilityScore: number;
    evidence: string[];
  }>;

  @ApiProperty({ type: [Object] })
  intentClusteringDifferences: Array<{
    intent: string;
    engineDifferences: {
      engine: string;
      interpretation: string;
      evidence: string[];
    }[];
  }>;

  @ApiProperty({ example: 75 })
  rankingStabilityScore: number;

  @ApiProperty({ type: [Object] })
  conflictingSignals: Array<{
    engines: string[];
    conflict: string;
    evidence: string[];
  }>;

  @ApiProperty({ type: [Object] })
  missingSignalsPerEngine: Array<{
    engine: string;
    missingSignals: string[];
    impact: 'high' | 'medium' | 'low';
  }>;

  @ApiProperty({ type: [String] })
  evidence: string[];

  @ApiProperty()
  engineConfidence: {
    chatgpt: number;
    claude: number;
    gemini: number;
    perplexity: number;
  };

  @ApiProperty({ example: 'Brand shows consistent recognition across ChatGPT and Claude' })
  patternExplanation: string;
}

/**
 * Competitor Advantage Analysis DTO (matches CompetitorAdvantageAnalysis interface)
 */
export class CompetitorAdvantageAnalysisDto implements CompetitorAdvantageAnalysis {
  @ApiProperty({ example: 'Expedia' })
  competitor: string;

  @ApiProperty({ type: [Object] })
  advantageFactors: Array<{
    factor: string;
    impact: 'high' | 'medium' | 'low';
    evidence: string[];
  }>;

  @ApiProperty({ type: [Object] })
  weaknessFactors: Array<{
    factor: string;
    impact: 'high' | 'medium' | 'low';
    evidence: string[];
  }>;

  @ApiProperty({ example: 75 })
  structuralAdvantageScore: number;

  @ApiProperty({ example: 30 })
  structuralWeaknessScore: number;

  @ApiProperty({ type: [Object] })
  evidence: Array<{
    type: 'citation' | 'schema' | 'content' | 'authority' | 'trust' | 'entity';
    description: string;
    source: string;
    confidence: number;
  }>;

  @ApiProperty()
  engineStrength: {
    chatgpt: number;
    claude: number;
    gemini: number;
    perplexity: number;
  };

  @ApiProperty()
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

  @ApiProperty()
  yourAdvantageOpportunity: {
    shortTerm: string[];
    longTerm: string[];
    difficulty: number;
  };
}

/**
 * Trust Failure DTO (matches TrustFailure interface)
 */
export class TrustFailureDto implements TrustFailure {
  @ApiProperty({ 
    enum: [
      'data_incompleteness', 'experience_deficiency', 'missing_authority', 'missing_trust_signals',
      'inconsistent_entity_data', 'low_citation_density', 'low_quality_reviews', 'schema_mismatch',
      'brand_instability', 'conflicting_content', 'thin_content_coverage', 'low_semantic_relevance',
      'high_competitor_dominance'
    ]
  })
  category: TrustFailure['category'];

  @ApiProperty({ example: 75 })
  severity: number;

  @ApiProperty({ example: 0.85 })
  confidence: number;

  @ApiProperty({ type: [String] })
  evidence: string[];

  @ApiProperty({ type: [Object] })
  engineNotes: Array<{
    engine: string;
    note: string;
    impact: 'high' | 'medium' | 'low';
  }>;

  @ApiProperty({ example: 'Missing authoritative citations from top industry publications' })
  description: string;

  @ApiProperty({ type: [String] })
  recommendedFixes: string[];
}

/**
 * Fix Difficulty Analysis DTO (matches FixDifficultyAnalysis interface)
 */
export class FixDifficultyAnalysisDto implements FixDifficultyAnalysis {
  @ApiProperty({ example: 65 })
  difficultyScore: number;

  @ApiProperty()
  difficultyBreakdown: {
    content: {
      score: number;
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

  @ApiProperty({ type: [String] })
  primaryConstraints: string[];

  @ApiProperty({ type: [String] })
  secondaryConstraints: string[];

  @ApiProperty({ example: '2-4 weeks' })
  timeEstimate: string;

  @ApiProperty({ example: 0.8 })
  confidence: number;

  @ApiProperty({ type: [String] })
  evidence: string[];
}

/**
 * Full Intelligence Response DTO
 * Note: Does not implement GEOIntelligenceResponse directly due to Date/string mismatch in metadata
 * The controller converts Date to string for JSON serialization
 */
export class GEOIntelligenceResponseDto {
  @ApiProperty()
  workspaceId: string;

  @ApiProperty()
  brandName: string;

  @ApiProperty()
  domain: string;

  @ApiProperty()
  industry: {
    primary: string;
    secondary: string[];
    confidence: number;
    evidence: any;
  };

  @ApiProperty()
  businessSummary: any;

  @ApiProperty({ type: [Object] })
  prompts: Array<{
    text: string;
    intent: string;
    commercialValue: number;
    industryRelevance: number;
    evidence?: any;
  }>;

  @ApiProperty({ type: [PromptClusterDto] })
  promptClusters: PromptClusterDto[];

  @ApiProperty({ type: [Object] })
  competitors: Array<{
    brandName: string;
    domain: string;
    type: string;
    confidence: number;
    visibility: any;
  }>;

  @ApiProperty({ type: [Object] })
  sovAnalysis: any[];

  @ApiProperty()
  citations: any;

  @ApiProperty({ type: [CommercialValueImpactDto] })
  commercialValues: CommercialValueImpactDto[];

  @ApiProperty({ type: CrossEnginePatternDto })
  crossEnginePatterns: CrossEnginePatternDto;

  @ApiProperty({ type: [CompetitorAdvantageAnalysisDto] })
  competitorAnalyses: CompetitorAdvantageAnalysisDto[];

  @ApiProperty({ type: [TrustFailureDto] })
  trustFailures: TrustFailureDto[];

  @ApiProperty({ type: [FixDifficultyAnalysisDto] })
  fixDifficulties: FixDifficultyAnalysisDto[];

  @ApiProperty()
  geoScore: {
    overall: number;
    breakdown: any;
    improvementPaths: Array<{
      opportunity: string;
      impact: { min: number; max: number };
      difficulty: number;
    }>;
    explanation: string;
  };

  @ApiProperty({ type: [Object] })
  opportunities: VisibilityOpportunity[];

  @ApiProperty({ type: [Object] })
  recommendations: EnhancedRecommendation[];

  @ApiProperty({ type: MetadataDto })
  metadata: MetadataDto;
}

/**
 * Opportunities Response
 */
export class OpportunitiesResponseDto {
  @ApiProperty()
  workspaceId: string;

  @ApiProperty()
  domain: string;

  @ApiProperty()
  industry: {
    primary: string;
    confidence: number;
  };

  @ApiProperty({ type: [Object] })
  opportunities: VisibilityOpportunity[];

  @ApiProperty({ type: MetadataDto })
  metadata: MetadataDto;
}

/**
 * Recommendations Response
 */
export class RecommendationsResponseDto {
  @ApiProperty()
  workspaceId: string;

  @ApiProperty()
  domain: string;

  @ApiProperty({ type: [Object] })
  recommendations: EnhancedRecommendation[];

  @ApiProperty({ type: MetadataDto })
  metadata: MetadataDto;
}

/**
 * Query parameters for intelligence endpoint
 */
export class IntelligenceQueryDto {
  @ApiPropertyOptional({ default: false, description: 'Force recompute vs cached' })
  refresh?: boolean;
}

/**
 * Query parameters for opportunities endpoint
 */
export class OpportunitiesQueryDto {
  @ApiPropertyOptional({ default: 50, maximum: 200, description: 'Number of opportunities to return' })
  limit?: number;

  @ApiPropertyOptional({ default: 0, description: 'Offset for pagination' })
  offset?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, description: 'Minimum impact score' })
  minImpact?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, description: 'Maximum difficulty score' })
  maxDifficulty?: number;

  @ApiPropertyOptional({ enum: ['chatgpt', 'claude', 'gemini', 'perplexity'], description: 'Filter by engine' })
  engine?: 'chatgpt' | 'claude' | 'gemini' | 'perplexity';

  @ApiPropertyOptional({ enum: ['visibility', 'trust', 'schema', 'content', 'citations'], description: 'Filter by type' })
  type?: 'visibility' | 'trust' | 'schema' | 'content' | 'citations';
}

/**
 * Query parameters for recommendations endpoint
 */
export class RecommendationsQueryDto {
  @ApiPropertyOptional({ enum: ['critical', 'high', 'medium', 'low'], description: 'Filter by priority' })
  priority?: 'critical' | 'high' | 'medium' | 'low';

  @ApiPropertyOptional({ enum: ['content', 'schema', 'citations', 'trust', 'technical', 'positioning', 'competitor'], description: 'Filter by category' })
  category?: 'content' | 'schema' | 'citations' | 'trust' | 'technical' | 'positioning' | 'competitor';

  @ApiPropertyOptional({ minimum: 0, maximum: 100, description: 'Maximum difficulty' })
  maxDifficulty?: number;

  @ApiPropertyOptional({ default: 50, description: 'Number of recommendations to return' })
  limit?: number;

  @ApiPropertyOptional({ default: 0, description: 'Offset for pagination' })
  offset?: number;
}

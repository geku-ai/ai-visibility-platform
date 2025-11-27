/**
 * DTOs for GEO Intelligence API endpoints
 * Backend-only types for request/response validation
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GEOIntelligenceResponse, VisibilityOpportunity, EnhancedRecommendation } from '@ai-visibility/geo';

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
 * Full Intelligence Response
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

  @ApiProperty({ type: [Object] })
  promptClusters: any[];

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

  @ApiProperty({ type: [Object] })
  commercialValues: any[];

  @ApiProperty()
  crossEnginePatterns: any;

  @ApiProperty({ type: [Object] })
  competitorAnalyses: any[];

  @ApiProperty({ type: [Object] })
  trustFailures: any[];

  @ApiProperty({ type: [Object] })
  fixDifficulties: any[];

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


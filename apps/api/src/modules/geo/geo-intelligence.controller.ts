/**
 * GEO Intelligence Controller
 * 
 * Provides endpoints for comprehensive GEO intelligence analysis.
 * Backend-only - returns structured JSON responses.
 */

import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../guards/workspace-access.guard';
import { GetWorkspaceId } from '../../decorators/workspace-id.decorator';
import {
  GEOIntelligenceOrchestrator,
  VisibilityOpportunitiesService,
  EnhancedRecommendationService,
  OrchestrationValidatorService,
} from '@ai-visibility/geo';
import { PrismaService } from '../database/prisma.service';
import {
  GEOIntelligenceResponseDto,
  OpportunitiesResponseDto,
  RecommendationsResponseDto,
  IntelligenceQueryDto,
  OpportunitiesQueryDto,
  RecommendationsQueryDto,
  ErrorResponseDto,
  WarningDto,
} from './dto/geo-intelligence.dto';

@ApiTags('GEO Intelligence')
@ApiBearerAuth()
@Controller('geo')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class GEOIntelligenceController {
  private readonly logger = new Logger(GEOIntelligenceController.name);
  private readonly cache = new Map<string, { data: any; expiresAt: number }>();

  constructor(
    private readonly orchestrator: GEOIntelligenceOrchestrator,
    private readonly opportunitiesService: VisibilityOpportunitiesService,
    private readonly recommendationsService: EnhancedRecommendationService,
    private readonly validator: OrchestrationValidatorService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Get full GEO intelligence analysis
   * GET /v1/geo/intelligence/:workspaceId
   */
  @Get('intelligence/:workspaceId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get comprehensive GEO intelligence analysis',
    description: 'Returns full intelligence analysis including industry, prompts, clusters, competitors, SOV, citations, commercial value, patterns, trust failures, opportunities, and recommendations.',
  })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiQuery({ name: 'refresh', required: false, type: Boolean, description: 'Force recompute vs cached (default: false)' })
  @ApiResponse({
    status: 200,
    description: 'Full intelligence analysis returned successfully',
    type: GEOIntelligenceResponseDto,
  })
  @ApiResponse({
    status: 206,
    description: 'Partial results returned (some subsystems failed)',
    type: GEOIntelligenceResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    schema: {
      type: 'object',
      properties: {
        error: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
            details: { type: 'object' },
          },
        },
      },
    },
  })
  async getIntelligence(
    @Param('workspaceId') workspaceId: string,
    @Query() query: IntelligenceQueryDto,
  ): Promise<GEOIntelligenceResponseDto | { error: ErrorResponseDto }> {
    try {
      // Validate workspace
      await this.validateWorkspace(workspaceId);

      // Get workspace context
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, domain: true, brandName: true },
      });

      if (!workspace) {
        throw new Error('Workspace not found');
      }

      const brandName = workspace.brandName || 'Unknown';
      const domain = workspace.domain || '';

      // Check cache (TTL: 5 minutes)
      // Cache key includes workspaceId and refresh flag to ensure proper isolation
      const cacheKey = this.generateCacheKey('intelligence', workspaceId, { refresh: query.refresh });
      if (!query.refresh && this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey)!;
        if (cached.expiresAt > Date.now()) {
          this.logger.log(`[Cache HIT] Returning cached intelligence for workspace ${workspaceId}`);
          return cached.data;
        }
        this.cache.delete(cacheKey);
        this.logger.log(`[Cache EXPIRED] Cache entry expired for workspace ${workspaceId}`);
      } else if (query.refresh) {
        this.logger.log(`[Cache BYPASS] Refresh requested, bypassing cache for workspace ${workspaceId}`);
      } else {
        this.logger.log(`[Cache MISS] No cache entry for workspace ${workspaceId}`);
      }

      // Run orchestrator with error handling and performance tracking
      const startTime = Date.now();
      const warnings: WarningDto[] = [];
      const errors: ErrorResponseDto[] = [];

      let intelligence: GEOIntelligenceResponseDto;

      try {
        const rawIntelligence = await this.orchestrator.orchestrateIntelligence(
          workspaceId,
          brandName,
          domain,
          {
            includeOpportunities: true,
            includeRecommendations: true,
            maxOpportunities: 50,
          }
        );
        
        // Validate response quality
        const validation = this.validator.validateIntelligenceResponse(rawIntelligence);
        if (!validation.valid) {
          errors.push(...validation.errors.map(e => ({
            code: 'DATA_UNAVAILABLE' as const,
            message: `Validation error: ${e}`,
            details: { field: e },
          })));
        }
        warnings.push(...validation.warnings.map(w => ({
          source: 'OrchestrationValidator',
          message: w,
        })));

        // Data quality check
        const qualityCheck = this.validator.validateDataQuality(rawIntelligence);
        if (!qualityCheck.meetsThreshold) {
          warnings.push(...qualityCheck.issues.map(issue => ({
            source: 'DataQualityValidator',
            message: issue,
          })));
        }
        
        // Convert to DTO format (Date to string, ensure metadata has all fields)
        intelligence = {
          ...rawIntelligence,
          metadata: {
            ...rawIntelligence.metadata,
            generatedAt: rawIntelligence.metadata.generatedAt instanceof Date 
              ? rawIntelligence.metadata.generatedAt.toISOString()
              : rawIntelligence.metadata.generatedAt,
            industry: rawIntelligence.metadata.industry || rawIntelligence.industry?.primary || 'Unknown',
            warnings: warnings.length > 0 ? warnings : undefined,
            errors: errors.length > 0 ? errors : undefined,
          },
        } as GEOIntelligenceResponseDto;

        const duration = Date.now() - startTime;
        this.logger.log(`[Performance] Intelligence orchestration completed in ${duration}ms`);
      } catch (error) {
        this.logger.error(`[Error] Orchestrator failed: ${error instanceof Error ? error.message : String(error)}`);
        
        // Try to get partial results
        try {
          // Fallback: try to get at least some data
          intelligence = await this.getPartialIntelligence(workspaceId, brandName, domain, warnings, errors);
        } catch (fallbackError) {
          const duration = Date.now() - startTime;
          this.logger.error(`[Error] Fallback also failed after ${duration}ms: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
          return {
            error: {
              code: 'INTERNAL_ERROR',
              message: `Failed to generate intelligence: ${error instanceof Error ? error.message : String(error)}`,
              details: {
                workspaceId,
                originalError: error instanceof Error ? error.message : String(error),
                fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
              },
            },
          };
        }
      }

      // Add warnings and errors to metadata if not already present
      if (warnings.length > 0 || errors.length > 0) {
        intelligence.metadata.warnings = warnings;
        intelligence.metadata.errors = errors;
      }

      // Cache result (TTL: 5 minutes = 300,000ms)
      // Only cache successful responses (no errors)
      if (errors.length === 0) {
        this.cache.set(cacheKey, {
          data: intelligence,
          expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
        });
        this.logger.log(`[Cache SET] Cached intelligence for workspace ${workspaceId} (expires in 5 minutes)`);
      } else {
        this.logger.warn(`[Cache SKIP] Not caching response with errors for workspace ${workspaceId}`);
      }

      // Return 206 if partial (has errors), 200 if complete
      // Note: NestJS will use the @HttpCode decorator, but we log the intended status
      if (errors.length > 0) {
        this.logger.warn(`[Partial] Returning partial results with ${errors.length} errors for workspace ${workspaceId}`);
      }
      
      return intelligence;
    } catch (error) {
      this.logger.error(`Failed to get intelligence: ${error instanceof Error ? error.message : String(error)}`);
      return {
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : String(error),
          details: { workspaceId },
        },
      };
    }
  }

  /**
   * Get visibility opportunities
   * GET /v1/geo/opportunities/:workspaceId
   */
  @Get('opportunities/:workspaceId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get visibility opportunities',
    description: 'Returns visibility opportunities with filtering and pagination support.',
  })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiResponse({
    status: 200,
    description: 'Opportunities returned successfully',
    type: OpportunitiesResponseDto,
  })
  async getOpportunities(
    @Param('workspaceId') workspaceId: string,
    @Query() query: OpportunitiesQueryDto,
  ): Promise<OpportunitiesResponseDto | { error: ErrorResponseDto }> {
    try {
      await this.validateWorkspace(workspaceId);

      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, domain: true, brandName: true },
      });

      if (!workspace) {
        throw new Error('Workspace not found');
      }

      const brandName = workspace.brandName || 'Unknown';
      const domain = workspace.domain || '';

      // Generate opportunities
      const opportunities = await this.opportunitiesService.generateOpportunities(
        workspaceId,
        brandName,
        domain,
        {
          maxOpportunities: query.limit || 50,
          minValueScore: query.minImpact || 20,
          includeLowConfidence: false,
        }
      );

      // Apply filters
      let filtered = opportunities;

      if (query.maxDifficulty !== undefined) {
        filtered = filtered.filter(o => o.difficulty <= query.maxDifficulty!);
      }

      if (query.engine) {
        filtered = filtered.filter(o => {
          const engineKey = query.engine!;
          return o.aiVisibility[engineKey] !== undefined;
        });
      }

      // Apply pagination
      const offset = query.offset || 0;
      const limit = Math.min(query.limit || 50, 200);
      const paginated = filtered.slice(offset, offset + limit);

      // Get industry for response
      let industry = 'Unknown';
      try {
        const workspace = await this.prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: { industry: true },
        });
        industry = workspace?.industry || 'Unknown';
      } catch (error) {
        this.logger.warn(`Could not fetch industry: ${error instanceof Error ? error.message : String(error)}`);
      }

      return {
        workspaceId,
        domain,
        industry: {
          primary: industry,
          confidence: 0.8,
        },
        opportunities: paginated,
        metadata: {
          generatedAt: new Date().toISOString(),
          serviceVersion: '2.0.0',
          industry: industry,
          confidence: this.calculateAverageConfidence(paginated),
          warnings: [],
        },
      };
    } catch (error) {
      this.logger.error(`Failed to get opportunities: ${error instanceof Error ? error.message : String(error)}`);
      return {
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : String(error),
          details: { workspaceId },
        },
      };
    }
  }

  /**
   * Get recommendations
   * GET /v1/recommendations/:workspaceId
   */
  @Get('recommendations/:workspaceId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get enhanced recommendations',
    description: 'Returns actionable recommendations with filtering and pagination support.',
  })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiResponse({
    status: 200,
    description: 'Recommendations returned successfully',
    type: RecommendationsResponseDto,
  })
  async getRecommendations(
    @Param('workspaceId') workspaceId: string,
    @Query() query: RecommendationsQueryDto,
  ): Promise<RecommendationsResponseDto | { error: ErrorResponseDto }> {
    try {
      await this.validateWorkspace(workspaceId);

      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, domain: true, brandName: true },
      });

      if (!workspace) {
        throw new Error('Workspace not found');
      }

      const brandName = workspace.brandName || 'Unknown';

      // Get full intelligence context for recommendations
      // In production, this could be cached or passed differently
      const intelligence = await this.orchestrator.orchestrateIntelligence(
        workspaceId,
        brandName,
        workspace.domain || '',
        {
          includeOpportunities: true,
          includeRecommendations: false, // We'll generate them separately
          maxOpportunities: 20,
        }
      );

      // Generate recommendations
      const recommendations = await this.recommendationsService.generateEnhancedRecommendations(
        workspaceId,
        brandName,
        {
          trustFailures: intelligence.trustFailures,
          competitorAnalyses: intelligence.competitorAnalyses,
          promptClusters: intelligence.promptClusters,
          fixDifficulties: intelligence.fixDifficulties,
          commercialValues: intelligence.commercialValues,
          geoScore: intelligence.geoScore,
        }
      );

      // Apply filters
      let filtered = recommendations;

      if (query.priority) {
        filtered = filtered.filter(r => r.priority === query.priority);
      }

      if (query.category) {
        filtered = filtered.filter(r => r.category === query.category);
      }

      if (query.maxDifficulty !== undefined) {
        const difficultyMap: Record<string, number> = { easy: 30, medium: 60, hard: 90 };
        const maxDiff = typeof query.maxDifficulty === 'string' 
          ? (difficultyMap[query.maxDifficulty] || query.maxDifficulty)
          : query.maxDifficulty;
        filtered = filtered.filter(r => {
          const rDiff = difficultyMap[r.difficulty] || 50;
          return rDiff <= maxDiff;
        });
      }

      // Apply pagination
      const offset = query.offset || 0;
      const limit = query.limit || 50;
      const paginated = filtered.slice(offset, offset + limit);

      // Count by priority
      const highPriorityCount = filtered.filter(r => r.priority === 'high' || r.priority === 'critical').length;

      return {
        workspaceId,
        domain: workspace.domain || '',
        recommendations: paginated,
        metadata: {
          generatedAt: new Date().toISOString(),
          serviceVersion: '2.0.0',
          industry: 'Unknown',
          total: filtered.length,
          highPriorityCount,
          confidence: this.calculateAverageConfidence(paginated),
          warnings: [],
        },
      };
    } catch (error) {
      this.logger.error(`Failed to get recommendations: ${error instanceof Error ? error.message : String(error)}`);
      return {
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : String(error),
          details: { workspaceId },
        },
      };
    }
  }

  /**
   * Validate workspace exists
   */
  private async validateWorkspace(workspaceId: string): Promise<void> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    });

    if (!workspace) {
      throw new Error('Workspace not found');
    }
  }

  /**
   * Get partial intelligence when orchestrator fails
   */
  private async getPartialIntelligence(
    workspaceId: string,
    brandName: string,
    domain: string,
    warnings: WarningDto[],
    errors: ErrorResponseDto[]
  ): Promise<GEOIntelligenceResponseDto> {
    // Try to get at least basic data
    const industry = { primary: 'Unknown', secondary: [], confidence: 0, evidence: {} };
    const businessSummary = {};
    const prompts: any[] = [];
    const promptClusters: any[] = [];
    const competitors: any[] = [];
    const sovAnalysis: any[] = [];
    const citations = {};
    const commercialValues: any[] = [];
    const crossEnginePatterns = {} as any;
    const competitorAnalyses: any[] = [];
    const trustFailures: any[] = [];
    const fixDifficulties: any[] = [];
    const opportunities: any[] = [];
    const recommendations: any[] = [];

    warnings.push({
      source: 'GEOIntelligenceOrchestrator',
      message: 'Full orchestration failed, returning partial results',
    });

    return {
      workspaceId,
      brandName,
      domain,
      industry,
      businessSummary,
      prompts,
      promptClusters,
      competitors,
      sovAnalysis,
      citations,
      commercialValues,
      crossEnginePatterns,
      competitorAnalyses,
      trustFailures,
      fixDifficulties,
      geoScore: {
        overall: 0,
        breakdown: {},
        improvementPaths: [],
        explanation: 'Unable to compute GEO Score due to errors',
      },
      opportunities,
      recommendations,
      metadata: {
        generatedAt: new Date().toISOString(),
        serviceVersion: '2.0.0',
        industry: 'Unknown',
        confidence: 0.3,
        warnings,
        errors,
      },
    };
  }

  /**
   * Calculate average confidence from array of items with confidence
   */
  private calculateAverageConfidence(items: Array<{ confidence?: number }>): number {
    if (items.length === 0) return 0.5;
    const sum = items.reduce((acc, item) => acc + (item.confidence || 0.5), 0);
    return Math.max(0, Math.min(1, sum / items.length));
  }

  /**
   * Generate cache key with parameters
   * Format: geo:{type}:{workspaceId}:{paramsHash}
   */
  private generateCacheKey(
    type: string,
    workspaceId: string,
    params?: Record<string, any>
  ): string {
    const baseKey = `geo:${type}:${workspaceId}`;
    if (!params || Object.keys(params).length === 0) {
      return baseKey;
    }
    // Simple hash of params (for cache key generation)
    const paramsStr = JSON.stringify(params);
    const paramsHash = paramsStr.length > 50 
      ? paramsStr.substring(0, 50).replace(/[^a-zA-Z0-9]/g, '')
      : paramsStr.replace(/[^a-zA-Z0-9]/g, '');
    return `${baseKey}:${paramsHash}`;
  }
}


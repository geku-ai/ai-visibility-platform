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
@Controller('v1/geo')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class GEOIntelligenceController {
  private readonly logger = new Logger(GEOIntelligenceController.name);
  private readonly cache = new Map<string, { data: any; expiresAt: number }>();

  constructor(
    private readonly orchestrator: GEOIntelligenceOrchestrator,
    private readonly opportunitiesService: VisibilityOpportunitiesService,
    private readonly recommendationsService: EnhancedRecommendationService,
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

      // Check cache
      const cacheKey = `geo:intelligence:${workspaceId}`;
      if (!query.refresh && this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey)!;
        if (cached.expiresAt > Date.now()) {
          this.logger.log(`Returning cached intelligence for workspace ${workspaceId}`);
          return cached.data;
        }
        this.cache.delete(cacheKey);
      }

      // Run orchestrator with error handling
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
        
        // Convert to DTO format (Date to string, ensure metadata has all fields)
        intelligence = {
          ...rawIntelligence,
          metadata: {
            ...rawIntelligence.metadata,
            generatedAt: rawIntelligence.metadata.generatedAt instanceof Date 
              ? rawIntelligence.metadata.generatedAt.toISOString()
              : rawIntelligence.metadata.generatedAt,
            industry: rawIntelligence.metadata.industry || rawIntelligence.industry?.primary || 'Unknown',
          },
        } as GEOIntelligenceResponseDto;
      } catch (error) {
        this.logger.error(`Orchestrator failed: ${error instanceof Error ? error.message : String(error)}`);
        
        // Try to get partial results
        try {
          // Fallback: try to get at least some data
          intelligence = await this.getPartialIntelligence(workspaceId, brandName, domain, warnings, errors);
        } catch (fallbackError) {
          return {
            error: {
              code: 'INTERNAL_ERROR',
              message: `Failed to generate intelligence: ${error instanceof Error ? error.message : String(error)}`,
              details: {
                workspaceId,
                originalError: error instanceof Error ? error.message : String(error),
              },
            },
          };
        }
      }

      // Add warnings and errors to metadata
      if (warnings.length > 0 || errors.length > 0) {
        intelligence.metadata.warnings = warnings;
        intelligence.metadata.errors = errors;
      }

      // Cache result (5 minutes)
      this.cache.set(cacheKey, {
        data: intelligence,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });

      // Return 206 if partial, 200 if complete
      const statusCode = errors.length > 0 ? HttpStatus.PARTIAL_CONTENT : HttpStatus.OK;
      
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
    return sum / items.length;
  }
}


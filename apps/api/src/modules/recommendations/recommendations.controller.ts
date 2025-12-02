/**
 * Recommendations Controller
 * Provides endpoints for prescriptive GEO recommendations
 */

import { Controller, Get, Post, Body, Query, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiBody, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../guards/workspace-access.guard';
import { GetWorkspaceId } from '../../decorators/workspace-id.decorator';
import { PrescriptiveRecommendationEngine, Recommendation, EnhancedRecommendationService, GEOIntelligenceOrchestrator } from '@ai-visibility/geo';
import { EventEmitterService } from '../events/event-emitter.service';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { PrismaService } from '../database/prisma.service';
import { RecommendationsResponseDto, RecommendationsQueryDto } from '../geo/dto/geo-intelligence.dto';

@ApiTags('Recommendations')
@ApiBearerAuth()
@Controller('recommendations')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class RecommendationsController {
  constructor(
    private recommendationEngine: PrescriptiveRecommendationEngine,
    private enhancedRecommendations: EnhancedRecommendationService,
    private orchestrator: GEOIntelligenceOrchestrator,
    private eventEmitter: EventEmitterService,
    private prisma: PrismaService,
    @InjectQueue('recommendationRefresh') private recommendationQueue: Queue
  ) {}

  /**
   * Get enhanced recommendations (new endpoint)
   * GET /v1/recommendations/:workspaceId
   * Note: Defined before GET / to ensure proper route matching
   */
  @Get(':workspaceId')
  @ApiOperation({
    summary: 'Get enhanced recommendations',
    description: 'Returns actionable recommendations with filtering and pagination support.',
  })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiQuery({ name: 'priority', required: false, enum: ['critical', 'high', 'medium', 'low'], description: 'Filter by priority' })
  @ApiQuery({ name: 'category', required: false, enum: ['content', 'schema', 'citations', 'trust', 'technical', 'positioning', 'competitor'], description: 'Filter by category' })
  @ApiQuery({ name: 'maxDifficulty', required: false, type: Number, description: 'Maximum difficulty (0-100)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of recommendations to return (default: 50)' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Offset for pagination (default: 0)' })
  @ApiResponse({
    status: 200,
    description: 'Recommendations returned successfully',
    type: RecommendationsResponseDto,
  })
  async getEnhancedRecommendations(
    @Param('workspaceId') workspaceId: string,
    @Query() query: RecommendationsQueryDto,
  ): Promise<RecommendationsResponseDto | { error: { code: string; message: string; details?: any } }> {
    try {
      // Validate workspace
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, primaryDomain: true, brandName: true },
      });

      if (!workspace) {
        return {
          error: {
            code: 'MISSING_WORKSPACE',
            message: 'Workspace not found',
            details: { workspaceId },
          },
        };
      }

      const brandName = workspace.brandName || 'Unknown';
      const domain = workspace.primaryDomain || '';

      // Get full intelligence context for recommendations
      const intelligence = await this.orchestrator.orchestrateIntelligence(
        workspaceId,
        brandName,
        domain,
        {
          includeOpportunities: true,
          includeRecommendations: false,
          maxOpportunities: 20,
        }
      );

      // Generate recommendations
      const recommendations = await this.enhancedRecommendations.generateEnhancedRecommendations(
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
        const difficultyMap = { easy: 30, medium: 60, hard: 90 };
        const maxDiff = query.maxDifficulty;
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
        domain: workspace.primaryDomain || '',
        recommendations: paginated,
        metadata: {
          generatedAt: new Date().toISOString(),
          serviceVersion: '2.0.0',
          industry: 'Unknown', // Could be fetched from workspace if needed
          total: filtered.length,
          highPriorityCount,
          confidence: this.calculateAverageConfidence(paginated),
          warnings: [],
        },
      };
    } catch (error) {
      return {
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : String(error),
          details: { workspaceId },
        },
      };
    }
  }

  @Get()
  @ApiOperation({ summary: 'Get prescriptive recommendations' })
  @ApiResponse({ status: 200, description: 'Recommendations retrieved successfully' })
  @ApiQuery({ name: 'workspaceId', required: false, description: 'Workspace ID' })
  async getRecommendations(
    @GetWorkspaceId() workspaceId: string,
    @Query('workspaceId') queryWorkspaceId?: string
  ): Promise<Recommendation[]> {
    const targetWorkspaceId = queryWorkspaceId || workspaceId;

    // Try to get from database first
    try {
      const Pool = require('pg').Pool;
      const dbPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      });

      const result = await dbPool.query(
        'SELECT "recommendations" FROM "geo_maturity_scores" WHERE "workspaceId" = $1',
        [targetWorkspaceId]
      );

      if (result.rows.length > 0 && result.rows[0].recommendations) {
        return result.rows[0].recommendations;
      }
    } catch (error) {
      console.warn('Error fetching recommendations from DB:', error);
    }

    // Generate if not found
    return this.recommendationEngine.generateRecommendations(targetWorkspaceId);
  }

  /**
   * Calculate average confidence
   */
  private calculateAverageConfidence(items: Array<{ confidence?: number }>): number {
    if (items.length === 0) return 0.5;
    const sum = items.reduce((acc, item) => acc + (item.confidence || 0.5), 0);
    return sum / items.length;
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh recommendations' })
  @ApiResponse({ status: 200, description: 'Recommendations refreshed successfully' })
  @ApiBody({ schema: { type: 'object', properties: { workspaceId: { type: 'string' } } } })
  async refreshRecommendations(
    @GetWorkspaceId() workspaceId: string,
    @Body() body?: { workspaceId?: string }
  ): Promise<{ jobId: string; status: string }> {
    const targetWorkspaceId = body?.workspaceId || workspaceId;

    // Enqueue job
    const job = await this.recommendationQueue.add('refresh', {
      workspaceId: targetWorkspaceId,
      timestamp: new Date().toISOString(),
    });

    // Emit SSE event
    await this.eventEmitter.emitToWorkspace(targetWorkspaceId, 'geo.recommendations.updated', {
      jobId: job.id,
      workspaceId: targetWorkspaceId,
    });

    return {
      jobId: job.id!,
      status: 'accepted',
    };
  }
}


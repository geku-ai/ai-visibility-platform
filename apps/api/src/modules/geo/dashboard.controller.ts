/**
 * Dashboard Controller
 * Provides endpoints for GEO dashboard data
 */

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../guards/workspace-access.guard';
import { GetWorkspaceId } from '../../decorators/workspace-id.decorator';
import {
  DashboardAggregatorService,
  DashboardOverview,
  EngineVisibilityComparison,
  MaturityProgressPoint,
} from '@ai-visibility/geo';
import { Recommendation } from '@ai-visibility/geo';
import { GEOMaturityScore } from '@ai-visibility/geo';

@ApiTags('GEO Dashboard')
@ApiBearerAuth()
@Controller('geo/dashboard')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class DashboardController {
  constructor(
    private dashboardAggregator: DashboardAggregatorService
  ) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get complete dashboard overview' })
  @ApiResponse({ status: 200, description: 'Dashboard overview retrieved successfully' })
  @ApiQuery({ name: 'workspaceId', required: false, description: 'Workspace ID' })
  async getDashboardOverview(
    @GetWorkspaceId() workspaceId: string,
    @Query('workspaceId') queryWorkspaceId?: string
  ): Promise<{ ok: boolean; data: DashboardOverview }> {
    try {
      const targetWorkspaceId = queryWorkspaceId || workspaceId;
      const overview = await this.dashboardAggregator.getDashboardOverview(targetWorkspaceId);
      
      return {
        ok: true,
        data: overview,
      };
    } catch (error) {
      return {
        ok: false,
        data: null as any,
      };
    }
  }

  @Get('maturity')
  @ApiOperation({ summary: 'Get maturity scores with trends' })
  @ApiResponse({ status: 200, description: 'Maturity scores retrieved successfully' })
  @ApiQuery({ name: 'workspaceId', required: false, description: 'Workspace ID' })
  async getMaturity(
    @GetWorkspaceId() workspaceId: string,
    @Query('workspaceId') queryWorkspaceId?: string
  ): Promise<{
    ok: boolean;
    data: {
      current: GEOMaturityScore;
      trends: {
        weekly: number;
        monthly: number;
        quarterly: number;
      };
    };
  }> {
    try {
      const targetWorkspaceId = queryWorkspaceId || workspaceId;
      const maturityData = await this.dashboardAggregator.getMaturityScores(targetWorkspaceId);
      
      return {
        ok: true,
        data: maturityData,
      };
    } catch (error) {
      return {
        ok: false,
        data: null as any,
      };
    }
  }

  @Get('recommendations')
  @ApiOperation({ summary: 'Get prioritized recommendations' })
  @ApiResponse({ status: 200, description: 'Recommendations retrieved successfully' })
  @ApiQuery({ name: 'workspaceId', required: false, description: 'Workspace ID' })
  @ApiQuery({ name: 'limit', required: false, description: 'Limit number of recommendations' })
  async getRecommendations(
    @GetWorkspaceId() workspaceId: string,
    @Query('workspaceId') queryWorkspaceId?: string,
    @Query('limit') limit?: number
  ): Promise<{ ok: boolean; data: Recommendation[] }> {
    try {
      const targetWorkspaceId = queryWorkspaceId || workspaceId;
      let recommendations = await this.dashboardAggregator.getRecommendations(targetWorkspaceId);
      
      if (limit) {
        recommendations = recommendations.slice(0, parseInt(limit.toString(), 10));
      }
      
      return {
        ok: true,
        data: recommendations,
      };
    } catch (error) {
      return {
        ok: false,
        data: [],
      };
    }
  }

  @Get('engines/comparison')
  @ApiOperation({ summary: 'Get cross-engine visibility comparison' })
  @ApiResponse({ status: 200, description: 'Engine comparison retrieved successfully' })
  @ApiQuery({ name: 'workspaceId', required: false, description: 'Workspace ID' })
  async getEngineComparison(
    @GetWorkspaceId() workspaceId: string,
    @Query('workspaceId') queryWorkspaceId?: string
  ): Promise<{ ok: boolean; data: EngineVisibilityComparison[] }> {
    try {
      const targetWorkspaceId = queryWorkspaceId || workspaceId;
      const comparison = await this.dashboardAggregator.getEngineComparison(targetWorkspaceId);
      
      return {
        ok: true,
        data: comparison,
      };
    } catch (error) {
      return {
        ok: false,
        data: [],
      };
    }
  }

  @Get('progress')
  @ApiOperation({ summary: 'Get historical progress tracking' })
  @ApiResponse({ status: 200, description: 'Progress history retrieved successfully' })
  @ApiQuery({ name: 'workspaceId', required: false, description: 'Workspace ID' })
  @ApiQuery({ name: 'days', required: false, description: 'Number of days of history (default: 30)' })
  async getProgress(
    @GetWorkspaceId() workspaceId: string,
    @Query('workspaceId') queryWorkspaceId?: string,
    @Query('days') days?: number
  ): Promise<{ ok: boolean; data: MaturityProgressPoint[] }> {
    try {
      const targetWorkspaceId = queryWorkspaceId || workspaceId;
      const daysCount = days ? parseInt(days.toString(), 10) : 30;
      const progress = await this.dashboardAggregator.getProgressHistory(targetWorkspaceId, daysCount);
      
      return {
        ok: true,
        data: progress,
      };
    } catch (error) {
      return {
        ok: false,
        data: [],
      };
    }
  }
}


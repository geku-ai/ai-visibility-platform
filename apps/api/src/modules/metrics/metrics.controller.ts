/**
 * Metrics controller
 */

import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { OnboardingCompleteGuard } from '../../guards/onboarding-complete.guard';
import { MetricsService } from './metrics.service';

@ApiTags('Metrics')
@Controller('metrics')
@UseGuards(JwtAuthGuard, OnboardingCompleteGuard)
@ApiBearerAuth()
export class MetricsController {
  constructor(private metricsService: MetricsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get metrics overview' })
  @ApiResponse({ status: 200, description: 'Metrics overview retrieved successfully' })
  @ApiQuery({ name: 'from', required: false, description: 'Start date (ISO string)' })
  @ApiQuery({ name: 'to', required: false, description: 'End date (ISO string)' })
  async getOverview(
    @Request() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<any> {
    const workspaceId = req.user.workspaceId;
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    
    return this.metricsService.getOverview(workspaceId, fromDate, toDate);
  }

  @Get('citations/top-domains')
  @ApiOperation({ summary: 'Get top citation domains' })
  @ApiResponse({ status: 200, description: 'Top domains retrieved successfully' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of domains to return', type: Number })
  async getTopDomains(
    @Request() req: any,
    @Query('limit') limit?: number,
  ): Promise<any> {
    const workspaceId = req.user.workspaceId;
    return this.metricsService.getTopDomains(workspaceId, limit || 50);
  }
}

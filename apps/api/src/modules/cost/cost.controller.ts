/**
 * Cost Estimation Controller
 * 
 * INTERNAL / DIAGNOSTIC endpoints for cost estimation.
 * Used for pricing & internal planning only.
 * 
 * NOT for public consumption - requires authentication.
 */

import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiQuery,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../guards/workspace-access.guard';
import { CostEstimatorService } from '@ai-visibility/geo';
import type { ScenarioCostEstimate } from '@ai-visibility/geo';
import { CostEstimateResponseDto, CopilotCostEstimateQueryDto } from './dto/cost-estimate.dto';

@ApiTags('Cost Estimation')
@ApiBearerAuth()
@Controller('cost')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class CostController {
  private readonly logger = new Logger(CostController.name);

  constructor(private readonly costEstimator: CostEstimatorService) {}

  /**
   * Estimate cost for Instant Summary V2 (free funnel)
   */
  @Get('estimate/instant-summary')
  @ApiOperation({
    summary: 'Estimate cost for Instant Summary V2',
    description: 'INTERNAL / DIAGNOSTIC: Estimates variable cost for a single Instant Summary V2 run. Used for pricing & internal planning.',
  })
  @ApiOkResponse({
    description: 'Cost estimate for Instant Summary V2',
    type: CostEstimateResponseDto,
  })
  @ApiQuery({
    name: 'domain',
    required: false,
    description: 'Domain to estimate for (optional, used for context)',
    type: String,
  })
  async estimateInstantSummary(
    @Query('domain') domain?: string
  ): Promise<CostEstimateResponseDto> {
    this.logger.log(`Estimating Instant Summary cost for domain: ${domain || 'generic'}`);
    
    const estimate = await this.costEstimator.estimateInstantSummaryCost(
      domain || 'example.com'
    );

    return this.toResponseDto(estimate);
  }

  /**
   * Estimate cost for Full Intelligence run
   */
  @Get('estimate/intelligence/:workspaceId')
  @ApiOperation({
    summary: 'Estimate cost for Full GEO Intelligence run',
    description: 'INTERNAL / DIAGNOSTIC: Estimates variable cost for a complete GEO Intelligence orchestration (15 steps). Used for pricing & internal planning.',
  })
  @ApiOkResponse({
    description: 'Cost estimate for Full Intelligence run',
    type: CostEstimateResponseDto,
  })
  @ApiParam({
    name: 'workspaceId',
    description: 'Workspace identifier',
    type: String,
  })
  @ApiQuery({
    name: 'industry',
    required: false,
    description: 'Industry context (affects prompt/competitor counts)',
    type: String,
  })
  @ApiQuery({
    name: 'promptCount',
    required: false,
    description: 'Expected number of prompts (overrides default estimate)',
    type: Number,
  })
  @ApiQuery({
    name: 'competitorCount',
    required: false,
    description: 'Expected number of competitors (overrides default estimate)',
    type: Number,
  })
  @ApiQuery({
    name: 'assumeCached',
    required: false,
    description: 'Assume prompt runs are cached (reduces search API calls)',
    type: Boolean,
  })
  async estimateFullIntelligence(
    @Param('workspaceId') workspaceId: string,
    @Query('industry') industry?: string,
    @Query('promptCount') promptCount?: number,
    @Query('competitorCount') competitorCount?: number,
    @Query('assumeCached') assumeCached?: string
  ): Promise<CostEstimateResponseDto> {
    this.logger.log(`Estimating Full Intelligence cost for workspace: ${workspaceId}`);

    const estimate = await this.costEstimator.estimateFullIntelligenceCost(workspaceId, {
      industry,
      promptCount: promptCount ? parseInt(String(promptCount), 10) : undefined,
      competitorCount: competitorCount ? parseInt(String(competitorCount), 10) : undefined,
      assumeCached: assumeCached === 'true',
    });

    return this.toResponseDto(estimate);
  }

  /**
   * Estimate monthly cost for Copilot automation
   */
  @Get('estimate/copilot/:workspaceId')
  @ApiOperation({
    summary: 'Estimate monthly cost for Copilot automation',
    description: 'INTERNAL / DIAGNOSTIC: Estimates monthly variable cost for Copilot automation based on usage level. Used for pricing & internal planning.',
  })
  @ApiOkResponse({
    description: 'Monthly cost estimate for Copilot automation',
    type: CostEstimateResponseDto,
  })
  @ApiParam({
    name: 'workspaceId',
    description: 'Workspace identifier',
    type: String,
  })
    @ApiQuery({
      name: 'automationLevel',
      required: false,
      description: 'Automation level: low, medium, or high',
      enum: ['low', 'medium', 'high'],
    })
  @ApiQuery({
    name: 'pagesPerWeek',
    required: false,
    description: 'Pages optimized per week',
    type: Number,
  })
  @ApiQuery({
    name: 'reviewResponsesPerWeek',
    required: false,
    description: 'Review responses generated per week',
    type: Number,
  })
  async estimateCopilotMonthly(
    @Param('workspaceId') workspaceId: string,
    @Query('automationLevel') automationLevel: 'low' | 'medium' | 'high' = 'medium',
    @Query('pagesPerWeek') pagesPerWeek?: number,
    @Query('reviewResponsesPerWeek') reviewResponsesPerWeek?: number
  ): Promise<CostEstimateResponseDto> {
    this.logger.log(`Estimating Copilot monthly cost for workspace: ${workspaceId}, level: ${automationLevel}`);

    const estimate = await this.costEstimator.estimateCopilotMonthlyCost({
      workspaceId,
      automationLevel,
      pagesOptimizedPerWeek: pagesPerWeek ? parseInt(String(pagesPerWeek), 10) : 0,
      reviewResponsesPerWeek: reviewResponsesPerWeek ? parseInt(String(reviewResponsesPerWeek), 10) : 0,
    });

    return this.toResponseDto(estimate);
  }

  /**
   * Convert ScenarioCostEstimate to DTO
   */
  private toResponseDto(estimate: ScenarioCostEstimate): CostEstimateResponseDto {
    return {
      scenario: estimate.scenario,
      totalUsd: estimate.totalUsd,
      perProvider: estimate.perProvider.map((p: any) => ({
        provider: p.provider,
        estimatedRequests: p.estimatedRequests,
        estimatedTokens: p.estimatedTokens,
        estimatedUsd: p.estimatedUsd,
      })),
      assumptions: estimate.assumptions,
      confidence: estimate.confidence,
      estimatedLLMCalls: estimate.estimatedLLMCalls,
      estimatedSearchCalls: estimate.estimatedSearchCalls,
      estimatedTotalTokens: estimate.estimatedTotalTokens,
      metadata: estimate.metadata ? {
        ...estimate.metadata,
        generatedAt: estimate.metadata.generatedAt.toISOString(),
      } : undefined,
    };
  }
}


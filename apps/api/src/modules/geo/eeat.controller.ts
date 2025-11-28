/**
 * E-E-A-T Controller
 * Provides endpoints for E-E-A-T scores
 */

import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../guards/workspace-access.guard';
import { GetWorkspaceId } from '../../decorators/workspace-id.decorator';
import { EEATCalculatorService, EEATScore } from '@ai-visibility/geo';

@ApiTags('GEO E-E-A-T')
@ApiBearerAuth()
@Controller('geo')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class EEATController {
  constructor(
    private eeatCalculator: EEATCalculatorService
  ) {}

  @Get('eeat')
  @ApiOperation({ summary: 'Get E-E-A-T score for workspace' })
  @ApiResponse({ status: 200, description: 'E-E-A-T score retrieved successfully' })
  @ApiQuery({ name: 'workspaceId', required: false, description: 'Workspace ID' })
  async getEEATScore(
    @GetWorkspaceId() workspaceId: string,
    @Query('workspaceId') queryWorkspaceId?: string
  ): Promise<{ ok: boolean; data: EEATScore }> {
    const targetWorkspaceId = queryWorkspaceId || workspaceId;
    
    try {
      const score = await this.eeatCalculator.calculateEEATScore(targetWorkspaceId);
      
      return {
        ok: true,
        data: score,
      };
    } catch (error) {
      return {
        ok: false,
        data: null as any,
      };
    }
  }
}


/**
 * Evidence Controller
 * Provides endpoints for entity evidence graph
 */

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../guards/workspace-access.guard';
import { GetWorkspaceId } from '../../decorators/workspace-id.decorator';
import { EvidenceGraphBuilderService, EntityEvidenceGraph, FactConsensusScore } from '@ai-visibility/geo';

@ApiTags('GEO Evidence')
@ApiBearerAuth()
@Controller('geo/evidence')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class EvidenceController {
  constructor(private evidenceBuilder: EvidenceGraphBuilderService) {}

  @Get('graph')
  @ApiOperation({ summary: 'Get entity evidence graph' })
  @ApiResponse({ status: 200, description: 'Evidence graph retrieved successfully' })
  @ApiQuery({ name: 'workspaceId', required: false, description: 'Workspace ID' })
  async getEvidenceGraph(
    @GetWorkspaceId() workspaceId: string,
    @Query('workspaceId') queryWorkspaceId?: string
  ): Promise<EntityEvidenceGraph> {
    const targetWorkspaceId = queryWorkspaceId || workspaceId;
    return this.evidenceBuilder.buildEvidenceGraph(targetWorkspaceId);
  }

  @Get('consensus')
  @ApiOperation({ summary: 'Get fact-level consensus scores' })
  @ApiResponse({ status: 200, description: 'Fact consensus scores retrieved successfully' })
  @ApiQuery({ name: 'workspaceId', required: false, description: 'Workspace ID' })
  @ApiQuery({ name: 'factType', required: false, description: 'Filter by fact type (address, hours, phone, services, pricing)' })
  async getFactConsensus(
    @GetWorkspaceId() workspaceId: string,
    @Query('workspaceId') queryWorkspaceId?: string,
    @Query('factType') factType?: 'address' | 'hours' | 'phone' | 'services' | 'pricing' | 'features'
  ): Promise<{ ok: boolean; data: FactConsensusScore[] }> {
    try {
      const targetWorkspaceId = queryWorkspaceId || workspaceId;
      const consensusScores = await this.evidenceBuilder.calculateFactLevelConsensus(
        targetWorkspaceId,
        factType
      );
      
      return {
        ok: true,
        data: consensusScores,
      };
    } catch (error) {
      return {
        ok: false,
        data: [],
      };
    }
  }
}


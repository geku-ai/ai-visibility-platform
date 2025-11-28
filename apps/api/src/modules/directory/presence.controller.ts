/**
 * Directory Presence Controller
 * Provides endpoints for directory presence analysis
 */

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../guards/workspace-access.guard';
import { GetWorkspaceId } from '../../decorators/workspace-id.decorator';
import { DirectoryPresenceAnalyzerService, DirectoryPresenceReport } from '@ai-visibility/geo';

@ApiTags('Directory Presence')
@ApiBearerAuth()
@Controller('directory')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class DirectoryPresenceController {
  constructor(private presenceAnalyzer: DirectoryPresenceAnalyzerService) {}

  @Get('presence')
  @ApiOperation({ summary: 'Get directory presence analysis' })
  @ApiResponse({ status: 200, description: 'Directory presence report retrieved successfully' })
  @ApiQuery({ name: 'workspaceId', required: false, description: 'Workspace ID' })
  async getPresence(
    @GetWorkspaceId() workspaceId: string,
    @Query('workspaceId') queryWorkspaceId?: string
  ): Promise<DirectoryPresenceReport> {
    const targetWorkspaceId = queryWorkspaceId || workspaceId;
    return this.presenceAnalyzer.analyzeDirectoryPresence(targetWorkspaceId);
  }
}


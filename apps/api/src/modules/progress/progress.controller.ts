/**
 * Progress Controller
 * API endpoints for progress tracking
 */

import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ProgressService, ProgressState } from './progress.service';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../guards/workspace-access.guard';
import { WorkspaceContextService } from '../../middleware/workspace-context';

@Controller('progress')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class ProgressController {
  constructor(
    private progressService: ProgressService,
    private workspaceContext: WorkspaceContextService
  ) {}

  @Post()
  async createProgress(
    @Body() body: {
      operation: string;
      totalSteps?: number;
      metadata?: any;
    }
  ): Promise<ProgressState> {
    const workspaceId = this.workspaceContext.getWorkspaceId();
    
    return this.progressService.createProgress(
      workspaceId,
      body.operation,
      body.totalSteps,
      body.metadata
    );
  }

  @Get(':progressId')
  async getProgress(@Param('progressId') progressId: string): Promise<ProgressState | null> {
    const workspaceId = this.workspaceContext.getWorkspaceId();
    
    return this.progressService.getProgress(workspaceId, progressId);
  }

  @Get()
  async getWorkspaceProgress(): Promise<ProgressState[]> {
    const workspaceId = this.workspaceContext.getWorkspaceId();
    
    return this.progressService.getWorkspaceProgress(workspaceId);
  }

  @Put(':progressId')
  async updateProgress(
    @Param('progressId') progressId: string,
    @Body() updates: Partial<ProgressState>
  ): Promise<ProgressState> {
    const workspaceId = this.workspaceContext.getWorkspaceId();
    
    return this.progressService.updateProgress(workspaceId, progressId, updates);
  }

  @Post(':progressId/complete')
  async completeProgress(
    @Param('progressId') progressId: string,
    @Body() body: { success?: boolean; error?: string }
  ): Promise<ProgressState> {
    const workspaceId = this.workspaceContext.getWorkspaceId();
    
    return this.progressService.completeProgress(
      workspaceId,
      progressId,
      body.success ?? true,
      body.error
    );
  }

  @Post(':progressId/cancel')
  async cancelProgress(
    @Param('progressId') progressId: string,
    @Body() body: { reason?: string }
  ): Promise<ProgressState> {
    const workspaceId = this.workspaceContext.getWorkspaceId();
    
    return this.progressService.cancelProgress(workspaceId, progressId, body.reason);
  }

  @Get('metrics/summary')
  async getProgressMetrics(): Promise<{
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
  }> {
    const workspaceId = this.workspaceContext.getWorkspaceId();
    
    return this.progressService.getProgressMetrics(workspaceId);
  }

  @Delete('cleanup')
  async cleanupProgress(
    @Query('olderThanHours') olderThanHours: number = 24
  ): Promise<{ deleted: number }> {
    const workspaceId = this.workspaceContext.getWorkspaceId();
    
    const beforeCount = (await this.progressService.getWorkspaceProgress(workspaceId)).length;
    await this.progressService.cleanupCompletedProgress(workspaceId, olderThanHours);
    const afterCount = (await this.progressService.getWorkspaceProgress(workspaceId)).length;
    
    return { deleted: beforeCount - afterCount };
  }
}



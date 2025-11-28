import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { PreSignupService, EnhancedCopilotService, DirectorySyncService } from '@ai-visibility/automation';

@Controller('automation')
export class AutomationController {
  constructor(
    private preSignupService: PreSignupService,
    private copilotService: EnhancedCopilotService,
    private directorySyncService: DirectorySyncService,
  ) {}

  // Pre-Signup Analysis Endpoints
  @Post('pre-signup/analyze')
  async initiatePreSignupAnalysis(@Body() request: {
    brandName: string;
    website?: string;
    industry?: string;
    email: string;
  }) {
    const result = await this.preSignupService.initiatePreSignupAnalysis(request);
    return {
      ok: true,
      data: result,
    };
  }

  @Get('pre-signup/:requestId/status')
  async getPreSignupStatus(@Param('requestId') requestId: string) {
    const status = await this.preSignupService.getAnalysisStatus(requestId);
    return {
      ok: true,
      data: status,
    };
  }

  @Get('pre-signup/:requestId/results')
  async getPreSignupResults(@Param('requestId') requestId: string) {
    const results = await this.preSignupService.getAnalysisResults(requestId);
    return {
      ok: true,
      data: results,
    };
  }

  // Enhanced Copilot Endpoints
  @Post('copilot/rules')
  async createCopilotRule(@Body() ruleData: any) {
    const rule = await this.copilotService.createRule(
      ruleData.workspaceId,
      ruleData.userId,
      ruleData.rule
    );
    return {
      ok: true,
      data: rule,
    };
  }

  @Get('copilot/rules/:workspaceId')
  async getCopilotRules(@Param('workspaceId') workspaceId: string) {
    const rules = await this.copilotService.getRules(workspaceId);
    return {
      ok: true,
      data: rules,
    };
  }

  @Put('copilot/rules/:workspaceId/:ruleId')
  async updateCopilotRule(
    @Param('workspaceId') workspaceId: string,
    @Param('ruleId') ruleId: string,
    @Body() updates: any
  ) {
    const rule = await this.copilotService.updateRule(workspaceId, ruleId, updates);
    return {
      ok: true,
      data: rule,
    };
  }

  @Delete('copilot/rules/:workspaceId/:ruleId')
  async deleteCopilotRule(
    @Param('workspaceId') workspaceId: string,
    @Param('ruleId') ruleId: string
  ) {
    const deleted = await this.copilotService.deleteRule(workspaceId, ruleId);
    return {
      ok: true,
      data: { deleted },
    };
  }

  @Post('copilot/evaluate')
  async evaluateCopilotRules(@Body() request: {
    workspaceId: string;
    context: any;
  }) {
    const executions = await this.copilotService.evaluateRules(
      request.workspaceId,
      request.context
    );
    return {
      ok: true,
      data: executions,
    };
  }

  @Get('copilot/metrics/:workspaceId')
  async getCopilotMetrics(@Param('workspaceId') workspaceId: string) {
    const metrics = await this.copilotService.getMetrics(workspaceId);
    return {
      ok: true,
      data: metrics,
    };
  }

  // Directory Sync Endpoints
  @Get('directories/platforms')
  async getDirectoryPlatforms() {
    const platforms = await this.directorySyncService.getPlatforms();
    return {
      ok: true,
      data: platforms,
    };
  }

  @Get('directories/platforms/:platformId')
  async getDirectoryPlatform(@Param('platformId') platformId: string) {
    const platform = await this.directorySyncService.getPlatform(platformId);
    return {
      ok: true,
      data: platform,
    };
  }

  @Post('directories/sync')
  async initiateDirectorySync(@Body() request: {
    workspaceId: string;
    platformIds: string[];
    businessInfo: any;
    priority?: 'low' | 'medium' | 'high';
  }) {
    const syncJob = await this.directorySyncService.initiateSync(
      request.workspaceId,
      request.platformIds,
      request.businessInfo,
      request.priority
    );
    return {
      ok: true,
      data: syncJob,
    };
  }

  @Get('directories/sync/:syncJobId')
  async getDirectorySyncStatus(@Param('syncJobId') syncJobId: string) {
    const status = await this.directorySyncService.getSyncJobStatus(syncJobId);
    return {
      ok: true,
      data: status,
    };
  }

  @Get('directories/metrics/:workspaceId')
  async getDirectoryMetrics(@Param('workspaceId') workspaceId: string) {
    const metrics = await this.directorySyncService.getMetrics(workspaceId);
    return {
      ok: true,
      data: metrics,
    };
  }
}


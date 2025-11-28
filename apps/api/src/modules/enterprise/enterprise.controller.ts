import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ObservabilityService, WhiteLabelService, ApiMarketplaceService } from '@ai-visibility/shared';

@Controller('enterprise')
export class EnterpriseController {
  constructor(
    private observabilityService: ObservabilityService,
    private whiteLabelService: WhiteLabelService,
    private apiMarketplaceService: ApiMarketplaceService,
  ) {}

  // Observability Endpoints
  @Post('metrics/workspace')
  async recordWorkspaceMetrics(@Body() metrics: any) {
    await this.observabilityService.recordWorkspaceMetrics(metrics);
    return {
      ok: true,
      message: 'Workspace metrics recorded successfully',
    };
  }

  @Post('metrics/system')
  async recordSystemMetrics(@Body() metrics: any) {
    await this.observabilityService.recordSystemMetrics(metrics);
    return {
      ok: true,
      message: 'System metrics recorded successfully',
    };
  }

  @Get('metrics/workspace/:workspaceId')
  async getWorkspaceMetrics(
    @Param('workspaceId') workspaceId: string,
    @Query('startTime') startTime: string,
    @Query('endTime') endTime: string,
    @Query('granularity') granularity: 'minute' | 'hour' | 'day' = 'hour'
  ) {
    const metrics = await this.observabilityService.getWorkspaceMetrics(
      workspaceId,
      new Date(startTime),
      new Date(endTime),
      granularity
    );
    return {
      ok: true,
      data: metrics,
    };
  }

  @Get('metrics/system')
  async getSystemMetrics(
    @Query('startTime') startTime: string,
    @Query('endTime') endTime: string,
    @Query('granularity') granularity: 'minute' | 'hour' | 'day' = 'hour'
  ) {
    const metrics = await this.observabilityService.getSystemMetrics(
      new Date(startTime),
      new Date(endTime),
      granularity
    );
    return {
      ok: true,
      data: metrics,
    };
  }

  @Post('alerts/rules')
  async createAlertRule(@Body() rule: any) {
    const alertRule = await this.observabilityService.createAlertRule(rule);
    return {
      ok: true,
      data: alertRule,
    };
  }

  @Get('alerts/rules')
  async getAlertRules(@Query('workspaceId') workspaceId?: string) {
    const rules = await this.observabilityService.getAlertRules(workspaceId);
    return {
      ok: true,
      data: rules,
    };
  }

  @Get('alerts/active')
  async getActiveAlerts(@Query('workspaceId') workspaceId?: string) {
    const alerts = await this.observabilityService.getActiveAlerts(workspaceId);
    return {
      ok: true,
      data: alerts,
    };
  }

  @Put('alerts/:alertId/acknowledge')
  async acknowledgeAlert(
    @Param('alertId') alertId: string,
    @Body() body: { userId: string }
  ) {
    const acknowledged = await this.observabilityService.acknowledgeAlert(
      alertId,
      body.userId
    );
    return {
      ok: true,
      data: { acknowledged },
    };
  }

  @Put('alerts/:alertId/resolve')
  async resolveAlert(
    @Param('alertId') alertId: string,
    @Body() body: { userId: string }
  ) {
    const resolved = await this.observabilityService.resolveAlert(
      alertId,
      body.userId
    );
    return {
      ok: true,
      data: { resolved },
    };
  }

  // White-Label Endpoints
  @Post('whitelabel/configs')
  async createWhiteLabelConfig(@Body() config: any) {
    const whiteLabelConfig = await this.whiteLabelService.createWhiteLabelConfig(config);
    return {
      ok: true,
      data: whiteLabelConfig,
    };
  }

  @Get('whitelabel/configs/:configId')
  async getWhiteLabelConfig(@Param('configId') configId: string) {
    const config = await this.whiteLabelService.getWhiteLabelConfig(configId);
    return {
      ok: true,
      data: config,
    };
  }

  @Get('whitelabel/configs/client/:clientId')
  async getWhiteLabelConfigByClient(@Param('clientId') clientId: string) {
    const config = await this.whiteLabelService.getWhiteLabelConfigByClient(clientId);
    return {
      ok: true,
      data: config,
    };
  }

  @Put('whitelabel/configs/:configId')
  async updateWhiteLabelConfig(
    @Param('configId') configId: string,
    @Body() updates: any
  ) {
    const config = await this.whiteLabelService.updateWhiteLabelConfig(configId, updates);
    return {
      ok: true,
      data: config,
    };
  }

  @Post('whitelabel/validate-domain')
  async validateDomain(@Body() body: { domain: string }) {
    const validation = await this.whiteLabelService.validateDomain(body.domain);
    return {
      ok: true,
      data: validation,
    };
  }

  @Get('whitelabel/css/:configId')
  async getWhiteLabelCSS(@Param('configId') configId: string) {
    const config = await this.whiteLabelService.getWhiteLabelConfig(configId);
    if (!config) {
      return {
        ok: false,
        error: 'Configuration not found',
      };
    }

    const css = this.whiteLabelService.generateWhiteLabelCSS(config);
    return {
      ok: true,
      data: { css },
    };
  }

  // API Marketplace Endpoints
  @Post('api/keys')
  async generateApiKey(@Body() request: {
    clientId: string;
    name: string;
    permissions: string[];
    rateLimit: { requestsPerMinute: number; requestsPerDay: number };
  }) {
    const apiKey = await this.apiMarketplaceService.generateApiKey(
      request.clientId,
      request.name,
      request.permissions,
      request.rateLimit
    );
    return {
      ok: true,
      data: apiKey,
    };
  }

  @Get('api/keys/:clientId')
  async getApiKeys(@Param('clientId') clientId: string) {
    // In a real implementation, this would return the client's API keys
    return {
      ok: true,
      data: [],
    };
  }

  @Post('api/validate')
  async validateApiKey(@Body() body: { key: string }) {
    const validation = await this.apiMarketplaceService.validateApiKey(body.key);
    return {
      ok: true,
      data: validation,
    };
  }

  @Get('api/usage/:keyId')
  async getApiUsageStats(
    @Param('keyId') keyId: string,
    @Query('startTime') startTime: string,
    @Query('endTime') endTime: string
  ) {
    const stats = await this.apiMarketplaceService.getApiUsageStats(
      keyId,
      new Date(startTime),
      new Date(endTime)
    );
    return {
      ok: true,
      data: stats,
    };
  }

  @Post('marketplace/apps')
  async createMarketplaceApp(@Body() app: any) {
    const marketplaceApp = await this.apiMarketplaceService.createMarketplaceApp(app);
    return {
      ok: true,
      data: marketplaceApp,
    };
  }

  @Get('marketplace/apps')
  async getMarketplaceApps(
    @Query('category') category?: string,
    @Query('status') status?: string
  ) {
    const apps = await this.apiMarketplaceService.getMarketplaceApps(category, status);
    return {
      ok: true,
      data: apps,
    };
  }

  @Post('marketplace/apps/:appId/install')
  async installMarketplaceApp(
    @Param('appId') appId: string,
    @Body() request: {
      workspaceId: string;
      userId: string;
      config?: Record<string, any>;
    }
  ) {
    const installation = await this.apiMarketplaceService.installMarketplaceApp(
      appId,
      request.workspaceId,
      request.userId,
      request.config
    );
    return {
      ok: true,
      data: installation,
    };
  }

  @Get('marketplace/installations/:workspaceId')
  async getWorkspaceInstallations(@Param('workspaceId') workspaceId: string) {
    const installations = await this.apiMarketplaceService.getWorkspaceInstallations(workspaceId);
    return {
      ok: true,
      data: installations,
    };
  }
}


import { Controller, Get, Put, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { LLMConfigService, LLMRouterService } from '@ai-visibility/shared';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../guards/workspace-access.guard';

export interface LLMSettingsDto {
  provider: 'openai' | 'anthropic' | 'gemini';
  model: string;
}

export interface LLMTestDto {
  provider: 'openai' | 'anthropic' | 'gemini';
  model: string;
  testPrompt?: string;
}

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class SettingsController {
  constructor(
    private llmConfigService: LLMConfigService,
    private llmRouterService: LLMRouterService
  ) {}

  @Get('llm')
  @ApiOperation({ summary: 'Get LLM configuration for workspace' })
  @ApiResponse({ status: 200, description: 'LLM configuration retrieved successfully' })
  async getLLMConfig(@Param('workspaceId') workspaceId: string) {
    const config = await this.llmConfigService.getWorkspaceLLMConfig(workspaceId);
    const availableProviders = this.llmConfigService.getAvailableProviders();
    
    return {
      ok: true,
      data: {
        current: config,
        available: availableProviders,
      },
    };
  }

  @Put('llm')
  @ApiOperation({ summary: 'Update LLM configuration for workspace' })
  @ApiResponse({ status: 200, description: 'LLM configuration updated successfully' })
  async updateLLMConfig(
    @Param('workspaceId') workspaceId: string,
    @Body() settings: LLMSettingsDto
  ) {
    await this.llmConfigService.updateWorkspaceLLMConfig(workspaceId, settings);
    
    return {
      ok: true,
      data: {
        message: 'LLM configuration updated successfully',
        config: settings,
      },
    };
  }

  @Post('llm/test')
  @ApiOperation({ summary: 'Test LLM provider connection' })
  @ApiResponse({ status: 200, description: 'LLM provider test completed' })
  async testLLMProvider(
    @Param('workspaceId') workspaceId: string,
    @Body() testConfig: LLMTestDto
  ) {
    const config = {
      provider: testConfig.provider,
      model: testConfig.model,
      apiKey: this.getProviderApiKey(testConfig.provider),
    };

    const isAvailable = await this.llmConfigService.testLLMProvider(config);
    
    if (testConfig.testPrompt) {
      try {
        const response = await this.llmRouterService.routeLLMRequest(
          workspaceId,
          testConfig.testPrompt,
          { model: testConfig.model }
        );
        
        return {
          ok: true,
          data: {
            available: isAvailable,
            testResponse: (response.content || response.text || '').substring(0, 200) + '...',
            cost: response.cost || 0,
            tokens: response.tokens || response.usage,
          },
        };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: 'LLM_TEST_FAILED',
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    }

    return {
      ok: true,
      data: {
        available: isAvailable,
        message: isAvailable ? 'Provider is available' : 'Provider is not available',
      },
    };
  }

  @Get('llm/usage')
  @ApiOperation({ summary: 'Get LLM usage statistics for workspace' })
  @ApiResponse({ status: 200, description: 'Usage statistics retrieved successfully' })
  async getLLMUsage(@Param('workspaceId') workspaceId: string) {
    const usageStats = await this.llmRouterService.getUsageStats(workspaceId);
    const budgetStatus = await this.llmRouterService.checkBudgetLimit(workspaceId);
    
    return {
      ok: true,
      data: {
        usage: usageStats,
        budget: budgetStatus,
      },
    };
  }

  @Get('llm/providers')
  @ApiOperation({ summary: 'Get available LLM providers and models' })
  @ApiResponse({ status: 200, description: 'Available providers retrieved successfully' })
  async getAvailableProviders() {
    const providers = this.llmConfigService.getAvailableProviders();
    
    return {
      ok: true,
      data: providers,
    };
  }

  @Post('llm/estimate-cost')
  @ApiOperation({ summary: 'Estimate cost for LLM request' })
  @ApiResponse({ status: 200, description: 'Cost estimate calculated successfully' })
  async estimateCost(
    @Body() request: {
      provider: string;
      model: string;
      promptTokens: number;
      completionTokens: number;
    }
  ) {
    const cost = this.llmConfigService.estimateCost(
      request.provider,
      request.model,
      request.promptTokens,
      request.completionTokens
    );
    
    return {
      ok: true,
      data: {
        cost,
        breakdown: {
          promptCost: (request.promptTokens / 1000) * this.getPromptRate(request.provider, request.model),
          completionCost: (request.completionTokens / 1000) * this.getCompletionRate(request.provider, request.model),
        },
      },
    };
  }

  private getProviderApiKey(provider: string): string {
    switch (provider) {
      case 'openai':
        return process.env.OPENAI_API_KEY!;
      case 'anthropic':
        return process.env.ANTHROPIC_API_KEY!;
      case 'gemini':
        return process.env.GOOGLE_AI_API_KEY!;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  private getPromptRate(provider: string, model: string): number {
    const rates = {
      openai: {
        'gpt-4': 0.03,
        'gpt-4-turbo': 0.01,
        'gpt-3.5-turbo': 0.001,
      },
      anthropic: {
        'claude-3-opus-20240229': 0.015,
        'claude-3-sonnet-20240229': 0.003,
        'claude-3-haiku-20240307': 0.00025,
      },
      gemini: {
        'gemini-pro': 0.0005,
        'gemini-pro-vision': 0.0005,
      },
    };
    
    return (rates as any)[provider]?.[model] || 0.01;
  }

  private getCompletionRate(provider: string, model: string): number {
    const rates = {
      openai: {
        'gpt-4': 0.06,
        'gpt-4-turbo': 0.03,
        'gpt-3.5-turbo': 0.002,
      },
      anthropic: {
        'claude-3-opus-20240229': 0.075,
        'claude-3-sonnet-20240229': 0.015,
        'claude-3-haiku-20240307': 0.00125,
      },
      gemini: {
        'gemini-pro': 0.0015,
        'gemini-pro-vision': 0.0015,
      },
    };
    
    return (rates as any)[provider]?.[model] || 0.02;
  }
}


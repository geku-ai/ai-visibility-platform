import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiAcceptedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DemoService } from './demo.service';
import {
  DemoCompetitorsRequestDto,
  DemoPromptsRequestDto,
  DemoPromptsResponseDto,
  DemoRunRequestDto,
  DemoRunResponseDto,
  DemoSummaryRequestDto,
  DemoSummaryResponseDto,
  DemoCompetitorsResponseDto,
  DemoInsightsResponseDto,
  DemoRecommendationsResponseDto,
  DemoStatusResponseDto,
} from './dto/demo.dto';

@ApiTags('Demo')
@Controller('demo')
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  @Post('summary')
  @HttpCode(202)
  @ApiOperation({ summary: 'Submit a domain for summary generation' })
  @ApiAcceptedResponse({ description: 'Summary generation request accepted.', type: DemoSummaryResponseDto })
  async createSummary(@Body() payload: DemoSummaryRequestDto) {
    return this.demoService.prepareSummary(payload);
  }

  @Post('prompts')
  @HttpCode(202)
  @ApiOperation({ summary: 'Submit baseline prompts for expansion' })
  @ApiAcceptedResponse({ description: 'Prompt generation request accepted.', type: DemoPromptsResponseDto })
  async createPrompts(@Body() payload: DemoPromptsRequestDto) {
    return this.demoService.preparePrompts(payload);
  }

  @Post('competitors')
  @HttpCode(202)
  @ApiOperation({ summary: 'Submit competitor domains' })
  @ApiAcceptedResponse({ description: 'Competitor discovery request accepted.', type: DemoCompetitorsResponseDto })
  async createCompetitors(@Body() payload: DemoCompetitorsRequestDto) {
    return this.demoService.prepareCompetitors(payload);
  }

  @Post('run')
  @HttpCode(202)
  @ApiOperation({ summary: 'Trigger the demo analysis run' })
  @ApiAcceptedResponse({ description: 'Demo run request accepted.', type: DemoRunResponseDto })
  async runDemo(@Body() payload: DemoRunRequestDto) {
    return this.demoService.runDemo(payload);
  }

  @Get('status/:demoRunId')
  @ApiOperation({ summary: 'Get current demo run status' })
  @ApiOkResponse({ description: 'Returns the latest status for the demo run.', type: DemoStatusResponseDto })
  async getStatus(@Param('demoRunId') demoRunId: string) {
    return this.demoService.getStatus(demoRunId);
  }

  @Get('insights/:demoRunId')
  @ApiOperation({ summary: 'Get demo visibility insights' })
  @ApiOkResponse({ description: 'Returns aggregated insights for the demo run.', type: DemoInsightsResponseDto })
  async getInsights(@Param('demoRunId') demoRunId: string) {
    return this.demoService.getInsights(demoRunId);
  }

  @Get('recommendations/:demoRunId')
  @ApiOperation({ summary: 'Get demo recommendations' })
  @ApiOkResponse({ description: 'Returns prescriptive recommendations based on the analysis.', type: DemoRecommendationsResponseDto })
  async getRecommendations(@Param('demoRunId') demoRunId: string) {
    return this.demoService.getRecommendations(demoRunId);
  }

  @Get('instant-summary')
  @ApiOperation({ summary: 'Get instant AI visibility summary for a domain (orchestrates all demo steps automatically)' })
  @ApiOkResponse({ description: 'Returns instant summary with auto-generated prompts, competitors, and analysis status.' })
  async getInstantSummary(@Query('domain') domain: string) {
    if (!domain || typeof domain !== 'string' || domain.trim().length === 0) {
      throw new BadRequestException('Domain query parameter is required');
    }
    return this.demoService.getInstantSummary(domain);
  }

  @Get('instant-summary/v2')
  @ApiOperation({ summary: 'Get instant AI visibility summary V2 (uses new intelligence orchestrator)' })
  @ApiOkResponse({ description: 'Returns enhanced instant summary with comprehensive intelligence analysis.' })
  async getInstantSummaryV2(@Query('domain') domain: string) {
    if (!domain || typeof domain !== 'string' || domain.trim().length === 0) {
      throw new BadRequestException('Domain query parameter is required');
    }
    const summaryData = await this.demoService.getInstantSummaryV2(domain);
    
    // Wrap in PremiumResponse format expected by frontend
    const premiumResponse = {
      data: summaryData,
      evidence: [], // Empty for instant summary V2
      confidence: summaryData.metadata?.confidence || 0.5,
      warnings: summaryData.metadata?.warnings || [],
      explanation: summaryData.geoScore?.explanation || 'Instant summary analysis completed',
      metadata: summaryData.metadata,
    };
    
    return { ok: true, data: premiumResponse };
  }

  @Get('full-intelligence')
  @ApiOperation({ summary: 'Get full GEO intelligence analysis (public test endpoint, no auth required)' })
  @ApiOkResponse({ description: 'Returns complete intelligence analysis with all 15 steps including opportunities and recommendations.' })
  async getFullIntelligence(@Query('domain') domain: string) {
    if (!domain || typeof domain !== 'string' || domain.trim().length === 0) {
      throw new BadRequestException('Domain query parameter is required');
    }
    return this.demoService.getFullIntelligence(domain);
  }
}


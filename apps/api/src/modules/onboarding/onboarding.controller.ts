/**
 * Onboarding Controller
 * Handles onboarding state and data collection endpoints
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiParam,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../guards/workspace-access.guard';
import { OnboardingService } from './onboarding.service';
import {
  OnboardingStateDto,
  CompleteOnboardingRequestDto,
  StartOnboardingRequestDto,
  SaveOnboardingDataRequestDto,
} from './dto/onboarding.dto';

@ApiTags('Onboarding')
@ApiBearerAuth()
@Controller('onboarding')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class OnboardingController {
  private readonly logger = new Logger(OnboardingController.name);

  constructor(private readonly onboardingService: OnboardingService) {}

  /**
   * Get onboarding state for a workspace
   */
  @Get('state/:workspaceId')
  @ApiOperation({
    summary: 'Get onboarding state',
    description: 'Returns the current onboarding state for a workspace, including status, entry type, and suggested next screen.',
  })
  @ApiParam({
    name: 'workspaceId',
    description: 'Workspace ID',
    type: String,
  })
  @ApiOkResponse({
    description: 'Onboarding state retrieved successfully',
    type: OnboardingStateDto,
  })
  async getOnboardingState(
    @Param('workspaceId') workspaceId: string,
    @Request() req: any
  ): Promise<OnboardingStateDto> {
    // Extract user ID from JWT payload
    const userId = req.user?.sub || req.user?.userId || req.user?.id;
    
    if (!userId) {
      throw new Error('User ID not found in request');
    }

    this.logger.log(`Getting onboarding state for workspace ${workspaceId}, user ${userId}`);
    
    return this.onboardingService.getOnboardingState(userId, workspaceId);
  }

  /**
   * Mark onboarding as started
   */
  @Post('start')
  @ApiOperation({
    summary: 'Start onboarding',
    description: 'Marks onboarding as in_progress if it was not_started.',
  })
  @ApiBody({ type: StartOnboardingRequestDto })
  @ApiOkResponse({
    description: 'Onboarding started successfully',
    type: OnboardingStateDto,
  })
  async startOnboarding(
    @Body() body: StartOnboardingRequestDto,
    @Request() req: any
  ): Promise<OnboardingStateDto> {
    const userId = req.user?.sub || req.user?.userId || req.user?.id;
    
    if (!userId) {
      throw new Error('User ID not found in request');
    }

    this.logger.log(`Starting onboarding for workspace ${body.workspaceId}, user ${userId}`);
    
    await this.onboardingService.markOnboardingStarted(body.workspaceId, userId);
    
    return this.onboardingService.getOnboardingState(userId, body.workspaceId);
  }

  /**
   * Mark onboarding as completed
   */
  @Post('complete')
  @ApiOperation({
    summary: 'Complete onboarding',
    description: 'Marks onboarding as completed. Requires all required fields (primaryDomain, brandName, businessType) to be set.',
  })
  @ApiBody({ type: CompleteOnboardingRequestDto })
  @ApiOkResponse({
    description: 'Onboarding completed successfully',
    type: OnboardingStateDto,
  })
  async completeOnboarding(
    @Body() body: CompleteOnboardingRequestDto,
    @Request() req: any
  ): Promise<OnboardingStateDto> {
    const userId = req.user?.sub || req.user?.userId || req.user?.id;
    
    if (!userId) {
      throw new Error('User ID not found in request');
    }

    this.logger.log(`Completing onboarding for workspace ${body.workspaceId}, user ${userId}`);
    
    await this.onboardingService.markOnboardingCompleted(body.workspaceId, userId);
    
    return this.onboardingService.getOnboardingState(userId, body.workspaceId);
  }

  /**
   * Save onboarding data
   */
  @Post('data')
  @ApiOperation({
    summary: 'Save onboarding data',
    description: 'Saves onboarding data (domain, brand, business type, etc.) to the workspace. Validates required fields.',
  })
  @ApiBody({ type: SaveOnboardingDataRequestDto })
  @ApiOkResponse({
    description: 'Onboarding data saved successfully',
    type: OnboardingStateDto,
  })
  async saveOnboardingData(
    @Body() body: SaveOnboardingDataRequestDto,
    @Request() req: any
  ): Promise<OnboardingStateDto> {
    const userId = req.user?.sub || req.user?.userId || req.user?.id;
    
    if (!userId) {
      throw new Error('User ID not found in request');
    }

    this.logger.log(`Saving onboarding data for workspace ${body.workspaceId}, user ${userId}`);
    
    await this.onboardingService.saveOnboardingData(body.workspaceId, userId, body.data);
    
    return this.onboardingService.getOnboardingState(userId, body.workspaceId);
  }
}


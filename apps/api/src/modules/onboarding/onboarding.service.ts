/**
 * Onboarding Service
 * Handles onboarding state management and data collection
 */

import { Injectable, NotFoundException, ForbiddenException, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type {
  OnboardingStatus,
  OnboardingEntryType,
  NextScreen,
  OnboardingStateDto,
  OnboardingDataDto,
} from './dto/onboarding.dto';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get onboarding state for a workspace
   */
  async getOnboardingState(userId: string, workspaceId: string): Promise<OnboardingStateDto> {
    // Verify user has access to workspace
    const member = await this.prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId,
      },
    });

    if (!member) {
      throw new ForbiddenException('User does not have access to this workspace');
    }

    // Load workspace
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    // Normalize tier (database uses uppercase, API uses lowercase)
    const tier = this.normalizeTier(workspace.tier);

    // Determine nextScreen based on onboarding status
    const nextScreen: NextScreen = workspace.onboardingStatus === 'completed' 
      ? 'dashboard' 
      : 'onboarding';

    // Build pending items checklist
    const pendingItems = this.buildPendingItems(workspace);

    // Build onboarding data object
    const onboardingData = workspace.primaryDomain || workspace.brandName ? {
      primaryDomain: workspace.primaryDomain || undefined,
      brandName: workspace.brandName || undefined,
      businessType: workspace.businessType || undefined,
      location: workspace.location ? (typeof workspace.location === 'string' 
        ? JSON.parse(workspace.location) 
        : workspace.location) : undefined,
      competitors: workspace.competitors || [],
      goals: workspace.goals || [],
      businessSize: workspace.businessSize || undefined,
      userRole: workspace.userRole || undefined,
      copilotPreferences: workspace.copilotPreferences ? (typeof workspace.copilotPreferences === 'string'
        ? JSON.parse(workspace.copilotPreferences)
        : workspace.copilotPreferences) : undefined,
    } : undefined;

    return {
      workspaceId: workspace.id,
      tier,
      onboardingStatus: workspace.onboardingStatus as OnboardingStatus,
      onboardingEntryType: workspace.onboardingEntryType as OnboardingEntryType | null,
      nextScreen,
      pendingItems,
      onboardingData,
    };
  }

  /**
   * Mark onboarding as started
   */
  async markOnboardingStarted(workspaceId: string, userId: string): Promise<void> {
    // Verify access
    const member = await this.prisma.workspaceMember.findFirst({
      where: { workspaceId, userId },
    });

    if (!member) {
      throw new ForbiddenException('User does not have access to this workspace');
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    // Only update if status is 'not_started'
    if (workspace.onboardingStatus === 'not_started') {
      await this.updateWorkspaceField(workspaceId, 'onboardingStatus', 'in_progress');
      this.logger.log(`Onboarding started for workspace ${workspaceId}`);
    }
  }

  /**
   * Mark onboarding as completed
   */
  async markOnboardingCompleted(workspaceId: string, userId: string): Promise<void> {
    // Verify access
    const member = await this.prisma.workspaceMember.findFirst({
      where: { workspaceId, userId },
    });

    if (!member) {
      throw new ForbiddenException('User does not have access to this workspace');
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    // Validate required fields before marking as completed
    if (!workspace.primaryDomain || !workspace.brandName || !workspace.businessType) {
      throw new BadRequestException(
        'Cannot complete onboarding: missing required fields (primaryDomain, brandName, businessType)'
      );
    }

    await this.updateWorkspaceField(workspaceId, 'onboardingStatus', 'completed');
    this.logger.log(`Onboarding completed for workspace ${workspaceId}`);
  }

  /**
   * Save onboarding data
   */
  async saveOnboardingData(
    workspaceId: string,
    userId: string,
    data: OnboardingDataDto
  ): Promise<void> {
    // Verify access
    const member = await this.prisma.workspaceMember.findFirst({
      where: { workspaceId, userId },
    });

    if (!member) {
      throw new ForbiddenException('User does not have access to this workspace');
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    // Validate required fields
    if (!data.primaryDomain || !data.brandName || !data.businessType) {
      throw new BadRequestException('Missing required fields: primaryDomain, brandName, businessType');
    }

    // Build update fields and values separately to handle arrays and JSON
    const updateFields: string[] = [];
    const values: any[] = [workspaceId];
    let paramIndex = 2;

    // Required fields
    updateFields.push(`"primaryDomain" = $${paramIndex++}`);
    values.push(data.primaryDomain);
    
    updateFields.push(`"brandName" = $${paramIndex++}`);
    values.push(data.brandName);
    
    updateFields.push(`"businessType" = $${paramIndex++}`);
    values.push(data.businessType);

    // Optional fields
    if (data.location) {
      updateFields.push(`"location" = $${paramIndex++}::jsonb`);
      values.push(JSON.stringify(data.location));
    }

    if (data.userRole) {
      updateFields.push(`"userRole" = $${paramIndex++}`);
      values.push(data.userRole);
    }

    if (data.competitors && data.competitors.length > 0) {
      updateFields.push(`"competitors" = $${paramIndex++}::text[]`);
      values.push(data.competitors);
    } else {
      updateFields.push(`"competitors" = ARRAY[]::text[]`);
    }

    if (data.businessSize) {
      updateFields.push(`"businessSize" = $${paramIndex++}`);
      values.push(data.businessSize);
    }

    if (data.goals && data.goals.length > 0) {
      updateFields.push(`"goals" = $${paramIndex++}::text[]`);
      values.push(data.goals);
    } else {
      updateFields.push(`"goals" = ARRAY[]::text[]`);
    }

    if (data.copilotPreferences) {
      updateFields.push(`"copilotPreferences" = $${paramIndex++}::jsonb`);
      values.push(JSON.stringify(data.copilotPreferences));
    }

    // Update workspace using raw SQL
    const query = `UPDATE "workspaces" SET ${updateFields.join(', ')} WHERE "id" = $1 RETURNING *`;
    await this.prisma.$queryRaw(query, values);

    // If onboarding was not started, mark it as in_progress
    if (workspace.onboardingStatus === 'not_started') {
      await this.updateWorkspaceField(workspaceId, 'onboardingStatus', 'in_progress');
    }

    this.logger.log(`Onboarding data saved for workspace ${workspaceId}`);
  }

  /**
   * Helper: Update a single workspace field
   */
  private async updateWorkspaceField(
    workspaceId: string,
    field: string,
    value: any
  ): Promise<void> {
    const query = `UPDATE "workspaces" SET "${field}" = $1 WHERE "id" = $2`;
    await this.prisma.$queryRaw(query, [value, workspaceId]);
  }

  /**
   * Helper: Normalize tier from database format to API format
   */
  private normalizeTier(tier: string): 'free' | 'insights' | 'copilot' | 'enterprise' {
    const normalized = tier.toLowerCase();
    if (['free', 'insights', 'copilot', 'enterprise'].includes(normalized)) {
      return normalized as 'free' | 'insights' | 'copilot' | 'enterprise';
    }
    return 'free';
  }

  /**
   * Helper: Build pending items checklist
   */
  private buildPendingItems(workspace: any): string[] {
    const items: string[] = [];

    if (!workspace.primaryDomain) {
      items.push('Add primary domain');
    }

    if (!workspace.brandName) {
      items.push('Add brand name');
    }

    if (!workspace.businessType) {
      items.push('Select business type');
    }

    if (!workspace.location) {
      items.push('Add location (optional)');
    }

    if (!workspace.competitors || workspace.competitors.length === 0) {
      items.push('Add competitors (optional)');
    }

    return items;
  }

  /**
   * Initialize onboarding for a new workspace
   * 
   * Call this method when creating a new workspace to set onboarding defaults:
   * - For normal signups: entryType = 'self_serve', status = 'not_started'
   * - For enterprise/invited: entryType = 'enterprise' or 'invited', status = 'in_progress'
   * - For demo/instant summary: entryType = 'instant_summary', status = 'not_started'
   * 
   * NOTE: The Prisma schema has defaults, but calling this ensures correct entryType.
   * If workspace is created via raw SQL, call this after creation.
   */
  async initializeOnboarding(
    workspaceId: string,
    entryType: OnboardingEntryType,
    tier?: string
  ): Promise<void> {
    const onboardingStatus: OnboardingStatus = 
      entryType === 'enterprise' || entryType === 'invited' 
        ? 'in_progress' 
        : 'not_started';

    await this.updateWorkspaceField(workspaceId, 'onboardingEntryType', entryType);
    await this.updateWorkspaceField(workspaceId, 'onboardingStatus', onboardingStatus);

    this.logger.log(
      `Initialized onboarding for workspace ${workspaceId}: entryType=${entryType}, status=${onboardingStatus}`
    );
  }
}


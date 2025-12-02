/**
 * Onboarding Complete Guard
 * Ensures workspace has completed onboarding (has primaryDomain) before accessing dashboard
 */

import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../modules/database/prisma.service';

@Injectable()
export class OnboardingCompleteGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Get workspaceId from various sources
    let workspaceId = user.workspaceId;
    
    // If not in JWT, try to get from query params or body
    if (!workspaceId) {
      workspaceId = request.query?.workspaceId || request.body?.workspaceId;
    }

    // If still not found, get user's first workspace
    if (!workspaceId) {
      const userId = user.sub || user.userId;
      if (userId) {
        const membership = await this.prisma.workspaceMember.findFirst({
          where: { userId },
          include: { workspace: true },
          orderBy: { joinedAt: 'asc' },
        });
        if (membership) {
          workspaceId = membership.workspaceId;
        }
      }
    }

    if (!workspaceId) {
      throw new ForbiddenException('Workspace context required');
    }

    // Get workspace to check onboarding status
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        onboardingStatus: true,
        primaryDomain: true,
      },
    });

    if (!workspace) {
      throw new ForbiddenException('Workspace not found');
    }

    // Check if onboarding is complete (has primaryDomain)
    if (!workspace.primaryDomain || workspace.onboardingStatus !== 'completed') {
      // Return a specific error that frontend can handle
      throw new ForbiddenException({
        code: 'ONBOARDING_REQUIRED',
        message: 'Onboarding must be completed before accessing dashboard',
        onboardingStatus: workspace.onboardingStatus,
        hasDomain: !!workspace.primaryDomain,
      });
    }

    return true;
  }
}


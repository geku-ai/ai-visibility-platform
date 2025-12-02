/**
 * Authentication service
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private prisma: PrismaService) {}

  async validateUser(email: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        members: {
          include: {
            workspace: true,
          },
        },
      },
    });

    if (user) {
      return user;
    }
    return null;
  }

  /**
   * Get or create user workspaces
   * If user has no workspaces, creates one with self_serve onboarding
   */
  async getUserWorkspaces(userId: string, email: string): Promise<any[]> {
    // First, ensure user exists
    let user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      // Create user if doesn't exist (from Clerk)
      user = await this.prisma.user.create({
        data: {
          id: userId,
          email,
          externalId: userId, // Clerk user ID
        },
      });
      this.logger.log(`Created new user: ${email} (${userId})`);
    }

    // Get existing workspaces
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId },
      include: {
        workspace: true,
      },
    });

    // If user has no workspaces, create one
    if (memberships.length === 0) {
      this.logger.log(`No workspace found for user ${userId}, creating default workspace`);
      
      // Create workspace with self_serve onboarding
      const workspace = await this.prisma.workspace.create({
        data: {
          name: `${email.split('@')[0]}'s Workspace`,
          tier: 'FREE',
          onboardingStatus: 'not_started',
          onboardingEntryType: 'self_serve',
        },
      });

      // Add user as admin member
      await this.prisma.workspaceMember.create({
        data: {
          userId,
          workspaceId: workspace.id,
          role: 'ADMIN',
          joinedAt: new Date(),
        },
      });

      this.logger.log(`Created workspace ${workspace.id} for user ${userId}`);

      // Return the newly created workspace
      return [workspace];
    }

    return memberships.map((membership: any) => membership.workspace);
  }
}

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
      // Create user if doesn't exist (from Clerk) using raw SQL
      const userQuery = `
        INSERT INTO "users" ("id", "email", "externalId", "createdAt")
        VALUES ($1, $2, $3, $4)
        ON CONFLICT ("id") DO NOTHING
        RETURNING *
      `;
      const userResult = await this.prisma.$queryRaw<any>(
        userQuery,
        [userId, email, userId, new Date()]
      );
      user = userResult[0] || null;
      if (user) {
        this.logger.log(`Created new user: ${email} (${userId})`);
      }
    }

    // Get existing workspaces
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId },
    });

    // If user has no workspaces, create one
    if (memberships.length === 0) {
      this.logger.log(`No workspace found for user ${userId}, creating default workspace`);
      
      // Generate workspace ID
      const workspaceId = `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const workspaceName = `${email.split('@')[0]}'s Workspace`;
      
      // Create workspace with self_serve onboarding using raw SQL
      const workspaceQuery = `
        INSERT INTO "workspaces" ("id", "name", "tier", "onboardingStatus", "onboardingEntryType", "createdAt")
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;
      const workspaceResult = await this.prisma.$queryRaw<any>(
        workspaceQuery,
        [workspaceId, workspaceName, 'FREE', 'not_started', 'self_serve', new Date()]
      );
      const workspace = workspaceResult[0];

      // Add user as admin member
      const memberId = `member_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await this.prisma.workspaceMember.create({
        data: {
          id: memberId,
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

    // Get workspace details for existing memberships
    const workspaceIds = memberships.map((m: any) => m.workspaceId);
    const workspaces = await Promise.all(
      workspaceIds.map(async (id: string) => {
        return await this.prisma.workspace.findUnique({ where: { id } });
      })
    );

    return workspaces.filter(Boolean);
  }
}

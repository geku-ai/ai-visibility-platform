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
      // Handle missing or invalid email - use userId-based email if email is missing/invalid
      // This prevents duplicate key errors when multiple users have missing emails
      let safeEmail = email;
      if (!safeEmail || safeEmail === 'unknown@example.com' || safeEmail === 'missing' || !safeEmail.includes('@')) {
        // Use userId-based email to ensure uniqueness
        safeEmail = `${userId}@clerk.user`;
        this.logger.warn(`Email missing or invalid for user ${userId}, using generated email: ${safeEmail}`);
      }

      // Create user if doesn't exist (from Clerk) using raw SQL
      // Use ON CONFLICT to handle both id and email conflicts gracefully
      const userQuery = `
        INSERT INTO "users" ("id", "email", "externalId", "createdAt")
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT ("id") DO UPDATE SET "externalId" = EXCLUDED."externalId"
        RETURNING *
      `;
      try {
        const userResult = await this.prisma.$queryRaw<any[]>(
          userQuery,
          [userId, safeEmail, userId]
        );
        user = userResult && userResult.length > 0 ? userResult[0] : null;
        if (user) {
          this.logger.log(`Created new user: ${safeEmail} (${userId})`);
        }
      } catch (error: any) {
        // If email conflict, try with userId-based email
        if (error.message?.includes('users_email_key')) {
          this.logger.warn(`Email conflict for ${safeEmail}, retrying with userId-based email`);
          safeEmail = `${userId}@clerk.user`;
          const retryResult = await this.prisma.$queryRaw<any[]>(
            userQuery,
            [userId, safeEmail, userId]
          );
          user = retryResult && retryResult.length > 0 ? retryResult[0] : null;
          if (user) {
            this.logger.log(`Created new user with fallback email: ${safeEmail} (${userId})`);
          }
        } else {
          throw error;
        }
      }
    }

    // Get existing workspaces using raw SQL (table name is workspace_members, not WorkspaceMember)
    const memberships = await this.prisma.$queryRaw<any[]>(
      `SELECT * FROM "workspace_members" WHERE "userId" = $1`,
      [userId]
    );

    // If user has no workspaces, create one
    if (memberships.length === 0) {
      this.logger.log(`No workspace found for user ${userId}, creating default workspace`);
      
      // Generate workspace ID
      const workspaceId = `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      // Handle email extraction safely
      const emailPrefix = user?.email?.split('@')[0] || userId.substring(0, 8);
      const workspaceName = `${emailPrefix}'s Workspace`;
      
      // Create workspace with self_serve onboarding using raw SQL (table name is workspaces, not Workspace)
      const workspaceResult = await this.prisma.$queryRaw<any[]>(
        `INSERT INTO "workspaces" ("id", "name", "tier", "onboardingStatus", "onboardingEntryType", "createdAt")
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING *`,
        [workspaceId, workspaceName, 'FREE', 'not_started', 'self_serve']
      );
      const workspace: any = workspaceResult && workspaceResult.length > 0 ? workspaceResult[0] : null;
      
      if (!workspace || !workspace.id) {
        throw new Error('Failed to create workspace');
      }

      // Add user as admin member using raw SQL (table name is workspace_members, not WorkspaceMember)
      const memberId = `member_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await this.prisma.$executeRaw(
        `INSERT INTO "workspace_members" ("id", "workspaceId", "userId", "role", "joinedAt")
         VALUES ($1, $2, $3, $4, NOW())`,
        [memberId, workspace.id, userId, 'ADMIN']
      );

      this.logger.log(`Created workspace ${workspace.id} for user ${userId}`);

      // Return the newly created workspace
      return [workspace];
    }

    // Get workspace details for existing memberships using raw SQL
    const workspaceIds = memberships.map((m: any) => m.workspaceId);
    if (workspaceIds.length === 0) {
      return [];
    }
    
    const placeholders = workspaceIds.map((_, i) => `$${i + 1}`).join(', ');
    const workspaces = await this.prisma.$queryRaw<any[]>(
      `SELECT * FROM "workspaces" WHERE id IN (${placeholders})`,
      workspaceIds
    );

    return workspaces.filter(Boolean);
  }
}

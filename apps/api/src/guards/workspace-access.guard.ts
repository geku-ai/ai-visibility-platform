import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { PrismaService } from '../modules/database/prisma.service';

@Injectable()
export class WorkspaceAccessGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    // Check for workspaceId in multiple places: params (GET), body (POST), headers
    const workspaceId = request.params.workspaceId || request.body?.workspaceId || request.headers['x-workspace-id'];
    // JWT payload has 'sub' or 'userId', not 'id'
    const userId = request.user?.sub || request.user?.userId || request.user?.id || request.headers['x-user-id'];

    if (!workspaceId || !userId) {
      console.error('[WorkspaceAccessGuard] Missing workspaceId or userId', {
        workspaceId,
        userId,
        userObject: request.user,
        requestBody: request.body,
        requestParams: request.params,
      });
      return false;
    }

    try {
      // Check if user is a member of the workspace
      const member = await this.prisma.workspaceMember.findFirst({
        where: {
          workspaceId,
          userId
        }
      });

      if (!member) {
        console.warn('[WorkspaceAccessGuard] User not a member of workspace', {
          workspaceId,
          userId,
        });
      }

      return !!member;
    } catch (error) {
      console.error('[WorkspaceAccessGuard] Workspace access check failed:', error);
      return false;
    }
  }
}
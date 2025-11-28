import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { WorkspaceMembersService } from './members.service';
import { WorkspaceInvitationsService } from './invitations.service';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../guards/workspace-access.guard';
import { GetWorkspaceId } from '../../decorators/workspace-id.decorator';
import { GetUserId } from '../../decorators/user-id.decorator';

export interface CreateInvitationRequest {
  email: string;
  role: 'ADMIN' | 'MEMBER' | 'VIEWER';
}

export interface UpdateMemberRoleRequest {
  role: 'ADMIN' | 'MEMBER' | 'VIEWER';
}

export interface AcceptInvitationRequest {
  token: string;
}

@ApiTags('Workspace Members')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/members')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class WorkspaceMembersController {
  constructor(
    private membersService: WorkspaceMembersService,
    private invitationsService: WorkspaceInvitationsService
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get workspace members' })
  @ApiResponse({ status: 200, description: 'Members retrieved successfully' })
  async getMembers(@GetWorkspaceId() workspaceId: string) {
    try {
      const members = await this.membersService.getWorkspaceMembers(workspaceId);
      
      return {
        ok: true,
        data: {
          members,
          total: members.length
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'MEMBERS_FETCH_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Post()
  @ApiOperation({ summary: 'Add member to workspace' })
  @ApiResponse({ status: 200, description: 'Member added successfully' })
  async addMember(
    @GetWorkspaceId() workspaceId: string,
    @GetUserId() userId: string,
    @Body() request: { userId: string; role: 'ADMIN' | 'MEMBER' | 'VIEWER' }
  ) {
    try {
      // Check if user has admin permission
      const hasPermission = await this.membersService.hasPermission(
        workspaceId,
        userId,
        'ADMIN'
      );

      if (!hasPermission) {
        return {
          ok: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'Admin permission required to add members'
          }
        };
      }

      const member = await this.membersService.addMember(
        workspaceId,
        request.userId,
        request.role,
        userId
      );

      return {
        ok: true,
        data: member
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'MEMBER_ADD_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Delete(':memberId')
  @ApiOperation({ summary: 'Remove member from workspace' })
  @ApiResponse({ status: 200, description: 'Member removed successfully' })
  async removeMember(
    @GetWorkspaceId() workspaceId: string,
    @GetUserId() userId: string,
    @Param('memberId') memberId: string
  ) {
    try {
      // Check if user has admin permission
      const hasPermission = await this.membersService.hasPermission(
        workspaceId,
        userId,
        'ADMIN'
      );

      if (!hasPermission) {
        return {
          ok: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'Admin permission required to remove members'
          }
        };
      }

      await this.membersService.removeMember(workspaceId, memberId, userId);

      return {
        ok: true,
        data: {
          message: 'Member removed successfully'
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'MEMBER_REMOVE_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Put(':memberId/role')
  @ApiOperation({ summary: 'Update member role' })
  @ApiResponse({ status: 200, description: 'Member role updated successfully' })
  async updateMemberRole(
    @GetWorkspaceId() workspaceId: string,
    @GetUserId() userId: string,
    @Param('memberId') memberId: string,
    @Body() request: UpdateMemberRoleRequest
  ) {
    try {
      // Check if user has admin permission
      const hasPermission = await this.membersService.hasPermission(
        workspaceId,
        userId,
        'ADMIN'
      );

      if (!hasPermission) {
        return {
          ok: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'Admin permission required to update member roles'
          }
        };
      }

      const member = await this.membersService.updateMemberRole(
        workspaceId,
        memberId,
        request.role,
        userId
      );

      return {
        ok: true,
        data: member
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'MEMBER_ROLE_UPDATE_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Get('invitations')
  @ApiOperation({ summary: 'Get workspace invitations' })
  @ApiResponse({ status: 200, description: 'Invitations retrieved successfully' })
  async getInvitations(@GetWorkspaceId() workspaceId: string) {
    try {
      const invitations = await this.invitationsService.getWorkspaceInvitations(workspaceId);
      
      return {
        ok: true,
        data: {
          invitations,
          total: invitations.length
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'INVITATIONS_FETCH_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Post('invitations')
  @ApiOperation({ summary: 'Create workspace invitation' })
  @ApiResponse({ status: 200, description: 'Invitation created successfully' })
  async createInvitation(
    @GetWorkspaceId() workspaceId: string,
    @GetUserId() userId: string,
    @Body() request: CreateInvitationRequest
  ) {
    try {
      // Check if user has admin permission
      const hasPermission = await this.membersService.hasPermission(
        workspaceId,
        userId,
        'ADMIN'
      );

      if (!hasPermission) {
        return {
          ok: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'Admin permission required to create invitations'
          }
        };
      }

      const invitation = await this.invitationsService.createInvitation(
        workspaceId,
        request.email,
        request.role,
        userId
      );

      return {
        ok: true,
        data: invitation
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'INVITATION_CREATE_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Delete('invitations/:invitationId')
  @ApiOperation({ summary: 'Revoke workspace invitation' })
  @ApiResponse({ status: 200, description: 'Invitation revoked successfully' })
  async revokeInvitation(
    @GetWorkspaceId() workspaceId: string,
    @GetUserId() userId: string,
    @Param('invitationId') invitationId: string
  ) {
    try {
      // Check if user has admin permission
      const hasPermission = await this.membersService.hasPermission(
        workspaceId,
        userId,
        'ADMIN'
      );

      if (!hasPermission) {
        return {
          ok: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'Admin permission required to revoke invitations'
          }
        };
      }

      await this.invitationsService.revokeInvitation(invitationId, userId);

      return {
        ok: true,
        data: {
          message: 'Invitation revoked successfully'
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'INVITATION_REVOKE_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Post('invitations/accept')
  @ApiOperation({ summary: 'Accept workspace invitation' })
  @ApiResponse({ status: 200, description: 'Invitation accepted successfully' })
  async acceptInvitation(
    @GetUserId() userId: string,
    @Body() request: AcceptInvitationRequest
  ) {
    try {
      const invitation = await this.invitationsService.acceptInvitation(
        request.token,
        userId
      );

      return {
        ok: true,
        data: invitation
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'INVITATION_ACCEPT_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Get('permissions')
  @ApiOperation({ summary: 'Get user permissions for workspace' })
  @ApiResponse({ status: 200, description: 'Permissions retrieved successfully' })
  async getPermissions(
    @GetWorkspaceId() workspaceId: string,
    @GetUserId() userId: string
  ) {
    try {
      const role = await this.membersService.getUserRole(workspaceId, userId);
      
      if (!role) {
        return {
          ok: false,
          error: {
            code: 'NO_ACCESS',
            message: 'User does not have access to this workspace'
          }
        };
      }

      const permissions = {
        'OWNER': ['READ', 'WRITE', 'ADMIN', 'OWNER'],
        'ADMIN': ['READ', 'WRITE', 'ADMIN'],
        'MEMBER': ['READ', 'WRITE'],
        'VIEWER': ['READ']
      };

      return {
        ok: true,
        data: {
          role,
          permissions: permissions[role as keyof typeof permissions] || []
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'PERMISSIONS_FETCH_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }
}


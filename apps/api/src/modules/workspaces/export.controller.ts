import { Controller, Get, Post, Body, Param, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { WorkspaceExportService, GDPRDeletionService } from './gdpr.service';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../guards/workspace-access.guard';
import { GetWorkspaceId } from '../../decorators/workspace-id.decorator';
import { GetUserId } from '../../decorators/user-id.decorator';

export interface ExportRequest {
  format: 'json' | 'csv';
}

export interface DeletionRequest {
  reason: string;
}

@ApiTags('Workspace Export & GDPR')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class WorkspaceExportController {
  constructor(
    private exportService: WorkspaceExportService,
    private gdprService: GDPRDeletionService
  ) {}

  @Post('export')
  @ApiOperation({ summary: 'Export workspace data' })
  @ApiResponse({ status: 200, description: 'Export initiated successfully' })
  async exportWorkspace(
    @GetWorkspaceId() workspaceId: string,
    @GetUserId() userId: string,
    @Body() request: ExportRequest
  ) {
    try {
      // Check if user has admin permission
      const hasPermission = await this.checkAdminPermission(workspaceId, userId);
      if (!hasPermission) {
        return {
          ok: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'Admin permission required to export workspace data'
          }
        };
      }

      const result = await this.exportService.exportWorkspaceData(
        workspaceId,
        userId,
        request.format
      );

      return {
        ok: true,
        data: {
          downloadUrl: result.downloadUrl,
          expiresAt: result.expiresAt,
          message: 'Export completed successfully. Download link expires in 7 days.'
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'EXPORT_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Get('export/history')
  @ApiOperation({ summary: 'Get export history' })
  @ApiResponse({ status: 200, description: 'Export history retrieved successfully' })
  async getExportHistory(
    @GetWorkspaceId() workspaceId: string,
    @GetUserId() userId: string
  ) {
    try {
      const history = await this.exportService.getExportHistory(workspaceId);

      return {
        ok: true,
        data: {
          exports: history,
          total: history.length
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'EXPORT_HISTORY_FETCH_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Post('gdpr/delete')
  @ApiOperation({ summary: 'Initiate GDPR deletion request' })
  @ApiResponse({ status: 200, description: 'Deletion request initiated successfully' })
  async initiateDeletion(
    @GetWorkspaceId() workspaceId: string,
    @GetUserId() userId: string,
    @Body() request: DeletionRequest
  ) {
    try {
      const deletionRequest = await this.gdprService.initiateDeletionRequest(
        workspaceId,
        userId,
        request.reason
      );

      return {
        ok: true,
        data: {
          message: 'Deletion request initiated. Workspace will be deleted in 7 days.',
          scheduledFor: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
          reason: deletionRequest.reason
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'DELETION_REQUEST_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Post('gdpr/cancel')
  @ApiOperation({ summary: 'Cancel GDPR deletion request' })
  @ApiResponse({ status: 200, description: 'Deletion request cancelled successfully' })
  async cancelDeletion(
    @GetWorkspaceId() workspaceId: string,
    @GetUserId() userId: string
  ) {
    try {
      await this.gdprService.cancelDeletionRequest(workspaceId, userId);

      return {
        ok: true,
        data: {
          message: 'Deletion request cancelled successfully'
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'DELETION_CANCELLATION_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Get('gdpr/status')
  @ApiOperation({ summary: 'Get GDPR deletion status' })
  @ApiResponse({ status: 200, description: 'Deletion status retrieved successfully' })
  async getDeletionStatus(
    @GetWorkspaceId() workspaceId: string,
    @GetUserId() userId: string
  ) {
    try {
      const status = await this.gdprService.getDeletionStatus(workspaceId);

      return {
        ok: true,
        data: status
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'DELETION_STATUS_FETCH_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  /**
   * Check if user has admin permission
   */
  private async checkAdminPermission(workspaceId: string, userId: string): Promise<boolean> {
    // This would check the user's role in the workspace
    // For now, we'll assume they have permission if they're accessing the workspace
    return true;
  }
}


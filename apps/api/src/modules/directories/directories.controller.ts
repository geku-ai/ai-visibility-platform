import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DirectoryAutomationService, BusinessInfo, DirectorySubmission } from '@ai-visibility/automation';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../guards/workspace-access.guard';

@ApiTags('Directory Automation')
@ApiBearerAuth()
@Controller('directories')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class DirectoryController {
  constructor(private directoryService: DirectoryAutomationService) {}

  @Get('supported')
  @ApiOperation({ summary: 'Get supported directories' })
  @ApiResponse({ status: 200, description: 'Supported directories retrieved successfully' })
  async getSupportedDirectories() {
    const directories = this.directoryService.getSupportedDirectories();
    
    return {
      ok: true,
      data: directories,
    };
  }

  @Post('submit')
  @ApiOperation({ summary: 'Submit business to directory' })
  @ApiResponse({ status: 200, description: 'Business submitted successfully' })
  async submitToDirectory(
    @Param('workspaceId') workspaceId: string,
    @Body() request: {
      directory: string;
      businessInfo: BusinessInfo;
      authToken?: string;
    }
  ) {
    const submission = await this.directoryService.submitToDirectory(
      workspaceId,
      request.directory,
      request.businessInfo,
      request.authToken
    );
    
    return {
      ok: true,
      data: submission,
    };
  }

  @Post('submit-batch')
  @ApiOperation({ summary: 'Submit business to multiple directories' })
  @ApiResponse({ status: 200, description: 'Batch submission completed successfully' })
  async submitToMultipleDirectories(
    @Param('workspaceId') workspaceId: string,
    @Body() request: {
      directories: string[];
      businessInfo: BusinessInfo;
      authTokens?: Record<string, string>;
    }
  ) {
    const submissions = await this.directoryService.submitToMultipleDirectories(
      workspaceId,
      request.directories,
      request.businessInfo,
      request.authTokens
    );
    
    return {
      ok: true,
      data: {
        submissions,
        summary: {
          total: submissions.length,
          successful: submissions.filter((s: any) => s.status === 'submitted').length,
          failed: submissions.filter((s: any) => s.status === 'failed').length,
        },
      },
    };
  }

  @Get('submissions')
  @ApiOperation({ summary: 'Get directory submissions for workspace' })
  @ApiResponse({ status: 200, description: 'Submissions retrieved successfully' })
  async getSubmissions(@Param('workspaceId') workspaceId: string) {
    // TODO: Implement database lookup for submissions
    const submissions: DirectorySubmission[] = [];
    
    return {
      ok: true,
      data: submissions,
    };
  }

  @Get('submissions/:id')
  @ApiOperation({ summary: 'Get submission status by ID' })
  @ApiResponse({ status: 200, description: 'Submission status retrieved successfully' })
  async getSubmissionStatus(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string
  ) {
    const submission = await this.directoryService.getSubmissionStatus(id);
    
    if (!submission) {
      return {
        ok: false,
        error: {
          code: 'SUBMISSION_NOT_FOUND',
          message: 'Submission not found',
        },
      };
    }
    
    return {
      ok: true,
      data: submission,
    };
  }

  @Put('submissions/:id/verify')
  @ApiOperation({ summary: 'Verify submission status' })
  @ApiResponse({ status: 200, description: 'Submission verification completed' })
  async verifySubmission(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string
  ) {
    const verified = await this.directoryService.verifySubmission(id);
    
    return {
      ok: true,
      data: {
        verified,
        message: verified ? 'Submission verified successfully' : 'Submission verification failed',
      },
    };
  }

  @Get('oauth/:directory')
  @ApiOperation({ summary: 'Get OAuth URLs for directory authentication' })
  @ApiResponse({ status: 200, description: 'OAuth URLs retrieved successfully' })
  async getOAuthUrls(
    @Param('directory') directory: string
  ) {
    const urls = this.directoryService.getOAuthUrls(directory);
    
    if (!urls.authUrl) {
      return {
        ok: false,
        error: {
          code: 'UNSUPPORTED_DIRECTORY',
          message: `OAuth not supported for directory: ${directory}`,
        },
      };
    }
    
    return {
      ok: true,
      data: urls,
    };
  }

  @Post('oauth/:directory/callback')
  @ApiOperation({ summary: 'Handle OAuth callback for directory' })
  @ApiResponse({ status: 200, description: 'OAuth callback processed successfully' })
  async handleOAuthCallback(
    @Param('directory') directory: string,
    @Body() request: {
      code: string;
      state?: string;
    }
  ) {
    try {
      // TODO: Implement full OAuth callback handling with actual token exchange
      // For now, validate the callback and return proper response structure
      console.log(`OAuth callback for ${directory}:`, request);
      
      if (!request.code) {
        return {
          ok: false,
          error: {
            code: 'OAUTH_CALLBACK_INVALID',
            message: 'OAuth callback code is missing'
          }
        };
      }

      // In a full implementation, you would:
      // 1. Exchange the code for an access token via the directory's OAuth endpoint
      // 2. Store the token securely in the database
      // 3. Associate it with the workspace
      
      // For now, return a structured response indicating the callback was received
      return {
        ok: true,
        data: {
          message: 'OAuth callback received. Token exchange will be implemented.',
          directory,
          status: 'pending',
          // Note: Actual token exchange needs to be implemented based on directory provider
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'OAUTH_CALLBACK_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Get('config/:directory')
  @ApiOperation({ summary: 'Get directory configuration' })
  @ApiResponse({ status: 200, description: 'Directory configuration retrieved successfully' })
  async getDirectoryConfig(
    @Param('directory') directory: string
  ) {
    const config = this.directoryService.getDirectoryConfig(directory);
    
    if (!config) {
      return {
        ok: false,
        error: {
          code: 'DIRECTORY_NOT_FOUND',
          message: `Directory not found: ${directory}`,
        },
      };
    }
    
    return {
      ok: true,
      data: config,
    };
  }

  @Post('validate')
  @ApiOperation({ summary: 'Validate business information' })
  @ApiResponse({ status: 200, description: 'Business information validated successfully' })
  async validateBusinessInfo(
    @Body() request: {
      businessInfo: BusinessInfo;
      directory?: string;
    }
  ) {
    try {
      const config = request.directory ? 
        this.directoryService.getDirectoryConfig(request.directory) : 
        null;
      
      // Basic validation
      const errors: string[] = [];
      
      if (!request.businessInfo.name) {
        errors.push('Business name is required');
      }
      
      if (!request.businessInfo.address) {
        errors.push('Business address is required');
      }
      
      if (!request.businessInfo.phone) {
        errors.push('Business phone is required');
      }
      
      if (request.businessInfo.website && !this.isValidUrl(request.businessInfo.website)) {
        errors.push('Invalid website URL format');
      }
      
      if (request.businessInfo.phone && !this.isValidPhoneNumber(request.businessInfo.phone)) {
        errors.push('Invalid phone number format');
      }
      
      return {
        ok: true,
        data: {
          valid: errors.length === 0,
          errors,
          warnings: [],
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private isValidPhoneNumber(phone: string): boolean {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
  }
}


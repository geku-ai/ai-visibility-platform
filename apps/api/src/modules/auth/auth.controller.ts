/**
 * Authentication controller
 */

import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { AuthService } from './auth.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully' })
  async getProfile(@Request() req: any) {
    const user = await this.authService.validateUser(req.user.email);
    
    // Ensure user exists and has workspace (creates if needed)
    const workspaces = await this.authService.getUserWorkspaces(
      req.user.sub || req.user.userId,
      req.user.email
    );
    
    return {
      user: {
        id: user?.id || req.user.sub || req.user.userId,
        email: req.user.email,
        externalId: user?.externalId || req.user.sub || req.user.userId,
        createdAt: user?.createdAt || new Date(),
      },
      workspaces,
    };
  }
}

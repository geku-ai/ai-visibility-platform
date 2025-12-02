/**
 * JWT authentication guard with DEBUG_JWT_MODE support
 */

import { Injectable, ExecutionContext, Logger, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

const logger = new Logger('JwtAuthGuard');

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | import('rxjs').Observable<boolean> {
    const debug = process.env.DEBUG_JWT_MODE === 'true' && process.env.NODE_ENV !== 'production';
    if (debug) {
      const req = context.switchToHttp().getRequest();
      // If no bearer or invalid, inject a debug user
      if (!req.headers.authorization) {
        req.user = { sub: 'debug-user', email: 'debug@example.com', workspaceId: 'debug-ws' };
        return true;
      }
    }
    
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    
    // Log JWT validation attempt for debugging
    if (!authHeader) {
      logger.warn(`[JWT Auth] No authorization header found for ${request.method} ${request.url}`);
    } else {
      const token = authHeader.replace('Bearer ', '');
      logger.log(`[JWT Auth] Validating token for ${request.method} ${request.url} (token length: ${token.length})`);
    }
    
    return super.canActivate(context);
  }
  
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    
    // Log detailed error information
    if (err || !user) {
      logger.error(`[JWT Auth] Authentication failed for ${request.method} ${request.url}`, {
        error: err?.message || 'Unknown error',
        info: info?.message || info?.name || 'No info',
        hasToken: !!request.headers.authorization,
        tokenPrefix: request.headers.authorization?.substring(0, 20) || 'none',
        url: request.url,
        method: request.method,
      });
      
      // Provide more helpful error message
      if (info) {
        if (info.name === 'TokenExpiredError') {
          throw new UnauthorizedException({
            code: 'TOKEN_EXPIRED',
            message: 'JWT token has expired. Please sign in again.',
            details: { expiredAt: info.expiredAt },
          });
        } else if (info.name === 'JsonWebTokenError') {
          throw new UnauthorizedException({
            code: 'INVALID_TOKEN',
            message: 'Invalid JWT token. Please check your authentication.',
            details: { error: info.message },
          });
        } else if (info.name === 'NotBeforeError') {
          throw new UnauthorizedException({
            code: 'TOKEN_NOT_ACTIVE',
            message: 'JWT token is not yet active.',
            details: { date: info.date },
          });
        }
      }
      
      if (err) {
        throw new UnauthorizedException({
          code: 'AUTH_ERROR',
          message: err.message || 'Authentication failed',
          details: { originalError: err.message },
        });
      }
      
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Please provide a valid JWT token.',
        details: { info: info?.message || 'No user found' },
      });
    }
    
    return user;
  }
}

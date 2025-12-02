/**
 * JWT strategy for Passport with JWKS support
 */

import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

const logger = new Logger('JwtStrategy');

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    const issuer = process.env.AUTH_JWT_ISSUER;
    const audience = process.env.AUTH_JWT_AUDIENCE;
    const jwksUri = process.env.AUTH_JWT_JWKS_URL;
    const jwtSecret = process.env.AUTH_JWT_SECRET;

    // If JWT config is missing, use a dummy secret (app will still start but JWT auth won't work)
    if (!issuer || !audience || (!jwksUri && !jwtSecret)) {
      logger.warn('JWT configuration missing. JWT authentication will be disabled.');
      super({
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        secretOrKey: jwtSecret || 'dummy-secret-for-startup',
        ignoreExpiration: false,
      });
      return;
    }

    // Try to use JWKS if URI is provided, otherwise fall back to secret
    let secretOrKeyProvider: any;
    let secretOrKey: string | undefined;

    if (jwksUri) {
      try {
        // Use require with error handling to avoid module loading issues
        // Wrap in try-catch to handle lru-cache compatibility issues
        let jwksRsa: any;
        try {
          jwksRsa = require('jwks-rsa');
        } catch (requireError) {
          logger.error(`Failed to load jwks-rsa: ${requireError instanceof Error ? requireError.message : String(requireError)}`);
          throw requireError;
        }
        
        try {
          secretOrKeyProvider = jwksRsa.passportJwtSecret({
            cache: true,
            cacheMaxEntries: 5,
            cacheMaxAge: 10 * 60 * 1000,
            jwksUri,
          });
        } catch (initError) {
          logger.error(`Failed to initialize JWKS client: ${initError instanceof Error ? initError.message : String(initError)}`);
          throw initError;
        }
      } catch (error) {
        logger.error(`JWKS initialization failed: ${error instanceof Error ? error.message : String(error)}`);
        logger.warn('Falling back to JWT secret authentication');
        secretOrKey = jwtSecret || 'dummy-secret-for-startup';
      }
    } else {
      secretOrKey = jwtSecret || 'dummy-secret-for-startup';
    }

    // For Clerk tokens, don't validate audience (Clerk uses 'azp' instead of 'aud')
    // Only validate audience if issuer doesn't contain 'clerk'
    const isClerkToken = issuer && issuer.includes('clerk');
    const shouldValidateAudience = audience && !isClerkToken;

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ...(secretOrKeyProvider ? { secretOrKeyProvider } : { secretOrKey }),
      ...(issuer ? { issuer, algorithms: ['RS256'] } : {}),
      ...(shouldValidateAudience ? { audience } : {}),
      ignoreExpiration: false,
    });
  }

  async validate(payload: any) {
    // Log full payload structure for debugging (sanitized)
    const payloadKeys = Object.keys(payload).filter(k => !k.includes('secret') && !k.includes('key'));
    logger.log(`[JWT Strategy] Validating payload: sub=${payload.sub}, email=${payload.email || 'missing'}, issuer=${payload.iss || 'missing'}, audience=${payload.aud || 'missing'}, availableClaims=${payloadKeys.join(',')}`);
    
    // Clerk JWT tokens may not include email for OAuth providers (Google, etc.)
    // Try multiple fallback locations for email
    let email = payload.email 
      || payload.email_address 
      || payload['https://clerk.com/email'] 
      || payload['email_verified'] 
      || null;
    
    // If email is still missing, log warning (AuthService will handle with userId-based email)
    if (!email) {
      logger.warn(`[JWT Strategy] Email not found in JWT payload for user ${payload.sub}. Available claims: ${payloadKeys.join(', ')}. Will use userId-based email fallback.`);
    }
    
    // map claims to user object
    const user = { 
      sub: payload.sub, 
      email: email || 'unknown@example.com', // Fallback - AuthService will replace with userId-based email
      userId: payload.sub,
      workspaceId: payload['workspaceId'] || payload['workspace_id'] || payload['https://clerk.com/workspaceId'] || null,
    };
    
    logger.log(`[JWT Strategy] Mapped user: ${JSON.stringify({ ...user, email: user.email.substring(0, 10) + '...' })}`);
    
    return user;
  }
}

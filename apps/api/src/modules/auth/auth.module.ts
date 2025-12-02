/**
 * Authentication module
 */

import { Module, Logger } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { JwtStrategy } from './jwt.strategy';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

const logger = new Logger('AuthModule');

// Factory to create JWT strategy with error handling
function createJwtStrategy() {
  try {
    return new JwtStrategy();
  } catch (error) {
    logger.error(`Failed to create JwtStrategy: ${error instanceof Error ? error.message : String(error)}`);
    logger.warn('JWT authentication will be disabled');
    return null;
  }
}

@Module({
  imports: [
    PassportModule,
    DatabaseModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get('AUTH_JWT_SECRET'),
        signOptions: {
          issuer: configService.get('AUTH_JWT_ISSUER'),
          audience: configService.get('AUTH_JWT_AUDIENCE'),
          expiresIn: '1h',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    AuthService,
    {
      provide: JwtStrategy,
      useFactory: createJwtStrategy,
    },
  ].filter(Boolean) as any, // Filter out null providers
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}

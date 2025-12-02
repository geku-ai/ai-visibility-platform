/**
 * Onboarding Module
 */

import { Module } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../database/prisma.service';

@Module({
  controllers: [OnboardingController],
  providers: [OnboardingService, PrismaService],
  exports: [OnboardingService],
})
export class OnboardingModule {}



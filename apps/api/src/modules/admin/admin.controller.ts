import { Controller, Get, UseGuards, Request, Inject } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { PrismaService } from '../database/prisma.service';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(
    @InjectQueue('runPrompt') private runPromptQ: Queue,
    @InjectQueue('runBatch') private runBatchQ: Queue,
    @InjectQueue('dailyAggregations') private dailyAggQ: Queue,
    @InjectQueue('copilotPlanner') private plannerQ: Queue,
    private prisma: PrismaService,
  ) {}

  @Get('system')
  async getSystem(@Request() req: any): Promise<any> {
    const [runPrompt, runBatch, dailyAgg, planner] = await Promise.all([
      this.runPromptQ.getWaitingCount(),
      this.runBatchQ.getWaitingCount(),
      this.dailyAggQ.getWaitingCount(),
      this.plannerQ.getWaitingCount(),
    ]);

    const providers = {
      MOCK_PROVIDERS: process.env.MOCK_PROVIDERS === 'true',
      PERPLEXITY_ENABLED: process.env.PERPLEXITY_ENABLED === 'true',
      AIO_ENABLED: process.env.AIO_ENABLED === 'true',
      BRAVE_ENABLED: process.env.BRAVE_ENABLED === 'true',
    };

    // simple DB check
    const dbOk = await this.prisma.$queryRaw('SELECT 1 as ok');

    return {
      queues: { runPrompt, runBatch, dailyAgg, planner },
      providers,
      db: { ok: true },
      redis: { ok: true }, // if you have a redis service, ping and report here
      budgets: {
        defaultDailyCents: Number(process.env.BUDGET_DAILY_DEFAULT ?? 500),
        autoThrottle: process.env.AUTO_THROTTLE_ENABLED === 'true',
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * TEMPORARY: Run onboarding migration
   * TODO: Remove this endpoint after migration is complete
   * NOTE: Auth temporarily disabled for one-time migration
   */
  @Get('migrate/onboarding')
  @UseGuards() // Override class-level guard - temporarily no auth required
  async runOnboardingMigration(): Promise<any> {
    try {
      const migrationSQL = `
        ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "onboardingStatus" TEXT NOT NULL DEFAULT 'not_started';
        ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "onboardingEntryType" TEXT;
        ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "primaryDomain" TEXT;
        ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "brandName" TEXT;
        ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "businessType" TEXT;
        ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "location" JSONB;
        ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "userRole" TEXT;
        ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "competitors" TEXT[] DEFAULT ARRAY[]::TEXT[];
        ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "businessSize" TEXT;
        ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "goals" TEXT[] DEFAULT ARRAY[]::TEXT[];
        ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "copilotPreferences" JSONB;
      `;

      await this.prisma.$executeRawUnsafe(migrationSQL);

      return {
        success: true,
        message: 'Onboarding migration completed successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      };
    }
  }
}

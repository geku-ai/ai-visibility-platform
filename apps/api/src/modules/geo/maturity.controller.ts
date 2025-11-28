/**
 * Maturity Controller
 * Provides endpoints for GEO maturity scores
 */

import { Controller, Get, Post, Body, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../guards/workspace-access.guard';
import { GetWorkspaceId } from '../../decorators/workspace-id.decorator';
import { GEOMaturityCalculatorService, GEOMaturityScore } from '@ai-visibility/geo';
import { EventEmitterService } from '../events/event-emitter.service';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';

@ApiTags('GEO Maturity')
@ApiBearerAuth()
@Controller('geo')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class MaturityController {
  constructor(
    private maturityCalculator: GEOMaturityCalculatorService,
    private eventEmitter: EventEmitterService,
    @InjectQueue('maturityRecompute') private maturityQueue: Queue
  ) {}

  @Get('maturity')
  @ApiOperation({ summary: 'Get GEO maturity score' })
  @ApiResponse({ status: 200, description: 'Maturity score retrieved successfully' })
  @ApiQuery({ name: 'workspaceId', required: false, description: 'Workspace ID' })
  async getMaturity(
    @GetWorkspaceId() workspaceId: string,
    @Query('workspaceId') queryWorkspaceId?: string
  ): Promise<GEOMaturityScore> {
    const targetWorkspaceId = queryWorkspaceId || workspaceId;
    
    // Try to get from database first
    try {
      const Pool = require('pg').Pool;
      const dbPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      });

      const result = await dbPool.query(
        'SELECT * FROM "geo_maturity_scores" WHERE "workspaceId" = $1',
        [targetWorkspaceId]
      );

      if (result.rows.length > 0) {
        const row = result.rows[0];
        return {
          entityStrength: row.entityStrength,
          citationDepth: row.citationDepth,
          structuralClarity: row.structuralClarity,
          updateCadence: row.updateCadence,
          overallScore: row.overallScore,
          maturityLevel: row.maturityLevel,
          recommendations: row.recommendations || [],
        };
      }
    } catch (error) {
      console.warn('Error fetching maturity score from DB:', error);
    }

    // Compute if not found
    return this.maturityCalculator.calculateMaturityScore(targetWorkspaceId);
  }

  @Post('recompute')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Recompute GEO maturity score' })
  @ApiResponse({ status: 202, description: 'Maturity recompute job enqueued' })
  @ApiBody({ schema: { type: 'object', properties: { workspaceId: { type: 'string' } } } })
  async recomputeMaturity(
    @GetWorkspaceId() workspaceId: string,
    @Body() body?: { workspaceId?: string }
  ): Promise<{ jobId: string; status: string }> {
    const targetWorkspaceId = body?.workspaceId || workspaceId;

    // Enqueue job
    const job = await this.maturityQueue.add('recompute', {
      workspaceId: targetWorkspaceId,
      timestamp: new Date().toISOString(),
    });

    // Emit SSE event
    await this.eventEmitter.emitToWorkspace(targetWorkspaceId, 'maturity.recomputing', {
      jobId: job.id,
      workspaceId: targetWorkspaceId,
    });

    return {
      jobId: job.id!,
      status: 'accepted',
    };
  }

  @Get('maturity/history')
  @ApiOperation({ summary: 'Get maturity score history' })
  @ApiResponse({ status: 200, description: 'Maturity history retrieved successfully' })
  @ApiQuery({ name: 'workspaceId', required: false, description: 'Workspace ID' })
  @ApiQuery({ name: 'timeRange', required: false, description: 'Time range (e.g., 30d, 90d, 180d)' })
  async getMaturityHistory(
    @GetWorkspaceId() workspaceId: string,
    @Query('workspaceId') queryWorkspaceId?: string,
    @Query('timeRange') timeRange?: string
  ): Promise<{ ok: boolean; data: any[] }> {
    try {
      const targetWorkspaceId = queryWorkspaceId || workspaceId;
      
      // Parse time range (default: 30 days)
      let days = 30;
      if (timeRange) {
        const match = timeRange.match(/(\d+)([dwmy])/);
        if (match) {
          const value = parseInt(match[1], 10);
          const unit = match[2];
          switch (unit) {
            case 'd':
              days = value;
              break;
            case 'w':
              days = value * 7;
              break;
            case 'm':
              days = value * 30;
              break;
            case 'y':
              days = value * 365;
              break;
          }
        }
      }

      // Query history from database
      const Pool = require('pg').Pool;
      const dbPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      });

      const result = await dbPool.query(
        `SELECT * FROM "geo_maturity_scores" 
         WHERE "workspaceId" = $1 
         AND "updatedAt" >= NOW() - INTERVAL '${days} days'
         ORDER BY "updatedAt" ASC`,
        [targetWorkspaceId]
      );

      return {
        ok: true,
        data: result.rows.map((row: any) => ({
          date: row.updatedAt,
          overallScore: row.overallScore,
          entityStrength: row.entityStrength,
          citationDepth: row.citationDepth,
          structuralClarity: row.structuralClarity,
          updateCadence: row.updateCadence,
          maturityLevel: row.maturityLevel,
        })),
      };
    } catch (error) {
      return {
        ok: false,
        data: [],
      };
    }
  }
}


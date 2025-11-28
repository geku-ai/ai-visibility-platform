import { Controller, Get, Post, Put, Body, Param, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { HallucinationDetectorService, FactExtractorService, FactValidatorService } from '@ai-visibility/geo';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../guards/workspace-access.guard';

export interface HallucinationDetectionRequest {
  aiResponse: string;
  engineKey: string;
  promptId: string;
  options?: {
    minConfidence?: number;
    severityThreshold?: 'critical' | 'high' | 'medium' | 'low';
    includeCorrectFacts?: boolean;
  };
}

export interface MultipleResponsesDetectionRequest {
  responses: Array<{
    content: string;
    engine: string;
    promptId: string;
  }>;
  options?: {
    minConfidence?: number;
    severityThreshold?: 'critical' | 'high' | 'medium' | 'low';
    includeCorrectFacts?: boolean;
  };
}

export interface UpdateAlertRequest {
  status: 'open' | 'corrected' | 'dismissed';
  correction?: string;
  notes?: string;
}

export interface CorrectionSubmissionRequest {
  platform: string;
  correctionText: string;
  evidence?: string;
}

@ApiTags('Hallucination Alerts')
@ApiBearerAuth()
@Controller('alerts')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class HallucinationsController {
  constructor(
    private hallucinationDetector: HallucinationDetectorService,
    private factExtractor: FactExtractorService,
    private factValidator: FactValidatorService
  ) {}

  @Post('hallucinations/detect')
  @ApiOperation({ summary: 'Detect hallucinations in AI response' })
  @ApiResponse({ status: 200, description: 'Hallucinations detected successfully' })
  async detectHallucinations(
    @Param('workspaceId') workspaceId: string,
    @Body() request: HallucinationDetectionRequest
  ) {
    try {
      // Get real workspace profile from database
      const Pool = require('pg').Pool;
      const dbPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      });

      const profileResult = await dbPool.query(
        'SELECT * FROM "WorkspaceProfile" WHERE "workspaceId" = $1',
        [workspaceId]
      );

      if (profileResult.rows.length === 0) {
        return {
          ok: false,
          error: {
            code: 'WORKSPACE_PROFILE_NOT_FOUND',
            message: 'Workspace profile not found. Please create a workspace profile first.'
          }
        };
      }

      const profileRow = profileResult.rows[0];
      const profile = {
        id: profileRow.id,
        workspaceId: profileRow.workspaceId,
        businessName: profileRow.name,
        address: profileRow.address || '',
        phone: profileRow.phone || '',
        email: profileRow.email || '',
        website: profileRow.website || '',
        hours: profileRow.facts?.hours || {},
        services: profileRow.facts?.services || [],
        description: profileRow.description || '',
        verified: true,
        createdAt: profileRow.createdAt,
        updatedAt: profileRow.updatedAt,
        facts: profileRow.facts || {},
      };

      const alerts = await this.hallucinationDetector.detectHallucinations(
        workspaceId,
        request.aiResponse,
        request.engineKey,
        request.promptId,
        profile,
        request.options
      );

      return {
        ok: true,
        data: {
          alerts,
          summary: {
            total: alerts.length,
            critical: alerts.filter(a => a.severity === 'critical').length,
            high: alerts.filter(a => a.severity === 'high').length,
            medium: alerts.filter(a => a.severity === 'medium').length,
            low: alerts.filter(a => a.severity === 'low').length
          }
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'HALLUCINATION_DETECTION_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Post('hallucinations/detect-multiple')
  @ApiOperation({ summary: 'Detect hallucinations in multiple AI responses' })
  @ApiResponse({ status: 200, description: 'Hallucinations detected successfully' })
  async detectHallucinationsFromMultiple(
    @Param('workspaceId') workspaceId: string,
    @Body() request: MultipleResponsesDetectionRequest
  ) {
    try {
      // Get real workspace profile from database
      const Pool = require('pg').Pool;
      const dbPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      });

      const profileResult = await dbPool.query(
        'SELECT * FROM "WorkspaceProfile" WHERE "workspaceId" = $1',
        [workspaceId]
      );

      if (profileResult.rows.length === 0) {
        return {
          ok: false,
          error: {
            code: 'WORKSPACE_PROFILE_NOT_FOUND',
            message: 'Workspace profile not found. Please create a workspace profile first.'
          }
        };
      }

      const profileRow = profileResult.rows[0];
      const profile = {
        id: profileRow.id,
        workspaceId: profileRow.workspaceId,
        businessName: profileRow.businessName || profileRow.name,
        address: profileRow.address || '',
        phone: profileRow.phone || '',
        email: profileRow.email || '',
        website: profileRow.website || '',
        hours: profileRow.hours || {},
        services: profileRow.services || [],
        description: profileRow.description || '',
        verified: profileRow.verified || false,
        createdAt: profileRow.createdAt,
        updatedAt: profileRow.updatedAt,
        facts: profileRow.facts || {},
      };

      const alerts = await this.hallucinationDetector.detectHallucinationsFromMultipleResponses(
        workspaceId,
        request.responses,
        profile,
        request.options
      );

      return {
        ok: true,
        data: {
          alerts,
          summary: {
            total: alerts.length,
            critical: alerts.filter(a => a.severity === 'critical').length,
            high: alerts.filter(a => a.severity === 'high').length,
            medium: alerts.filter(a => a.severity === 'medium').length,
            low: alerts.filter(a => a.severity === 'low').length
          }
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'MULTIPLE_HALLUCINATION_DETECTION_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Get('hallucinations')
  @ApiOperation({ summary: 'Get hallucination alerts for workspace' })
  @ApiResponse({ status: 200, description: 'Alerts retrieved successfully' })
  async getHallucinations(
    @Param('workspaceId') workspaceId: string,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('engine') engine?: string,
    @Query('limit') limit?: number
  ) {
    try {
      // TODO: Implement database lookup
      const alerts: any[] = [];
      
      let filteredAlerts = alerts;
      
      if (status) {
        filteredAlerts = filteredAlerts.filter(alert => alert.status === status);
      }
      
      if (severity) {
        filteredAlerts = filteredAlerts.filter(alert => alert.severity === severity);
      }
      
      if (engine) {
        filteredAlerts = filteredAlerts.filter(alert => alert.engineKey === engine);
      }
      
      if (limit) {
        filteredAlerts = filteredAlerts.slice(0, limit);
      }

      return {
        ok: true,
        data: {
          alerts: filteredAlerts,
          total: filteredAlerts.length
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'HALLUCINATIONS_FETCH_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Get('hallucinations/:id')
  @ApiOperation({ summary: 'Get specific hallucination alert details' })
  @ApiResponse({ status: 200, description: 'Alert details retrieved successfully' })
  async getHallucination(
    @Param('workspaceId') workspaceId: string,
    @Param('id') alertId: string
  ) {
    try {
      // TODO: Implement database lookup
      const alert = null; // Mock implementation
      
      if (!alert) {
        return {
          ok: false,
          error: {
            code: 'HALLUCINATION_NOT_FOUND',
            message: 'Hallucination alert not found'
          }
        };
      }

      return {
        ok: true,
        data: alert
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'HALLUCINATION_FETCH_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Put('hallucinations/:id/status')
  @ApiOperation({ summary: 'Update hallucination alert status' })
  @ApiResponse({ status: 200, description: 'Alert status updated successfully' })
  async updateAlertStatus(
    @Param('workspaceId') workspaceId: string,
    @Param('id') alertId: string,
    @Body() request: UpdateAlertRequest
  ) {
    try {
      // TODO: Implement database update
      console.log(`Updating alert ${alertId} status to ${request.status}`);
      
      return {
        ok: true,
        data: {
          alertId,
          status: request.status,
          correction: request.correction,
          notes: request.notes,
          updatedAt: new Date()
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'STATUS_UPDATE_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Post('hallucinations/:id/correct')
  @ApiOperation({ summary: 'Submit correction for hallucination' })
  @ApiResponse({ status: 200, description: 'Correction submitted successfully' })
  async submitCorrection(
    @Param('workspaceId') workspaceId: string,
    @Param('id') alertId: string,
    @Body() request: CorrectionSubmissionRequest
  ) {
    try {
      // TODO: Implement correction submission
      console.log(`Submitting correction for alert ${alertId}:`, request);
      
      return {
        ok: true,
        data: {
          alertId,
          platform: request.platform,
          correctionText: request.correctionText,
          evidence: request.evidence,
          submittedAt: new Date()
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'CORRECTION_SUBMISSION_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Post('hallucinations/analyze-patterns')
  @ApiOperation({ summary: 'Analyze hallucination patterns' })
  @ApiResponse({ status: 200, description: 'Pattern analysis completed successfully' })
  async analyzePatterns(
    @Param('workspaceId') workspaceId: string,
    @Body() request: { alertIds: string[] }
  ) {
    try {
      // TODO: Get alerts from database
      const alerts: any[] = [];
      
      const analysis = await this.hallucinationDetector.analyzeHallucinationPatterns(
        workspaceId,
        alerts
      );

      return {
        ok: true,
        data: analysis
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'PATTERN_ANALYSIS_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Get('hallucinations/stats/summary')
  @ApiOperation({ summary: 'Get hallucination statistics summary' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  async getHallucinationStats(
    @Param('workspaceId') workspaceId: string,
    @Query('timeframe') timeframe?: string
  ) {
    try {
      // TODO: Get alerts from database
      const alerts: any[] = [];
      
      const stats = this.hallucinationDetector.getHallucinationStats(alerts);

      return {
        ok: true,
        data: {
          stats,
          timeframe: timeframe || 'all'
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'STATS_FETCH_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Post('facts/extract')
  @ApiOperation({ summary: 'Extract facts from AI response' })
  @ApiResponse({ status: 200, description: 'Facts extracted successfully' })
  async extractFacts(
    @Param('workspaceId') workspaceId: string,
    @Body() request: {
      aiResponse: string;
      engineKey: string;
    }
  ) {
    try {
      const facts = await this.factExtractor.extractFacts(
        workspaceId,
        request.aiResponse,
        request.engineKey
      );

      return {
        ok: true,
        data: {
          facts,
          total: facts.length
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'FACT_EXTRACTION_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Post('facts/validate')
  @ApiOperation({ summary: 'Validate facts against workspace profile' })
  @ApiResponse({ status: 200, description: 'Facts validated successfully' })
  async validateFacts(
    @Param('workspaceId') workspaceId: string,
    @Body() request: {
      facts: Array<{
        type: string;
        value: string;
        confidence: number;
        context: string;
        source: string;
      }>;
    }
  ) {
    try {
      // Get real workspace profile from database
      const Pool = require('pg').Pool;
      const dbPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      });

      const profileResult = await dbPool.query(
        'SELECT * FROM "WorkspaceProfile" WHERE "workspaceId" = $1',
        [workspaceId]
      );

      if (profileResult.rows.length === 0) {
        return {
          ok: false,
          error: {
            code: 'WORKSPACE_PROFILE_NOT_FOUND',
            message: 'Workspace profile not found. Please create a workspace profile first.'
          }
        };
      }

      const profileRow = profileResult.rows[0];
      const profile = {
        id: profileRow.id,
        workspaceId: profileRow.workspaceId,
        businessName: profileRow.businessName || profileRow.name,
        address: profileRow.address || '',
        phone: profileRow.phone || '',
        email: profileRow.email || '',
        website: profileRow.website || '',
        hours: profileRow.hours || {},
        services: profileRow.services || [],
        description: profileRow.description || '',
        verified: profileRow.verified || false,
        createdAt: profileRow.createdAt,
        updatedAt: profileRow.updatedAt,
        facts: profileRow.facts || {},
      };

      // Type cast and validate facts
      const facts = request.facts.map((f: any) => ({
        type: f.type as 'address' | 'hours' | 'phone' | 'services' | 'description' | 'website' | 'email',
        value: f.value,
        confidence: f.confidence || 0.7,
        context: f.context || '',
        source: f.source || 'unknown'
      }));

      const validationResults = await this.factValidator.validateFacts(
        facts,
        profile
      );

      return {
        ok: true,
        data: {
          validationResults,
          stats: this.factValidator.getValidationStats(validationResults)
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'FACT_VALIDATION_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Post('competitors/extract-mentions')
  @ApiOperation({ summary: 'Extract competitor mentions from AI response' })
  @ApiResponse({ status: 200, description: 'Competitor mentions extracted successfully' })
  async extractCompetitorMentions(
    @Param('workspaceId') workspaceId: string,
    @Body() request: {
      aiResponse: string;
      competitors: string[];
    }
  ) {
    try {
      const mentions = await this.factExtractor.extractCompetitorMentions(
        workspaceId,
        request.aiResponse,
        request.competitors
      );

      return {
        ok: true,
        data: {
          mentions,
          total: mentions.length
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'COMPETITOR_EXTRACTION_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }
}
import { Controller, Get, Post, Put, Body, Param, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CitationOpportunityService, DomainAnalyzerService, ImpactCalculatorService } from '@ai-visibility/geo';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../guards/workspace-access.guard';

export interface OpportunityAnalysisRequest {
  scanResults: any[];
  competitors: string[];
  minImpactScore?: number;
}

export interface CompetitorAnalysisRequest {
  scanResults: any[];
  competitors: string[];
}

export interface DomainAnalysisRequest {
  domain: string;
  scanResults: any[];
  competitors: string[];
}

export interface UpdateOpportunityRequest {
  status: 'identified' | 'outreach' | 'cited';
}

export interface TrackOutreachRequest {
  action: 'email_sent' | 'follow_up' | 'response_received' | 'cited';
  details?: string;
}

@ApiTags('Citation Opportunities')
@ApiBearerAuth()
@Controller('citations')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class OpportunitiesController {
  constructor(
    private opportunityService: CitationOpportunityService,
    private domainAnalyzer: DomainAnalyzerService,
    private impactCalculator: ImpactCalculatorService
  ) {}

  @Post('opportunities/analyze')
  @ApiOperation({ summary: 'Analyze scan results to identify citation opportunities' })
  @ApiResponse({ status: 200, description: 'Opportunities identified successfully' })
  async analyzeOpportunities(
    @Param('workspaceId') workspaceId: string,
    @Body() request: OpportunityAnalysisRequest
  ) {
    try {
      const opportunities = await this.opportunityService.identifyOpportunities(
        workspaceId,
        request.scanResults,
        request.competitors
      );

      // Filter by minimum impact score if specified
      const filteredOpportunities = request.minImpactScore !== undefined
        ? opportunities.filter(opp => opp.impactScore >= (request.minImpactScore || 0))
        : opportunities;

      return {
        ok: true,
        data: {
          opportunities: filteredOpportunities,
          total: filteredOpportunities.length,
          summary: {
            highImpact: filteredOpportunities.filter(opp => opp.impactScore >= 70).length,
            mediumImpact: filteredOpportunities.filter(opp => opp.impactScore >= 40 && opp.impactScore < 70).length,
            lowImpact: filteredOpportunities.filter(opp => opp.impactScore < 40).length
          }
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'OPPORTUNITY_ANALYSIS_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Get('opportunities')
  @ApiOperation({ summary: 'Get citation opportunities for workspace' })
  @ApiResponse({ status: 200, description: 'Opportunities retrieved successfully' })
  async getOpportunities(
    @Param('workspaceId') workspaceId: string,
    @Query('status') status?: string,
    @Query('minScore') minScore?: number,
    @Query('limit') limit?: number
  ) {
    try {
      // Get real opportunities from database
      const Pool = require('pg').Pool;
      const dbPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      });

      let query = 'SELECT * FROM "CitationOpportunity" WHERE "workspaceId" = $1';
      const params: any[] = [workspaceId];

      if (status) {
        query += ' AND status = $' + (params.length + 1);
        params.push(status);
      }

      if (minScore) {
        query += ' AND "impactScore" >= $' + (params.length + 1);
        params.push(minScore);
      }

      query += ' ORDER BY "impactScore" DESC';

      if (limit) {
        query += ' LIMIT $' + (params.length + 1);
        params.push(limit);
      } else {
        query += ' LIMIT 50';
      }

      const result = await dbPool.query(query, params);
      const opportunities = result.rows.map((row: any) => ({
        id: row.id,
        domain: row.domain,
        domainAuthority: row.domainAuthority,
        citationCount: row.citationCount,
        impactScore: row.impactScore,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));

      return {
        ok: true,
        data: {
          opportunities,
          total: opportunities.length
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'OPPORTUNITIES_FETCH_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Get('opportunities/:id')
  @ApiOperation({ summary: 'Get specific opportunity details' })
  @ApiResponse({ status: 200, description: 'Opportunity details retrieved successfully' })
  async getOpportunity(
    @Param('workspaceId') workspaceId: string,
    @Param('id') opportunityId: string
  ) {
    try {
      // Get real opportunity from database
      const Pool = require('pg').Pool;
      const dbPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      });

      const result = await dbPool.query(
        'SELECT * FROM "CitationOpportunity" WHERE "id" = $1 AND "workspaceId" = $2',
        [opportunityId, workspaceId]
      );

      if (result.rows.length === 0) {
        return {
          ok: false,
          error: {
            code: 'OPPORTUNITY_NOT_FOUND',
            message: 'Opportunity not found'
          }
        };
      }

      const row = result.rows[0];
      const opportunity = {
        id: row.id,
        workspaceId: row.workspaceId,
        domain: row.domain,
        domainAuthority: row.domainAuthority,
        citationCount: row.citationCount,
        impactScore: row.impactScore,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };

      return {
        ok: true,
        data: opportunity
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'OPPORTUNITY_FETCH_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Put('opportunities/:id/status')
  @ApiOperation({ summary: 'Update opportunity status' })
  @ApiResponse({ status: 200, description: 'Opportunity status updated successfully' })
  async updateOpportunityStatus(
    @Param('workspaceId') workspaceId: string,
    @Param('id') opportunityId: string,
    @Body() request: UpdateOpportunityRequest
  ) {
    try {
      await this.opportunityService.updateOpportunityStatus(
        opportunityId,
        request.status
      );

      return {
        ok: true,
        data: {
          opportunityId,
          status: request.status,
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

  @Post('opportunities/:id/outreach')
  @ApiOperation({ summary: 'Track outreach activity for opportunity' })
  @ApiResponse({ status: 200, description: 'Outreach tracked successfully' })
  async trackOutreach(
    @Param('workspaceId') workspaceId: string,
    @Param('id') opportunityId: string,
    @Body() request: TrackOutreachRequest
  ) {
    try {
      await this.opportunityService.trackOutreach(
        opportunityId,
        request.action,
        request.details
      );

      return {
        ok: true,
        data: {
          opportunityId,
          action: request.action,
          details: request.details,
          timestamp: new Date()
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'OUTREACH_TRACKING_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Post('competitors/analyze')
  @ApiOperation({ summary: 'Analyze competitor citation patterns' })
  @ApiResponse({ status: 200, description: 'Competitor analysis completed successfully' })
  async analyzeCompetitors(
    @Param('workspaceId') workspaceId: string,
    @Body() request: CompetitorAnalysisRequest
  ) {
    try {
      const competitorAnalyses = await this.opportunityService.analyzeCompetitorPatterns(
        workspaceId,
        request.scanResults,
        request.competitors
      );

      return {
        ok: true,
        data: {
          competitors: competitorAnalyses,
          summary: {
            totalCompetitors: competitorAnalyses.length,
            totalCitations: competitorAnalyses.reduce((sum, comp) => sum + comp.citationCount, 0),
            averageAuthority: competitorAnalyses.reduce((sum, comp) => sum + comp.averageAuthority, 0) / competitorAnalyses.length
          }
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'COMPETITOR_ANALYSIS_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Post('domains/analyze')
  @ApiOperation({ summary: 'Analyze specific domain for citation opportunities' })
  @ApiResponse({ status: 200, description: 'Domain analysis completed successfully' })
  async analyzeDomain(
    @Param('workspaceId') workspaceId: string,
    @Body() request: DomainAnalysisRequest
  ) {
    try {
      const analysis = await this.opportunityService.analyzeDomain(
        request.domain,
        request.scanResults,
        request.competitors
      );

      return {
        ok: true,
        data: analysis
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'DOMAIN_ANALYSIS_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Get('domains/:domain/metrics')
  @ApiOperation({ summary: 'Get domain authority metrics' })
  @ApiResponse({ status: 200, description: 'Domain metrics retrieved successfully' })
  async getDomainMetrics(
    @Param('domain') domain: string
  ) {
    try {
      const metrics = await this.domainAnalyzer.getDomainMetrics(domain);
      const category = await this.domainAnalyzer.getDomainCategory(domain);
      const isTrustworthy = await this.domainAnalyzer.isTrustworthy(domain);

      return {
        ok: true,
        data: {
          ...metrics,
          category,
          isTrustworthy
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'DOMAIN_METRICS_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Post('domains/compare')
  @ApiOperation({ summary: 'Compare multiple domains for authority' })
  @ApiResponse({ status: 200, description: 'Domain comparison completed successfully' })
  async compareDomains(
    @Body() request: { domains: string[] }
  ) {
    try {
      const metrics = await this.domainAnalyzer.analyzeMultipleDomains(request.domains);

      return {
        ok: true,
        data: {
          domains: metrics,
          comparison: {
            highestAuthority: metrics[0],
            lowestAuthority: metrics[metrics.length - 1],
            averageAuthority: metrics.reduce((sum, domain) => sum + domain.authority, 0) / metrics.length
          }
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'DOMAIN_COMPARISON_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Post('impact/calculate')
  @ApiOperation({ summary: 'Calculate detailed impact analysis' })
  @ApiResponse({ status: 200, description: 'Impact analysis completed successfully' })
  async calculateImpact(
    @Body() request: {
      domain: string;
      authority: number;
      citationCount: number;
      competitorCitations: Array<{
        competitor: string;
        frequency: number;
        context: string;
        sentiment: 'positive' | 'neutral' | 'negative';
      }>;
    }
  ) {
    try {
      const analysis = await this.impactCalculator.getDetailedImpactAnalysis(
        request.domain,
        request.authority,
        request.citationCount,
        request.competitorCitations
      );

      return {
        ok: true,
        data: analysis
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'IMPACT_CALCULATION_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Post('impact/roi')
  @ApiOperation({ summary: 'Calculate ROI estimate for outreach' })
  @ApiResponse({ status: 200, description: 'ROI calculation completed successfully' })
  async calculateROI(
    @Body() request: {
      domain: string;
      authority: number;
      estimatedEffort: number;
      successProbability?: number;
    }
  ) {
    try {
      const roi = await this.impactCalculator.calculateROI(
        request.domain,
        request.authority,
        request.estimatedEffort,
        request.successProbability
      );

      return {
        ok: true,
        data: roi
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'ROI_CALCULATION_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Post('impact/compare')
  @ApiOperation({ summary: 'Compare multiple opportunities for impact' })
  @ApiResponse({ status: 200, description: 'Opportunity comparison completed successfully' })
  async compareOpportunities(
    @Body() request: {
      opportunities: Array<{
        domain: string;
        authority: number;
        citationCount: number;
        competitorCitations: Array<{
          competitor: string;
          frequency: number;
          context: string;
          sentiment: 'positive' | 'neutral' | 'negative';
        }>;
      }>;
    }
  ) {
    try {
      const comparison = await this.impactCalculator.compareOpportunities(
        request.opportunities
      );

      return {
        ok: true,
        data: {
          opportunities: comparison,
          summary: {
            total: comparison.length,
            highPriority: comparison.filter(opp => opp.priority === 'high').length,
            mediumPriority: comparison.filter(opp => opp.priority === 'medium').length,
            lowPriority: comparison.filter(opp => opp.priority === 'low').length
          }
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'OPPORTUNITY_COMPARISON_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }
}
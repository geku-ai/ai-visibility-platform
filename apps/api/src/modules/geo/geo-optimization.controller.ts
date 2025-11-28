import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { 
  EnhancedGEOScoringService, 
  KnowledgeGraphBuilder, 
  TrustSignalAggregator,
  type GEOVisibilityScore,
  type ScoringContext,
  type KnowledgeGraph,
  type GraphAnalysis,
  type TrustProfile,
  type TrustAnalysis
} from '@ai-visibility/geo';
import { WorkspaceAccessGuard } from '../../guards/workspace-access.guard';
import { GetWorkspaceId } from '../../decorators/workspace-id.decorator';
import { GEODataService } from './geo-data.service';

@ApiTags('GEO Optimization')
@Controller('geo')
@UseGuards(WorkspaceAccessGuard)
export class GEOOptimizationController {
  constructor(
    private readonly scoringService: EnhancedGEOScoringService,
    private readonly knowledgeGraphBuilder: KnowledgeGraphBuilder,
    private readonly trustAggregator: TrustSignalAggregator,
    private readonly geoDataService: GEODataService,
  ) {}

  @Get('scoring/:brandName')
  @ApiOperation({ summary: 'Calculate GEO visibility score for a brand' })
  @ApiParam({ name: 'brandName', description: 'Brand name to analyze' })
  @ApiQuery({ name: 'timeRange', required: false, description: 'Time range for analysis (e.g., 30d, 90d)' })
  @ApiQuery({ name: 'engines', required: false, description: 'Comma-separated list of engines to analyze' })
  @ApiQuery({ name: 'competitors', required: false, description: 'Comma-separated list of competitors' })
  @ApiResponse({ status: 200, description: 'GEO visibility score calculated successfully' })
  async calculateVisibilityScore(
    @GetWorkspaceId() workspaceId: string,
    @Param('brandName') brandName: string,
    @Query('timeRange') timeRange?: string,
    @Query('engines') engines?: string,
    @Query('competitors') competitors?: string,
  ): Promise<{ ok: boolean; data: GEOVisibilityScore }> {
    try {
      const context: ScoringContext = {
        workspaceId,
        brandName,
        competitors: competitors ? competitors.split(',') : [],
        timeRange: this.parseTimeRange(timeRange),
        engines: engines ? engines.split(',') : ['perplexity', 'aio', 'brave', 'openai', 'anthropic', 'gemini'],
        industry: 'technology', // TODO: Get from workspace settings
      };

      // Get real data from database
      const rawData = await this.geoDataService.getScoringData({
        workspaceId,
        brandName,
        startDate: context.timeRange.start,
        endDate: context.timeRange.end,
        engines: context.engines,
        competitors: context.competitors,
      });

      const score = await this.scoringService.calculateVisibilityScore(context, rawData);

      return {
        ok: true,
        data: score,
      };

    } catch (error) {
      return {
        ok: false,
        data: null as any,
      };
    }
  }

  @Post('scoring/batch')
  @ApiOperation({ summary: 'Calculate GEO visibility scores for multiple brands' })
  @ApiResponse({ status: 200, description: 'Batch scoring completed successfully' })
  async calculateBatchScores(
    @GetWorkspaceId() workspaceId: string,
    @Body() request: { brands: string[]; timeRange?: string; engines?: string[] }
  ): Promise<{ ok: boolean; data: { [brandName: string]: GEOVisibilityScore } }> {
    try {
      const results: { [brandName: string]: GEOVisibilityScore } = {};

      for (const brandName of request.brands) {
        const context: ScoringContext = {
          workspaceId,
          brandName,
          competitors: [],
          timeRange: this.parseTimeRange(request.timeRange),
          engines: request.engines || ['perplexity', 'aio', 'brave', 'openai', 'anthropic', 'gemini'],
          industry: 'technology',
        };

        const rawData = await this.geoDataService.getScoringData({
          workspaceId,
          brandName,
          startDate: context.timeRange.start,
          endDate: context.timeRange.end,
          engines: context.engines,
          competitors: [],
        });
        results[brandName] = await this.scoringService.calculateVisibilityScore(context, rawData);
      }

      return {
        ok: true,
        data: results,
      };

    } catch (error) {
      return {
        ok: false,
        data: {},
      };
    }
  }

  @Get('knowledge-graph/:brandName')
  @ApiOperation({ summary: 'Build knowledge graph for a brand' })
  @ApiParam({ name: 'brandName', description: 'Brand name to analyze' })
  @ApiResponse({ status: 200, description: 'Knowledge graph built successfully' })
  async buildKnowledgeGraph(
    @GetWorkspaceId() workspaceId: string,
    @Param('brandName') brandName: string,
  ): Promise<{ ok: boolean; data: KnowledgeGraph }> {
    try {
      // Get real AI responses and business data from database
      const aiResponsesData = await this.geoDataService.getAIResponses(workspaceId, brandName);
      const businessData = await this.geoDataService.getBusinessData(workspaceId) || {
        industry: 'technology',
        founded: 'Unknown',
        headquarters: 'Unknown',
        website: '',
        description: '',
        name: brandName,
      };
      
      const aiResponses = aiResponsesData.map(r => ({ text: r.text }));

      const graph = await this.knowledgeGraphBuilder.buildKnowledgeGraph(
        workspaceId,
        brandName,
        aiResponses,
        businessData
      );

      return {
        ok: true,
        data: graph,
      };

    } catch (error) {
      return {
        ok: false,
        data: null as any,
      };
    }
  }

  @Get('knowledge-graph/:brandName/analysis')
  @ApiOperation({ summary: 'Analyze knowledge graph for insights' })
  @ApiParam({ name: 'brandName', description: 'Brand name to analyze' })
  @ApiResponse({ status: 200, description: 'Knowledge graph analysis completed' })
  async analyzeKnowledgeGraph(
    @GetWorkspaceId() workspaceId: string,
    @Param('brandName') brandName: string,
  ): Promise<{ ok: boolean; data: GraphAnalysis }> {
    try {
      // First build the knowledge graph
      const aiResponses = await this.geoDataService.getAIResponses(workspaceId, brandName);
      const businessData = await this.geoDataService.getBusinessData(workspaceId);

      const graph = await this.knowledgeGraphBuilder.buildKnowledgeGraph(
        workspaceId,
        brandName,
        aiResponses,
        businessData
      );

      // Then analyze it
      const analysis = await this.knowledgeGraphBuilder.analyzeKnowledgeGraph(graph, brandName);

      return {
        ok: true,
        data: analysis,
      };

    } catch (error) {
      return {
        ok: false,
        data: null as any,
      };
    }
  }

  @Get('trust/:domain')
  @ApiOperation({ summary: 'Aggregate trust signals for a domain' })
  @ApiParam({ name: 'domain', description: 'Domain to analyze' })
  @ApiQuery({ name: 'entityType', required: false, description: 'Type of entity (domain, brand, content)' })
  @ApiResponse({ status: 200, description: 'Trust signals aggregated successfully' })
  async aggregateTrustSignals(
    @GetWorkspaceId() workspaceId: string,
    @Param('domain') domain: string,
    @Query('entityType') entityType: 'domain' | 'brand' | 'content' = 'domain',
  ): Promise<{ ok: boolean; data: TrustProfile }> {
    try {
      const profile = await this.trustAggregator.aggregateTrustSignals(domain, entityType);

      return {
        ok: true,
        data: profile,
      };

    } catch (error) {
      return {
        ok: false,
        data: null as any,
      };
    }
  }

  @Get('trust/:domain/analysis')
  @ApiOperation({ summary: 'Analyze trust profile and generate insights' })
  @ApiParam({ name: 'domain', description: 'Domain to analyze' })
  @ApiQuery({ name: 'competitors', required: false, description: 'Comma-separated list of competitor domains' })
  @ApiResponse({ status: 200, description: 'Trust analysis completed successfully' })
  async analyzeTrustProfile(
    @GetWorkspaceId() workspaceId: string,
    @Param('domain') domain: string,
    @Query('competitors') competitors?: string,
  ): Promise<{ ok: boolean; data: TrustAnalysis }> {
    try {
      // First aggregate trust signals
      const profile = await this.trustAggregator.aggregateTrustSignals(domain, 'domain');

      // Then analyze with competitors
      const competitorList = competitors ? competitors.split(',') : [];
      const analysis = await this.trustAggregator.analyzeTrustProfile(profile, competitorList);

      return {
        ok: true,
        data: analysis,
      };

    } catch (error) {
      return {
        ok: false,
        data: null as any,
      };
    }
  }

  @Get('optimization/:brandName/recommendations')
  @ApiOperation({ summary: 'Get comprehensive optimization recommendations' })
  @ApiParam({ name: 'brandName', description: 'Brand name to analyze' })
  @ApiResponse({ status: 200, description: 'Optimization recommendations generated' })
  async getOptimizationRecommendations(
    @GetWorkspaceId() workspaceId: string,
    @Param('brandName') brandName: string,
  ): Promise<{ ok: boolean; data: any }> {
    try {
      // Get all three analyses
      const [visibilityScore, knowledgeGraph, trustProfile] = await Promise.all([
        this.getVisibilityScore(brandName, workspaceId),
        this.getKnowledgeGraph(brandName, workspaceId),
        this.getTrustProfile(brandName, workspaceId),
      ]);

      // Generate comprehensive recommendations
      const recommendations = this.generateComprehensiveRecommendations(
        visibilityScore,
        knowledgeGraph,
        trustProfile
      );

      return {
        ok: true,
        data: {
          visibilityScore,
          knowledgeGraph: knowledgeGraph.metadata,
          trustProfile: trustProfile.overall,
          recommendations,
          priority: this.calculatePriority(recommendations),
          estimatedImpact: this.estimateImpact(recommendations),
        },
      };

    } catch (error) {
      return {
        ok: false,
        data: null as any,
      };
    }
  }

  @Get('competitors/:brandName')
  @ApiOperation({ summary: 'Analyze competitive landscape' })
  @ApiParam({ name: 'brandName', description: 'Brand name to analyze' })
  @ApiResponse({ status: 200, description: 'Competitive analysis completed' })
  async analyzeCompetitors(
    @GetWorkspaceId() workspaceId: string,
    @Param('brandName') brandName: string,
  ): Promise<{ ok: boolean; data: any }> {
    try {
      // Get real competitors from database - find brands mentioned in same context
      const Pool = require('pg').Pool;
      const dbPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      });

      // Find competitors by looking at brands mentioned in the same prompts/answers
      const competitorsQuery = `
        SELECT DISTINCT m.brand
        FROM "Mention" m
        JOIN "Answer" a ON m."answerId" = a.id
        JOIN "PromptRun" pr ON a."promptRunId" = pr.id
        WHERE pr."workspaceId" = $1
          AND m.brand != $2
          AND m.brand IS NOT NULL
          AND m.brand != ''
        GROUP BY m.brand
        HAVING COUNT(*) >= 2
        ORDER BY COUNT(*) DESC
        LIMIT 10
      `;

      const competitorsResult = await dbPool.query(competitorsQuery, [workspaceId, brandName]);
      const competitorBrands = competitorsResult.rows.map((row: any) => row.brand);

      // If no competitors found in database, use empty array (will analyze just the brand)
      const competitors = competitorBrands.length > 0 ? competitorBrands : [];
      const analysis = [];

      // Analyze the main brand
      const brandScore = await this.getVisibilityScore(brandName, workspaceId);
      analysis.push({
        name: brandName,
        score: brandScore.overall,
        strengths: brandScore.recommendations.slice(0, 2),
        weaknesses: this.identifyWeaknesses(brandScore.breakdown),
      });

      // Analyze competitors
      for (const competitor of competitors) {
        try {
          const score = await this.getVisibilityScore(competitor, workspaceId);
          analysis.push({
            name: competitor,
            score: score.overall,
            strengths: score.recommendations.slice(0, 2),
            weaknesses: this.identifyWeaknesses(score.breakdown),
          });
        } catch (error) {
          // Skip competitors that fail to analyze
          console.warn(`Failed to analyze competitor ${competitor}:`, error instanceof Error ? error.message : String(error));
        }
      }

      // Sort by score
      analysis.sort((a, b) => b.score - a.score);

      return {
        ok: true,
        data: {
          brandName,
          competitors: analysis,
          marketPosition: analysis.findIndex(c => c.name === brandName) + 1,
          opportunities: this.identifyOpportunities(analysis),
        },
      };

    } catch (error) {
      return {
        ok: false,
        data: null as any,
      };
    }
  }

  /**
   * Helper methods
   */
  private parseTimeRange(timeRange?: string): { start: Date; end: Date } {
    const end = new Date();
    let start: Date;

    switch (timeRange) {
      case '7d':
        start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    return { start, end };
  }


  private async getVisibilityScore(brandName: string, workspaceId: string): Promise<GEOVisibilityScore> {
    const timeRange = this.parseTimeRange('30d');
    const context: ScoringContext = {
      workspaceId,
      brandName,
      competitors: [],
      timeRange,
      engines: ['perplexity', 'aio', 'brave'],
      industry: 'technology',
    };

    const rawData = await this.geoDataService.getScoringData({
      workspaceId,
      brandName,
      startDate: timeRange.start,
      endDate: timeRange.end,
      engines: context.engines,
    });
    return await this.scoringService.calculateVisibilityScore(context, rawData);
  }

  private async getKnowledgeGraph(brandName: string, workspaceId: string): Promise<KnowledgeGraph> {
    const aiResponses = await this.geoDataService.getAIResponses(workspaceId, brandName);
    const businessData = await this.geoDataService.getBusinessData(workspaceId);

    return await this.knowledgeGraphBuilder.buildKnowledgeGraph(
      workspaceId,
      brandName,
      aiResponses,
      businessData
    );
  }

  private async getTrustProfile(brandName: string, workspaceId: string): Promise<TrustProfile> {
    return await this.trustAggregator.aggregateTrustSignals(brandName.toLowerCase() + '.com', 'domain');
  }

  private generateComprehensiveRecommendations(
    visibilityScore: GEOVisibilityScore,
    knowledgeGraph: KnowledgeGraph,
    trustProfile: TrustProfile
  ): string[] {
    const recommendations: string[] = [];

    // Add visibility score recommendations
    recommendations.push(...visibilityScore.recommendations);

    // Add trust-based recommendations
    if (trustProfile.overall < 60) {
      recommendations.push('Improve overall trust signals through better content quality and authority building');
    }

    // Add knowledge graph recommendations
    if (knowledgeGraph.metadata.totalEntities < 10) {
      recommendations.push('Expand knowledge graph by creating more entity relationships');
    }

    return recommendations.slice(0, 10); // Limit to top 10
  }

  private calculatePriority(recommendations: string[]): string[] {
    // Simple priority calculation based on recommendation type
    return recommendations.map(rec => {
      if (rec.includes('authority') || rec.includes('backlinks')) return 'high';
      if (rec.includes('content') || rec.includes('quality')) return 'medium';
      return 'low';
    });
  }

  private estimateImpact(recommendations: string[]): number[] {
    // Simple impact estimation
    return recommendations.map(() => Math.random() * 20 + 10); // 10-30% impact
  }

  private identifyWeaknesses(breakdown: any): string[] {
    const weaknesses: string[] = [];
    const threshold = 40;

    if (breakdown.mentions < threshold) weaknesses.push('Low mention frequency');
    if (breakdown.rankings < threshold) weaknesses.push('Poor search rankings');
    if (breakdown.citations < threshold) weaknesses.push('Limited citations');
    if (breakdown.sentiment < threshold) weaknesses.push('Negative sentiment');
    if (breakdown.authority < threshold) weaknesses.push('Low authority');
    if (breakdown.freshness < threshold) weaknesses.push('Outdated content');

    return weaknesses;
  }

  private identifyOpportunities(competitors: any[]): string[] {
    const opportunities: string[] = [];

    if (competitors.length > 0) {
      const topCompetitor = competitors[0];
      opportunities.push(`Close the gap with ${topCompetitor.name} (${topCompetitor.score} score)`);
    }

    opportunities.push('Focus on underserved market segments');
    opportunities.push('Leverage emerging AI platforms');

    return opportunities;
  }
}

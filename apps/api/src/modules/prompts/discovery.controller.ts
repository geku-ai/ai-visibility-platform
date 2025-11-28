import { Controller, Get, Post, Put, Body, Param, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PromptDiscoveryService, PromptGeneratorService, EmbeddingsService, ClusteringService } from '@ai-visibility/prompts';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../guards/workspace-access.guard';

export interface DiscoveryRequest {
  industry: string;
  maxPrompts?: number;
  algorithm?: 'dbscan' | 'kmeans' | 'hierarchical';
  minClusterSize?: number;
  maxClusters?: number;
}

export interface ClusterScanRequest {
  clusterId: string;
  engines?: string[];
  priority?: number;
}

@ApiTags('Prompt Discovery')
@ApiBearerAuth()
@Controller('prompts')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class DiscoveryController {
  constructor(
    private discoveryService: PromptDiscoveryService,
    private promptGenerator: PromptGeneratorService,
    private embeddingsService: EmbeddingsService,
    private clusteringService: ClusteringService
  ) {}

  @Post('discover')
  @ApiOperation({ summary: 'Discover and cluster prompts for workspace' })
  @ApiResponse({ status: 200, description: 'Prompts discovered and clustered successfully' })
  async discoverPrompts(
    @Param('workspaceId') workspaceId: string,
    @Body() request: DiscoveryRequest
  ) {
    try {
      // 1. Discover prompts
      const discoveredPrompts = await this.discoveryService.discoverPrompts(
        workspaceId,
        request.industry,
        request.maxPrompts || 50
      );

      // 2. Generate embeddings
      const embeddings = await this.embeddingsService.generateEmbeddings(
        workspaceId,
        discoveredPrompts.map((p: any) => p.text)
      );

      // 3. Cluster prompts
      const clusteringOptions = {
        algorithm: request.algorithm || 'dbscan',
        minClusterSize: request.minClusterSize || 2,
        maxClusters: request.maxClusters || 10
      };

      const clusteringResult = await this.clusteringService.clusterPrompts(
        embeddings.map((e: any) => ({ text: e.text, embedding: e.embedding })),
        clusteringOptions
      );

      // 4. Save clusters
      const savedClusters = await this.discoveryService.clusterPrompts(
        workspaceId,
        discoveredPrompts
      );

      return {
        ok: true,
        data: {
          discoveredPrompts: discoveredPrompts.length,
          clusters: savedClusters,
          clustering: {
            algorithm: clusteringResult.algorithm,
            quality: clusteringResult.quality,
            outliers: clusteringResult.outliers.length
          }
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'DISCOVERY_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Get('clusters')
  @ApiOperation({ summary: 'Get prompt clusters for workspace' })
  @ApiResponse({ status: 200, description: 'Clusters retrieved successfully' })
  async getClusters(@Param('workspaceId') workspaceId: string) {
    try {
      // TODO: Implement database lookup
      const clusters = await this.discoveryService.getExistingClusters(workspaceId);
      
      return {
        ok: true,
        data: clusters
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'CLUSTERS_FETCH_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Get('clusters/:id')
  @ApiOperation({ summary: 'Get specific cluster details' })
  @ApiResponse({ status: 200, description: 'Cluster details retrieved successfully' })
  async getCluster(
    @Param('workspaceId') workspaceId: string,
    @Param('id') clusterId: string
  ) {
    try {
      // TODO: Implement database lookup
      const clusters = await this.discoveryService.getExistingClusters(workspaceId);
      const cluster = clusters.find((c: any) => c.id === clusterId);
      
      if (!cluster) {
        return {
          ok: false,
          error: {
            code: 'CLUSTER_NOT_FOUND',
            message: 'Cluster not found'
          }
        };
      }
      
      return {
        ok: true,
        data: cluster
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'CLUSTER_FETCH_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Post('clusters/:id/scan')
  @ApiOperation({ summary: 'Trigger scan for all prompts in cluster' })
  @ApiResponse({ status: 200, description: 'Cluster scan initiated successfully' })
  async scanCluster(
    @Param('workspaceId') workspaceId: string,
    @Param('id') clusterId: string,
    @Body() request: ClusterScanRequest
  ) {
    try {
      // TODO: Implement cluster scanning
      // This would trigger scans for all prompts in the cluster
      
      return {
        ok: true,
        data: {
          clusterId,
          scanId: `scan_${Date.now()}`,
          promptsCount: 0, // TODO: Get from cluster
          engines: request.engines || ['perplexity', 'aio', 'brave'],
          status: 'initiated'
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'CLUSTER_SCAN_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Post('generate')
  @ApiOperation({ summary: 'Generate prompts using LLM' })
  @ApiResponse({ status: 200, description: 'Prompts generated successfully' })
  async generatePrompts(
    @Param('workspaceId') workspaceId: string,
    @Body() request: {
      industry: string;
      intent?: string;
      tone?: string;
      count?: number;
    }
  ) {
    try {
      const generatedPrompts = await this.promptGenerator.generatePrompts(
        workspaceId,
        {
          industry: request.industry,
          intent: request.intent as any,
          tone: request.tone as any,
          length: 'medium'
        }
      );

      return {
        ok: true,
        data: {
          prompts: generatedPrompts.slice(0, request.count || 15),
          total: generatedPrompts.length
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'PROMPT_GENERATION_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Post('optimize')
  @ApiOperation({ summary: 'Optimize a prompt for better AI visibility' })
  @ApiResponse({ status: 200, description: 'Prompt optimized successfully' })
  async optimizePrompt(
    @Param('workspaceId') workspaceId: string,
    @Body() request: {
      prompt: string;
      targetIntent: string;
    }
  ) {
    try {
      const optimized = await this.promptGenerator.optimizePrompt(
        workspaceId,
        request.prompt,
        request.targetIntent
      );

      return {
        ok: true,
        data: optimized
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'PROMPT_OPTIMIZATION_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Post('variations')
  @ApiOperation({ summary: 'Generate variations of a prompt' })
  @ApiResponse({ status: 200, description: 'Prompt variations generated successfully' })
  async generateVariations(
    @Param('workspaceId') workspaceId: string,
    @Body() request: {
      prompt: string;
      count?: number;
    }
  ) {
    try {
      const variations = await this.promptGenerator.generateVariations(
        workspaceId,
        request.prompt,
        request.count || 5
      );

      return {
        ok: true,
        data: {
          original: request.prompt,
          variations
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'VARIATION_GENERATION_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Post('competitor-analysis')
  @ApiOperation({ summary: 'Generate prompts for competitor analysis' })
  @ApiResponse({ status: 200, description: 'Competitor analysis prompts generated successfully' })
  async generateCompetitorPrompts(
    @Param('workspaceId') workspaceId: string,
    @Body() request: {
      industry: string;
      competitors: string[];
    }
  ) {
    try {
      const prompts = await this.promptGenerator.generateCompetitorPrompts(
        workspaceId,
        request.industry,
        request.competitors
      );

      return {
        ok: true,
        data: {
          prompts,
          competitors: request.competitors,
          industry: request.industry
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'COMPETITOR_PROMPTS_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Post('brand-monitoring')
  @ApiOperation({ summary: 'Generate prompts for brand monitoring' })
  @ApiResponse({ status: 200, description: 'Brand monitoring prompts generated successfully' })
  async generateBrandMonitoringPrompts(
    @Param('workspaceId') workspaceId: string,
    @Body() request: {
      brandName: string;
      industry: string;
    }
  ) {
    try {
      const prompts = await this.promptGenerator.generateBrandMonitoringPrompts(
        workspaceId,
        request.brandName,
        request.industry
      );

      return {
        ok: true,
        data: {
          prompts,
          brandName: request.brandName,
          industry: request.industry
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'BRAND_MONITORING_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Post('similarity')
  @ApiOperation({ summary: 'Find similar prompts using embeddings' })
  @ApiResponse({ status: 200, description: 'Similar prompts found successfully' })
  async findSimilarPrompts(
    @Param('workspaceId') workspaceId: string,
    @Body() request: {
      query: string;
      candidates: string[];
      threshold?: number;
      limit?: number;
    }
  ) {
    try {
      const similar = await this.embeddingsService.findSimilarTexts(
        workspaceId,
        request.query,
        request.candidates,
        request.threshold || 0.7,
        request.limit || 10
      );

      return {
        ok: true,
        data: {
          query: request.query,
          similar,
          total: similar.length
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'SIMILARITY_SEARCH_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  @Put('clusters/:id/refresh')
  @ApiOperation({ summary: 'Refresh cluster with new prompts' })
  @ApiResponse({ status: 200, description: 'Cluster refreshed successfully' })
  async refreshCluster(
    @Param('workspaceId') workspaceId: string,
    @Param('id') clusterId: string
  ) {
    try {
      const refreshedClusters = await this.discoveryService.refreshClusters(workspaceId);
      const cluster = refreshedClusters.find((c: any) => c.id === clusterId);
      
      if (!cluster) {
        return {
          ok: false,
          error: {
            code: 'CLUSTER_NOT_FOUND',
            message: 'Cluster not found'
          }
        };
      }

      return {
        ok: true,
        data: {
          cluster,
          refreshedAt: new Date()
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'CLUSTER_REFRESH_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }
}
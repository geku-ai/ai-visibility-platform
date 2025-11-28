import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ContentGeneratorService, ContentGenerationRequest, GeneratedContent } from '@ai-visibility/content';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../guards/workspace-access.guard';

@ApiTags('Content Generation')
@ApiBearerAuth()
@Controller('content')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class ContentController {
  constructor(private contentGenerator: ContentGeneratorService) {}

  @Post('generate')
  @ApiOperation({ summary: 'Generate GEO-optimized content' })
  @ApiResponse({ status: 200, description: 'Content generated successfully' })
  async generateContent(
    @Param('workspaceId') workspaceId: string,
    @Body() request: ContentGenerationRequest
  ): Promise<{ ok: boolean; data: GeneratedContent }> {
    const content = await this.contentGenerator.generateContent(workspaceId, request);
    
    return {
      ok: true,
      data: content,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get generated content by ID' })
  @ApiResponse({ status: 200, description: 'Content retrieved successfully' })
  async getContent(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string
  ): Promise<{ ok: boolean; data: GeneratedContent }> {
    try {
      // Get real content from database
      // Note: Content may be stored in CopilotAction or a dedicated content table
      // For now, check if it's a CopilotAction with content_generation type
      const Pool = require('pg').Pool;
      const dbPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      });

      // Try to find content in CopilotAction table
      const actionResult = await dbPool.query(
        `SELECT * FROM "CopilotAction" 
         WHERE "id" = $1 AND "workspaceId" = $2 AND "actionType" = 'content_generation'`,
        [id, workspaceId]
      );

      if (actionResult.rows.length > 0) {
        const action = actionResult.rows[0];
        const content: GeneratedContent = {
          id: action.id,
          type: 'blog',
          title: (action.metadata as any)?.title || 'Generated Content',
          content: (action.metadata as any)?.content || action.result || '',
          metaDescription: (action.metadata as any)?.metaDescription || '',
          keywords: (action.metadata as any)?.keywords || [],
          cost: (action.costCents || 0) / 100,
          tokens: (action.metadata as any)?.tokens || { prompt: 0, completion: 0, total: 0 },
          createdAt: action.createdAt,
        };
        
        return {
          ok: true,
          data: content,
        };
      }

      // If not found, return error
      return {
        ok: false,
        error: {
          code: 'CONTENT_NOT_FOUND',
          message: 'Content not found. Content may not have been generated yet or the ID is invalid.'
        }
      } as any;
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'CONTENT_FETCH_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      } as any;
    }
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update generated content' })
  @ApiResponse({ status: 200, description: 'Content updated successfully' })
  async updateContent(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Body() updates: Partial<GeneratedContent>
  ): Promise<{ ok: boolean; data: GeneratedContent }> {
    // TODO: Implement content update in database
    console.log(`Updating content ${id} for workspace ${workspaceId}:`, updates);
    
    return {
      ok: true,
      data: {
        id,
        type: 'blog',
        title: 'Updated Content',
        content: 'This is updated content...',
        metaDescription: 'Updated meta description',
        keywords: ['updated', 'content'],
        cost: 0.05,
        tokens: { prompt: 100, completion: 200, total: 300 },
        createdAt: new Date(),
      },
    };
  }

  @Post(':id/export')
  @ApiOperation({ summary: 'Export content to PDF/DOCX' })
  @ApiResponse({ status: 200, description: 'Content exported successfully' })
  async exportContent(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Body() options: { format: 'pdf' | 'docx'; includeSchema?: boolean }
  ): Promise<{ ok: boolean; data: { downloadUrl: string; expiresAt: Date } }> {
    // TODO: Implement content export functionality
    console.log(`Exporting content ${id} for workspace ${workspaceId}:`, options);
    
    return {
      ok: true,
      data: {
        downloadUrl: `https://storage.example.com/exports/${id}.${options.format}`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    };
  }

  @Get('templates/:type')
  @ApiOperation({ summary: 'Get content templates by type' })
  @ApiResponse({ status: 200, description: 'Templates retrieved successfully' })
  async getTemplates(
    @Param('type') type: 'blog' | 'faq' | 'landing' | 'social'
  ): Promise<{ ok: boolean; data: { templates: any[] } }> {
    const templates = {
      blog: [
        { name: 'How-to Guide', description: 'Step-by-step instructional content' },
        { name: 'Industry Analysis', description: 'Deep dive into industry trends' },
        { name: 'Product Review', description: 'Comprehensive product analysis' },
      ],
      faq: [
        { name: 'Product FAQ', description: 'Common product questions' },
        { name: 'Service FAQ', description: 'Service-related questions' },
        { name: 'General FAQ', description: 'General company questions' },
      ],
      landing: [
        { name: 'Product Landing', description: 'Product-focused landing page' },
        { name: 'Service Landing', description: 'Service-focused landing page' },
        { name: 'Lead Generation', description: 'Lead capture landing page' },
      ],
      social: [
        { name: 'Educational Post', description: 'Educational social media content' },
        { name: 'Behind the Scenes', description: 'Company culture content' },
        { name: 'Industry News', description: 'Industry updates and news' },
      ],
    };
    
    return {
      ok: true,
      data: {
        templates: templates[type] || [],
      },
    };
  }

  @Post('batch-generate')
  @ApiOperation({ summary: 'Generate multiple content pieces in batch' })
  @ApiResponse({ status: 200, description: 'Batch content generation completed' })
  async batchGenerateContent(
    @Param('workspaceId') workspaceId: string,
    @Body() requests: ContentGenerationRequest[]
  ): Promise<{ ok: boolean; data: { results: GeneratedContent[]; totalCost: number } }> {
    const results: GeneratedContent[] = [];
    let totalCost = 0;
    
    for (const request of requests) {
      try {
        const content = await this.contentGenerator.generateContent(workspaceId, request);
        results.push(content);
        totalCost += content.cost;
      } catch (error) {
        console.error(`Failed to generate content for request:`, request, error);
        // Continue with other requests
      }
    }
    
    return {
      ok: true,
      data: {
        results,
        totalCost,
      },
    };
  }
}


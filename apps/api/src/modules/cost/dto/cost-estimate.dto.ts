/**
 * Cost Estimation DTOs
 */

import { ApiProperty } from '@nestjs/swagger';

export class ProviderCostBreakdownDto {
  @ApiProperty({ description: 'Provider identifier' })
  provider: string;

  @ApiProperty({ description: 'Estimated number of requests' })
  estimatedRequests: number;

  @ApiProperty({ description: 'Estimated tokens (for LLM providers)' })
  estimatedTokens: number;

  @ApiProperty({ description: 'Estimated cost in USD' })
  estimatedUsd: number;
}

export class CostEstimateMetadataDto {
  @ApiProperty({ description: 'Industry context', required: false })
  industry?: string;

  @ApiProperty({ description: 'Expected number of prompts', required: false })
  promptCount?: number;

  @ApiProperty({ description: 'Expected number of competitors', required: false })
  competitorCount?: number;

  @ApiProperty({ description: 'Expected number of opportunities', required: false })
  opportunityCount?: number;

  @ApiProperty({ description: 'Estimate generation timestamp' })
  generatedAt: string;
}

export class CostEstimateResponseDto {
  @ApiProperty({ description: 'Scenario identifier' })
  scenario: string;

  @ApiProperty({ description: 'Total estimated cost in USD' })
  totalUsd: number;

  @ApiProperty({
    description: 'Cost breakdown per provider',
    type: [ProviderCostBreakdownDto],
  })
  perProvider: ProviderCostBreakdownDto[];

  @ApiProperty({
    description: 'Assumptions made in this estimate',
    type: [String],
  })
  assumptions: string[];

  @ApiProperty({ description: 'Confidence level (0-1)' })
  confidence: number;

  @ApiProperty({ description: 'Estimated number of LLM calls', required: false })
  estimatedLLMCalls?: number;

  @ApiProperty({ description: 'Estimated number of search API calls', required: false })
  estimatedSearchCalls?: number;

  @ApiProperty({ description: 'Estimated total tokens (LLM only)', required: false })
  estimatedTotalTokens?: number;

  @ApiProperty({
    description: 'Estimate metadata',
    type: CostEstimateMetadataDto,
    required: false,
  })
  metadata?: CostEstimateMetadataDto;
}

export class CopilotCostEstimateQueryDto {
  @ApiProperty({ description: 'Automation level', enum: ['low', 'medium', 'high'], required: false })
  automationLevel?: 'low' | 'medium' | 'high';

  @ApiProperty({ description: 'Pages optimized per week', required: false })
  pagesPerWeek?: number;

  @ApiProperty({ description: 'Review responses per week', required: false })
  reviewResponsesPerWeek?: number;
}



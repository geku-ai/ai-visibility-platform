/**
 * DTOs for Instant Summary V2 endpoint
 * Backend-only types
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Instant Summary Response V2
 */
export class InstantSummaryResponseV2Dto {
  @ApiProperty({ example: 'example.com' })
  domain: string;

  @ApiProperty()
  industry: {
    primary: string;
    confidence: number;
  };

  @ApiProperty()
  summary: {
    whatYouDo: string;
    whereYouOperate: string;
    whoYouServe: string;
    whyYouStandOut?: string;
  };

  @ApiProperty()
  geoScore: {
    overall: number;
    components: {
      visibility: number;
      trust: number;
      citations: number;
      schema: number;
    };
    explanation: string;
  };

  @ApiProperty({ type: [Object] })
  visibilitySnapshot: {
    engines: Array<{
      key: 'chatgpt' | 'claude' | 'gemini' | 'perplexity';
      visible: boolean;
      confidence: number;
      samplePrompt?: string;
      evidenceSnippet?: string;
    }>;
  };

  @ApiProperty({ type: [String], example: ['High commercial value opportunity detected', 'Missing citations from licensed publishers'] })
  topInsights: string[];

  @ApiProperty()
  ctaHints: {
    shouldSignUpForCopilot: boolean;
    reasons: string[];
  };

  @ApiProperty()
  metadata: {
    generatedAt: string;
    serviceVersion: string;
    confidence: number;
  };
}


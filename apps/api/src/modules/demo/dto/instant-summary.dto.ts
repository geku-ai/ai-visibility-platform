/**
 * DTOs for Instant Summary API endpoints
 * Backend-only types for request/response validation
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Instant Summary V2 Response
 * Lightweight summary for public/free funnel
 */
export class InstantSummaryResponseV2Dto {
  @ApiProperty({ example: 'booking.com' })
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

  @ApiProperty()
  visibilitySnapshot: {
    engines: Array<{
      key: 'chatgpt' | 'claude' | 'gemini' | 'perplexity';
      visible: boolean;
      confidence: number;
      samplePrompt?: string;
      evidenceSnippet?: string;
    }>;
  };

  @ApiProperty({ type: [String], minItems: 3, maxItems: 7 })
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
    warnings?: string[];
  };
}



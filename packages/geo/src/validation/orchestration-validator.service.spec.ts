/**
 * Tests for Orchestration Validator Service
 * 
 * Focus on:
 * - Response validation
 * - GEO Score formula validation
 * - Data quality thresholds
 * - Type safety
 */

import { Test, TestingModule } from '@nestjs/testing';
import { OrchestrationValidatorService } from './orchestration-validator.service';
import { GEOIntelligenceResponse } from '../types/diagnostic.types';

describe('OrchestrationValidatorService', () => {
  let validator: OrchestrationValidatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OrchestrationValidatorService],
    }).compile();

    validator = module.get<OrchestrationValidatorService>(OrchestrationValidatorService);
  });

  describe('validateIntelligenceResponse', () => {
    it('should validate a complete response', () => {
      const response: GEOIntelligenceResponse = {
        workspaceId: 'workspace-1',
        brandName: 'TestBrand',
        domain: 'test.com',
        industry: {
          primary: 'travel',
          secondary: [],
          confidence: 0.9,
          evidence: {},
        },
        businessSummary: { summary: 'Test' },
        prompts: [
          { text: 'best hotels', intent: 'BEST', commercialValue: 0.8, industryRelevance: 0.9 },
        ],
        promptClusters: [],
        competitors: [],
        sovAnalysis: [],
        citations: {},
        commercialValues: [],
        crossEnginePatterns: {
          enginesRecognizing: [],
          enginesSuppressing: [],
          consistencyPattern: {
            consistencyScore: 75,
            consistentEngines: [],
            inconsistentEngines: [],
            explanation: 'Test',
          },
          competitorFavorability: [],
          intentClusteringDifferences: [],
          rankingStabilityScore: 75,
          conflictingSignals: [],
          missingSignalsPerEngine: [],
          evidence: [],
          engineConfidence: { chatgpt: 0.8, claude: 0.8, gemini: 0.7, perplexity: 0.7 },
          patternExplanation: 'Test',
        },
        competitorAnalyses: [],
        trustFailures: [],
        fixDifficulties: [],
        geoScore: {
          overall: 65,
          breakdown: {
            aiVisibility: { score: 60 },
            eeat: { score: 70 },
            citations: { score: 50 },
            competitorComparison: { score: 55 },
            schemaTechnical: { score: 80 },
          },
          improvementPaths: [],
          explanation: 'Test',
        },
        opportunities: [],
        recommendations: [],
        metadata: {
          generatedAt: new Date(),
          serviceVersion: '2.0.0',
          industry: 'travel',
          confidence: 0.8,
        },
      };

      const result = validator.validateIntelligenceResponse(response);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required fields', () => {
      const response: any = {
        workspaceId: 'workspace-1',
        // Missing brandName, domain, industry
      };

      const result = validator.validateIntelligenceResponse(response);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.includes('brandName'))).toBe(true);
      expect(result.errors.some(e => e.includes('domain'))).toBe(true);
      expect(result.errors.some(e => e.includes('industry'))).toBe(true);
    });

    it('should validate GEO Score formula', () => {
      const response: GEOIntelligenceResponse = {
        workspaceId: 'workspace-1',
        brandName: 'TestBrand',
        domain: 'test.com',
        industry: {
          primary: 'travel',
          secondary: [],
          confidence: 0.9,
          evidence: {},
        },
        businessSummary: {},
        prompts: [],
        promptClusters: [],
        competitors: [],
        sovAnalysis: [],
        citations: {},
        commercialValues: [],
        crossEnginePatterns: {} as any,
        competitorAnalyses: [],
        trustFailures: [],
        fixDifficulties: [],
        geoScore: {
          overall: 200, // Invalid: > 100
          breakdown: {},
          improvementPaths: [],
          explanation: 'Test',
        },
        opportunities: [],
        recommendations: [],
        metadata: {
          generatedAt: new Date(),
          serviceVersion: '2.0.0',
          industry: 'travel',
          confidence: 0.8,
        },
      };

      const result = validator.validateIntelligenceResponse(response);

      expect(result.warnings.some(w => w.includes('GEO Score total out of range'))).toBe(true);
    });

    it('should validate opportunity structure', () => {
      const response: GEOIntelligenceResponse = {
        workspaceId: 'workspace-1',
        brandName: 'TestBrand',
        domain: 'test.com',
        industry: {
          primary: 'travel',
          secondary: [],
          confidence: 0.9,
          evidence: {},
        },
        businessSummary: {},
        prompts: [],
        promptClusters: [],
        competitors: [],
        sovAnalysis: [],
        citations: {},
        commercialValues: [],
        crossEnginePatterns: {} as any,
        competitorAnalyses: [],
        trustFailures: [],
        fixDifficulties: [],
        geoScore: {
          overall: 65,
          breakdown: {},
          improvementPaths: [],
          explanation: 'Test',
        },
        opportunities: [
          {
            title: '', // Invalid: empty
            aiVisibility: {
              chatgpt: 150, // Invalid: > 100
              claude: 0,
              gemini: 0,
              perplexity: 0,
              weighted: 0,
            },
            competitors: [],
            whyYouAreLosing: 'Test',
            opportunityImpact: 75,
            difficulty: 60,
            value: 80,
            actionSteps: [], // Invalid: < 3
            evidence: { chatgpt: [], claude: [], gemini: [], perplexity: [] },
            confidence: 1.5, // Invalid: > 1
            warnings: [],
            geoScoreImpact: { min: 2, max: 5 },
          },
        ],
        recommendations: [],
        metadata: {
          generatedAt: new Date(),
          serviceVersion: '2.0.0',
          industry: 'travel',
          confidence: 0.8,
        },
      };

      const result = validator.validateIntelligenceResponse(response);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('Opportunity 0'))).toBe(true);
    });
  });

  describe('validateDataQuality', () => {
    it('should detect low data quality', () => {
      const response: GEOIntelligenceResponse = {
        workspaceId: 'workspace-1',
        brandName: 'TestBrand',
        domain: 'test.com',
        industry: {
          primary: 'travel', // Competitive industry
          secondary: [],
          confidence: 0.9,
          evidence: {},
        },
        businessSummary: {},
        prompts: [], // Too few
        promptClusters: [],
        competitors: [], // Should have competitors for travel
        sovAnalysis: [],
        citations: {},
        commercialValues: [],
        crossEnginePatterns: {} as any,
        competitorAnalyses: [],
        trustFailures: [],
        fixDifficulties: [],
        geoScore: {
          overall: 65,
          breakdown: {},
          improvementPaths: [],
          explanation: 'Test',
        },
        opportunities: [], // Too few
        recommendations: [], // Too few
        metadata: {
          generatedAt: new Date(),
          serviceVersion: '2.0.0',
          industry: 'travel',
          confidence: 0.3, // Low confidence
        },
      };

      const result = validator.validateDataQuality(response);

      expect(result.meetsThreshold).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should pass with good data quality', () => {
      const response: GEOIntelligenceResponse = {
        workspaceId: 'workspace-1',
        brandName: 'TestBrand',
        domain: 'test.com',
        industry: {
          primary: 'travel',
          secondary: [],
          confidence: 0.9,
          evidence: {},
        },
        businessSummary: {},
        prompts: Array(10).fill({ text: 'test', intent: 'BEST', commercialValue: 0.8, industryRelevance: 0.9 }),
        promptClusters: [],
        competitors: Array(5).fill({ brandName: 'Comp', domain: 'comp.com', type: 'direct', confidence: 0.8, visibility: {} }),
        sovAnalysis: [],
        citations: {},
        commercialValues: [],
        crossEnginePatterns: {} as any,
        competitorAnalyses: [],
        trustFailures: [],
        fixDifficulties: [],
        geoScore: {
          overall: 65,
          breakdown: {},
          improvementPaths: [],
          explanation: 'Test',
        },
        opportunities: Array(10).fill({
          title: 'Test',
          aiVisibility: { chatgpt: 0, claude: 0, gemini: 0, perplexity: 0, weighted: 0 },
          competitors: [],
          whyYouAreLosing: 'Test',
          opportunityImpact: 75,
          difficulty: 60,
          value: 80,
          actionSteps: ['Step 1', 'Step 2', 'Step 3'],
          evidence: { chatgpt: [], claude: [], gemini: [], perplexity: [] },
          confidence: 0.8,
          warnings: [],
          geoScoreImpact: { min: 2, max: 5 },
        }),
        recommendations: Array(5).fill({
          id: 'rec-1',
          title: 'Test',
          description: 'Test',
          category: 'citations' as const,
          priority: 'high' as const,
          difficulty: 'medium' as const,
          timeEstimate: '2 weeks',
          expectedImpact: { description: 'Test' },
          steps: ['Step 1', 'Step 2', 'Step 3'],
          evidence: [],
          confidence: 0.8,
          reasoning: 'Test',
        }),
        metadata: {
          generatedAt: new Date(),
          serviceVersion: '2.0.0',
          industry: 'travel',
          confidence: 0.8, // Good confidence
        },
      };

      const result = validator.validateDataQuality(response);

      expect(result.meetsThreshold).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });
});


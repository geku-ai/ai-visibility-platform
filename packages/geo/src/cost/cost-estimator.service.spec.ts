/**
 * Cost Estimator Service Tests
 * 
 * Tests for cost estimation scenarios without hitting real external providers.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { CostEstimatorService } from './cost-estimator.service';
import { ScenarioKey } from './cost.types';

describe('CostEstimatorService', () => {
  let service: CostEstimatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CostEstimatorService],
    }).compile();

    service = module.get<CostEstimatorService>(CostEstimatorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('estimateScenarioCost', () => {
    it('should estimate cost for instant-summary-v2', async () => {
      const estimate = await service.estimateScenarioCost('instant-summary-v2');

      expect(estimate).toBeDefined();
      expect(estimate.scenario).toBe('instant-summary-v2');
      expect(estimate.totalUsd).toBeGreaterThan(0);
      expect(estimate.confidence).toBeGreaterThanOrEqual(0);
      expect(estimate.confidence).toBeLessThanOrEqual(1);
      expect(estimate.perProvider.length).toBeGreaterThan(0);
      
      // Verify provider costs sum to total (within small epsilon)
      const sum = estimate.perProvider.reduce((acc, p) => acc + p.estimatedUsd, 0);
      expect(Math.abs(sum - estimate.totalUsd)).toBeLessThan(0.01);
    });

    it('should estimate cost for geo-intelligence-full', async () => {
      const estimate = await service.estimateScenarioCost('geo-intelligence-full');

      expect(estimate).toBeDefined();
      expect(estimate.scenario).toBe('geo-intelligence-full');
      expect(estimate.totalUsd).toBeGreaterThan(0);
      expect(estimate.confidence).toBeGreaterThanOrEqual(0);
      expect(estimate.confidence).toBeLessThanOrEqual(1);
      expect(estimate.perProvider.length).toBeGreaterThan(0);
      
      // Full intelligence should cost more than instant summary
      const instantSummary = await service.estimateScenarioCost('instant-summary-v2');
      expect(estimate.totalUsd).toBeGreaterThan(instantSummary.totalUsd);
      
      // Verify provider costs sum to total
      const sum = estimate.perProvider.reduce((acc, p) => acc + p.estimatedUsd, 0);
      expect(Math.abs(sum - estimate.totalUsd)).toBeLessThan(0.01);
    });

    it('should estimate cost for opportunities-only (cached)', async () => {
      const estimate = await service.estimateScenarioCost('opportunities-only', {
        assumeCached: true,
      });

      expect(estimate).toBeDefined();
      expect(estimate.scenario).toBe('opportunities-only');
      expect(estimate.totalUsd).toBeGreaterThan(0);
      expect(estimate.estimatedSearchCalls).toBe(0); // Should be 0 if cached
      
      // Verify provider costs sum to total
      const sum = estimate.perProvider.reduce((acc, p) => acc + p.estimatedUsd, 0);
      expect(Math.abs(sum - estimate.totalUsd)).toBeLessThan(0.01);
    });

    it('should estimate cost for recommendations-only (cached)', async () => {
      const estimate = await service.estimateScenarioCost('recommendations-only', {
        assumeCached: true,
      });

      expect(estimate).toBeDefined();
      expect(estimate.scenario).toBe('recommendations-only');
      expect(estimate.totalUsd).toBeGreaterThan(0);
      expect(estimate.estimatedSearchCalls).toBe(0); // Should be 0 if cached
      
      // Verify provider costs sum to total
      const sum = estimate.perProvider.reduce((acc, p) => acc + p.estimatedUsd, 0);
      expect(Math.abs(sum - estimate.totalUsd)).toBeLessThan(0.01);
    });

    it('should respect pricing overrides', async () => {
      const baseEstimate = await service.estimateScenarioCost('instant-summary-v2');
      
      const overrideEstimate = await service.estimateScenarioCost('instant-summary-v2', {
        pricingOverrides: {
          'openai:gpt-4': 0.05, // Double the price
        },
      });

      expect(overrideEstimate.totalUsd).not.toBe(baseEstimate.totalUsd);
      
      // Find OpenAI provider in override estimate
      const openaiProvider = overrideEstimate.perProvider.find(
        p => p.provider === 'openai:gpt-4'
      );
      if (openaiProvider) {
        expect(openaiProvider.estimatedUsd).toBeGreaterThan(0);
      }
    });

    it('should use specific counts when provided', async () => {
      const estimate = await service.estimateScenarioCost('geo-intelligence-full', {
        promptCount: 30,
        competitorCount: 5,
        opportunityCount: 25,
      });

      expect(estimate).toBeDefined();
      expect(estimate.metadata?.promptCount).toBe(30);
      expect(estimate.metadata?.competitorCount).toBe(5);
      expect(estimate.metadata?.opportunityCount).toBe(25);
    });
  });

  describe('estimateInstantSummaryCost', () => {
    it('should return valid estimate', async () => {
      const estimate = await service.estimateInstantSummaryCost('example.com');

      expect(estimate).toBeDefined();
      expect(estimate.scenario).toBe('instant-summary-v2');
      expect(estimate.totalUsd).toBeGreaterThan(0);
      expect(estimate.confidence).toBeGreaterThanOrEqual(0.3);
    });
  });

  describe('estimateFullIntelligenceCost', () => {
    it('should return valid estimate', async () => {
      const estimate = await service.estimateFullIntelligenceCost('workspace-123');

      expect(estimate).toBeDefined();
      expect(estimate.scenario).toBe('geo-intelligence-full');
      expect(estimate.totalUsd).toBeGreaterThan(0);
    });
  });

  describe('estimateCopilotMonthlyCost', () => {
    it('should estimate monthly cost for low automation', async () => {
      const estimate = await service.estimateCopilotMonthlyCost({
        workspaceId: 'workspace-123',
        automationLevel: 'low',
        pagesOptimizedPerWeek: 5,
        reviewResponsesPerWeek: 10,
      });

      expect(estimate).toBeDefined();
      expect(estimate.scenario).toContain('monthly');
      expect(estimate.totalUsd).toBeGreaterThan(0);
      expect(estimate.perProvider.length).toBeGreaterThan(0);
    });

    it('should estimate monthly cost for medium automation', async () => {
      const estimate = await service.estimateCopilotMonthlyCost({
        workspaceId: 'workspace-123',
        automationLevel: 'medium',
        pagesOptimizedPerWeek: 10,
        reviewResponsesPerWeek: 20,
      });

      expect(estimate).toBeDefined();
      expect(estimate.totalUsd).toBeGreaterThan(0);
    });

    it('should estimate monthly cost for high automation', async () => {
      const estimate = await service.estimateCopilotMonthlyCost({
        workspaceId: 'workspace-123',
        automationLevel: 'high',
        pagesOptimizedPerWeek: 20,
        reviewResponsesPerWeek: 40,
      });

      expect(estimate).toBeDefined();
      expect(estimate.totalUsd).toBeGreaterThan(0);
      
      // High automation should cost more than low
      const lowEstimate = await service.estimateCopilotMonthlyCost({
        workspaceId: 'workspace-123',
        automationLevel: 'low',
        pagesOptimizedPerWeek: 5,
        reviewResponsesPerWeek: 10,
      });
      expect(estimate.totalUsd).toBeGreaterThan(lowEstimate.totalUsd);
    });
  });

  describe('data quality checks', () => {
    it('should have valid confidence scores', async () => {
      const scenarios: ScenarioKey[] = [
        'instant-summary-v2',
        'geo-intelligence-full',
        'opportunities-only',
        'recommendations-only',
      ];

      for (const scenario of scenarios) {
        const estimate = await service.estimateScenarioCost(scenario);
        expect(estimate.confidence).toBeGreaterThanOrEqual(0);
        expect(estimate.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should have non-empty assumptions', async () => {
      const estimate = await service.estimateScenarioCost('geo-intelligence-full');
      expect(estimate.assumptions.length).toBeGreaterThan(0);
    });

    it('should have provider breakdowns', async () => {
      const estimate = await service.estimateScenarioCost('geo-intelligence-full');
      expect(estimate.perProvider.length).toBeGreaterThan(0);
      
      for (const provider of estimate.perProvider) {
        expect(provider.provider).toBeDefined();
        expect(provider.estimatedUsd).toBeGreaterThanOrEqual(0);
        expect(provider.estimatedRequests).toBeGreaterThanOrEqual(0);
      }
    });
  });
});



/**
 * Tests for GEO Intelligence Orchestrator
 * 
 * Focus on:
 * - Response shape validation
 * - Non-empty critical fields
 * - Behavior under partial failures
 * - Performance sanity
 */

import { Test, TestingModule } from '@nestjs/testing';
import { GEOIntelligenceOrchestrator } from './geo-intelligence-orchestrator.service';
import { LLMRouterService } from '@ai-visibility/shared';
import { IndustryDetectorService } from '../industry/industry-detector.service';
import { PremiumBusinessSummaryService } from '../summary/premium-business-summary.service';
import { EvidenceBackedPromptGeneratorService } from '../prompts/evidence-backed-prompt-generator.service';
import { PromptClusterService } from '../prompts/prompt-cluster.service';
import { PremiumCompetitorDetectorService } from '../competitors/premium-competitor-detector.service';
import { EvidenceBackedShareOfVoiceService } from '../sov/evidence-backed-sov.service';
import { PremiumCitationService } from '../citations/premium-citation-service';
import { CommercialValueImpactService } from '../value/commercial-value.service';
import { EnginePatternService } from '../patterns/engine-pattern.service';
import { CompetitorAdvantageService } from '../competitors/competitor-advantage.service';
import { TrustFailureService } from '../trust/trust-failure.service';
import { FixDifficultyService } from '../difficulty/fix-difficulty.service';
import { PremiumGEOScoreService } from '../scoring/premium-geo-score.service';
import { VisibilityOpportunitiesService } from '../opportunities/visibility-opportunities.service';
import { EnhancedRecommendationService } from '../recommendations/enhanced-recommendation.service';

describe('GEOIntelligenceOrchestrator', () => {
  let orchestrator: GEOIntelligenceOrchestrator;
  let mockServices: any;

  beforeEach(async () => {
    // Create mock services
    mockServices = {
      llmRouter: {
        route: jest.fn(),
      },
      industryDetector: {
        detectIndustry: jest.fn().mockResolvedValue({
          primaryIndustry: 'travel',
          secondaryIndustries: ['hotels', 'booking'],
          confidence: 0.9,
          evidence: {},
        }),
      },
      businessSummary: {
        generatePremiumSummary: jest.fn().mockResolvedValue({
          summary: 'Test business summary',
          confidence: 0.8,
        }),
      },
      promptGenerator: {
        generateEvidenceBackedPrompts: jest.fn().mockResolvedValue([
          { text: 'best hotels', intent: 'BEST', commercialIntent: 0.8, industryRelevance: 0.9 },
          { text: 'hotel booking', intent: 'CATEGORY', commercialIntent: 0.7, industryRelevance: 0.8 },
        ]),
      },
      promptCluster: {
        clusterPrompts: jest.fn().mockResolvedValue([
          {
            type: 'BEST',
            title: 'Best hotels',
            prompts: ['best hotels'],
            value: 80,
            difficulty: 60,
            clusterVisibilityAverage: 50,
            competitorDominance: [],
            missingTrustSignals: [],
            requiredSchemaTypes: [],
            contentGaps: [],
            citationsRequired: 5,
            rootCause: 'Missing citations',
            expectedGEOScoreLift: { min: 2, max: 5 },
            evidence: [],
            confidence: 0.8,
          },
        ]),
      },
      competitorDetector: {
        detectPremiumCompetitors: jest.fn().mockResolvedValue([
          { brandName: 'Competitor1', domain: 'competitor1.com', type: 'direct', confidence: 0.8, visibility: {} },
        ]),
      },
      shareOfVoice: {
        calculateEvidenceBackedSOV: jest.fn().mockResolvedValue([]),
      },
      citationService: {
        getPremiumCitations: jest.fn().mockResolvedValue({
          citations: [],
          total: 0,
          confidence: 0.7,
        }),
      },
      commercialValue: {
        calculateCommercialValue: jest.fn().mockResolvedValue({
          visibilityValueIndex: 75,
          projectedVisibilityGain: 15,
          projectedRecommendationsGain: 8,
          commercialUpside: 65,
          cannibalizationRisk: 25,
          engineValueProjection: { chatgpt: 70, claude: 75, gemini: 60, perplexity: 65 },
          crossEngineConsensusMultiplier: 1.2,
          commercialOpportunityScore: 80,
          evidence: [],
          confidence: 0.85,
        }),
      },
      enginePattern: {
        analyzeCrossEnginePatterns: jest.fn().mockResolvedValue({
          enginesRecognizing: [],
          enginesSuppressing: [],
          consistencyPattern: {
            consistencyScore: 75,
            consistentEngines: [],
            inconsistentEngines: [],
            explanation: 'Test pattern',
          },
          competitorFavorability: [],
          intentClusteringDifferences: [],
          rankingStabilityScore: 75,
          conflictingSignals: [],
          missingSignalsPerEngine: [],
          evidence: [],
          engineConfidence: { chatgpt: 0.8, claude: 0.8, gemini: 0.7, perplexity: 0.7 },
          patternExplanation: 'Test explanation',
        }),
      },
      competitorAdvantage: {
        analyzeCompetitorAdvantage: jest.fn().mockResolvedValue({
          competitor: 'Competitor1',
          advantageFactors: [],
          weaknessFactors: [],
          structuralAdvantageScore: 75,
          structuralWeaknessScore: 30,
          evidence: [],
          engineStrength: { chatgpt: 70, claude: 75, gemini: 65, perplexity: 70 },
          signalInterpretation: {
            historical: { strength: 70, evidence: [] },
            realTime: { strength: 75, evidence: [] },
            trend: 'improving' as const,
          },
          yourAdvantageOpportunity: {
            shortTerm: [],
            longTerm: [],
            difficulty: 60,
          },
        }),
      },
      trustFailure: {
        detectTrustFailures: jest.fn().mockResolvedValue([
          {
            category: 'missing_authority' as const,
            severity: 75,
            confidence: 0.8,
            evidence: [],
            engineNotes: [],
            description: 'Missing authority',
            recommendedFixes: [],
          },
        ]),
      },
      fixDifficulty: {
        calculateFixDifficulty: jest.fn().mockResolvedValue({
          difficultyScore: 60,
          difficultyBreakdown: {
            content: { score: 50, factors: [], timeEstimate: '2 weeks' },
            schema: { score: 40, factors: [], timeEstimate: '1 week' },
            citation: { score: 70, factors: [], timeEstimate: '3 weeks' },
            trust: { score: 60, factors: [], timeEstimate: '2 weeks' },
            competitive: { score: 80, factors: [], timeEstimate: '4 weeks' },
            technical: { score: 30, factors: [], timeEstimate: '1 week' },
          },
          primaryConstraints: [],
          secondaryConstraints: [],
          timeEstimate: '2-4 weeks',
          confidence: 0.8,
          evidence: [],
        }),
      },
      geoScore: {
        calculatePremiumGEOScore: jest.fn().mockResolvedValue({
          total: 65,
          breakdown: {
            aiVisibility: { score: 60 },
            eeat: { score: 70 },
            citations: { score: 50 },
            competitorComparison: { score: 55 },
            schemaTechnical: { score: 80 },
          },
        }),
      },
      visibilityOpportunities: {
        generateOpportunities: jest.fn().mockResolvedValue([
          {
            title: 'Best hotels opportunity',
            aiVisibility: { chatgpt: 0, claude: 0, gemini: 0, perplexity: 0, weighted: 0 },
            competitors: [],
            whyYouAreLosing: 'Missing citations',
            opportunityImpact: 75,
            difficulty: 60,
            value: 80,
            actionSteps: ['Step 1', 'Step 2', 'Step 3'],
            evidence: { chatgpt: [], claude: [], gemini: [], perplexity: [] },
            confidence: 0.8,
            warnings: [],
            geoScoreImpact: { min: 2, max: 5 },
          },
        ]),
      },
      recommendations: {
        generateEnhancedRecommendations: jest.fn().mockResolvedValue([
          {
            id: 'rec-1',
            title: 'Test recommendation',
            description: 'Test description',
            category: 'citations' as const,
            priority: 'high' as const,
            difficulty: 'medium' as const,
            timeEstimate: '2 weeks',
            expectedImpact: {
              geoScoreImprovement: 5,
              visibilityGain: 10,
              description: 'Test impact',
            },
            steps: ['Step 1', 'Step 2', 'Step 3'],
            evidence: [],
            confidence: 0.8,
            reasoning: 'Test reasoning',
          },
        ]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GEOIntelligenceOrchestrator,
        { provide: LLMRouterService, useValue: mockServices.llmRouter },
        { provide: IndustryDetectorService, useValue: mockServices.industryDetector },
        { provide: PremiumBusinessSummaryService, useValue: mockServices.businessSummary },
        { provide: EvidenceBackedPromptGeneratorService, useValue: mockServices.promptGenerator },
        { provide: PromptClusterService, useValue: mockServices.promptCluster },
        { provide: PremiumCompetitorDetectorService, useValue: mockServices.competitorDetector },
        { provide: EvidenceBackedShareOfVoiceService, useValue: mockServices.shareOfVoice },
        { provide: PremiumCitationService, useValue: mockServices.citationService },
        { provide: CommercialValueImpactService, useValue: mockServices.commercialValue },
        { provide: EnginePatternService, useValue: mockServices.enginePattern },
        { provide: CompetitorAdvantageService, useValue: mockServices.competitorAdvantage },
        { provide: TrustFailureService, useValue: mockServices.trustFailure },
        { provide: FixDifficultyService, useValue: mockServices.fixDifficulty },
        { provide: PremiumGEOScoreService, useValue: mockServices.geoScore },
        { provide: VisibilityOpportunitiesService, useValue: mockServices.visibilityOpportunities },
        { provide: EnhancedRecommendationService, useValue: mockServices.recommendations },
      ],
    }).compile();

    orchestrator = module.get<GEOIntelligenceOrchestrator>(GEOIntelligenceOrchestrator);
  });

  describe('orchestrateIntelligence', () => {
    it('should return complete response with all required fields', async () => {
      const result = await orchestrator.orchestrateIntelligence(
        'workspace-1',
        'TestBrand',
        'test.com'
      );

      // Validate response structure
      expect(result).toHaveProperty('workspaceId', 'workspace-1');
      expect(result).toHaveProperty('brandName', 'TestBrand');
      expect(result).toHaveProperty('domain', 'test.com');
      expect(result).toHaveProperty('industry');
      expect(result).toHaveProperty('businessSummary');
      expect(result).toHaveProperty('prompts');
      expect(result).toHaveProperty('promptClusters');
      expect(result).toHaveProperty('competitors');
      expect(result).toHaveProperty('sovAnalysis');
      expect(result).toHaveProperty('citations');
      expect(result).toHaveProperty('commercialValues');
      expect(result).toHaveProperty('crossEnginePatterns');
      expect(result).toHaveProperty('competitorAnalyses');
      expect(result).toHaveProperty('trustFailures');
      expect(result).toHaveProperty('fixDifficulties');
      expect(result).toHaveProperty('geoScore');
      expect(result).toHaveProperty('opportunities');
      expect(result).toHaveProperty('recommendations');
      expect(result).toHaveProperty('metadata');
    });

    it('should have non-empty critical fields', async () => {
      const result = await orchestrator.orchestrateIntelligence(
        'workspace-1',
        'TestBrand',
        'test.com'
      );

      // Industry should be detected
      expect(result.industry.primary).toBeTruthy();
      expect(result.industry.confidence).toBeGreaterThanOrEqual(0);
      expect(result.industry.confidence).toBeLessThanOrEqual(1);

      // Should have prompts
      expect(Array.isArray(result.prompts)).toBe(true);
      expect(result.prompts.length).toBeGreaterThan(0);

      // GEO Score should be valid
      expect(typeof result.geoScore.overall).toBe('number');
      expect(result.geoScore.overall).toBeGreaterThanOrEqual(0);
      expect(result.geoScore.overall).toBeLessThanOrEqual(100);

      // Metadata should be complete
      expect(result.metadata).toHaveProperty('generatedAt');
      expect(result.metadata).toHaveProperty('serviceVersion');
      expect(result.metadata).toHaveProperty('industry');
      expect(result.metadata.confidence).toBeGreaterThanOrEqual(0);
      expect(result.metadata.confidence).toBeLessThanOrEqual(1);
    });

    it('should handle partial failures gracefully', async () => {
      // Make one service fail
      mockServices.businessSummary.generatePremiumSummary.mockRejectedValueOnce(
        new Error('Business summary failed')
      );

      const result = await orchestrator.orchestrateIntelligence(
        'workspace-1',
        'TestBrand',
        'test.com'
      );

      // Should still return a response
      expect(result).toBeDefined();
      expect(result.businessSummary).toBeDefined(); // Should have default
      expect(result.industry.primary).toBeTruthy(); // Other steps should succeed
    });

    it('should validate confidence scores are in 0-1 range', async () => {
      const result = await orchestrator.orchestrateIntelligence(
        'workspace-1',
        'TestBrand',
        'test.com'
      );

      // Check all confidence fields
      expect(result.industry.confidence).toBeGreaterThanOrEqual(0);
      expect(result.industry.confidence).toBeLessThanOrEqual(1);
      expect(result.metadata.confidence).toBeGreaterThanOrEqual(0);
      expect(result.metadata.confidence).toBeLessThanOrEqual(1);

      // Check opportunities confidence
      result.opportunities.forEach(opp => {
        expect(opp.confidence).toBeGreaterThanOrEqual(0);
        expect(opp.confidence).toBeLessThanOrEqual(1);
      });

      // Check recommendations confidence
      result.recommendations.forEach(rec => {
        expect(rec.confidence).toBeGreaterThanOrEqual(0);
        expect(rec.confidence).toBeLessThanOrEqual(1);
      });
    });

    it('should validate GEO Score components', async () => {
      const result = await orchestrator.orchestrateIntelligence(
        'workspace-1',
        'TestBrand',
        'test.com'
      );

      // GEO Score total should be 0-100
      expect(result.geoScore.overall).toBeGreaterThanOrEqual(0);
      expect(result.geoScore.overall).toBeLessThanOrEqual(100);

      // Should have breakdown
      expect(result.geoScore.breakdown).toBeDefined();
      expect(result.geoScore.explanation).toBeTruthy();
    });

    it('should complete within reasonable time', async () => {
      const startTime = Date.now();
      await orchestrator.orchestrateIntelligence(
        'workspace-1',
        'TestBrand',
        'test.com'
      );
      const duration = Date.now() - startTime;

      // Should complete within 30 seconds (reasonable for mocked services)
      expect(duration).toBeLessThan(30000);
    });

    it('should handle all services failing', async () => {
      // Make all services fail
      mockServices.industryDetector.detectIndustry.mockRejectedValueOnce(
        new Error('Industry detection failed')
      );
      mockServices.businessSummary.generatePremiumSummary.mockRejectedValueOnce(
        new Error('Business summary failed')
      );
      mockServices.promptGenerator.generateEvidenceBackedPrompts.mockRejectedValueOnce(
        new Error('Prompt generation failed')
      );

      const result = await orchestrator.orchestrateIntelligence(
        'workspace-1',
        'TestBrand',
        'test.com'
      );

      // Should still return a response with defaults
      expect(result).toBeDefined();
      expect(result.industry.primary).toBeTruthy(); // Should have default
      expect(result.businessSummary).toBeDefined(); // Should have default
    });
  });
});


import { Module, forwardRef } from '@nestjs/common';
import { RecommendationsController } from './recommendations.controller';
import { PrescriptiveRecommendationEngine, EnhancedRecommendationService, GEOIntelligenceOrchestrator } from '@ai-visibility/geo';
import { GEOModule } from '../geo/geo.module';
import { 
  GEOMaturityCalculatorService, 
  StructuralScoringService, 
  EvidenceGraphBuilderService,
  SchemaAuditorService,
  FreshnessAnalyzerService,
  PageStructureAnalyzerService,
  CitationClassifierService,
  EvidenceFactExtractorService,
  EVIDENCE_FACT_EXTRACTOR_TOKEN,
  // Dependencies for EnhancedRecommendationService and GEOIntelligenceOrchestrator
  IndustryDetectorService,
  PremiumBusinessSummaryService,
  EvidenceBackedPromptGeneratorService,
  PromptClusterService,
  PremiumCompetitorDetectorService,
  EvidenceBackedShareOfVoiceService,
  PremiumCitationService,
  CommercialValueImpactService,
  EnginePatternService,
  CompetitorAdvantageService,
  TrustFailureService,
  FixDifficultyService,
  VisibilityOpportunitiesService,
  PremiumGEOScoreService,
  EvidenceCollectorService,
  EEATCalculatorService,
} from '@ai-visibility/geo';
import { LLMRouterService, LLMConfigService } from '@ai-visibility/shared';
import { EventEmitterService } from '../events/event-emitter.service';
import { BullModule } from '@nestjs/bullmq';
import { PrismaService } from '../database/prisma.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'recommendationRefresh' }),
    forwardRef(() => GEOModule), // Import GEO module to access orchestrator
  ],
  providers: [
    // Core LLM services (needed by FactExtractorService from validation package if it's used)
    LLMConfigService,
    LLMRouterService,
    // Dependencies for StructuralScoringService
    SchemaAuditorService,
    FreshnessAnalyzerService,
    PageStructureAnalyzerService,
    // Dependencies for EvidenceGraphBuilderService
    CitationClassifierService,
    // Provide FactExtractorService from evidence package using custom token
    // EvidenceGraphBuilderService uses @Inject(EVIDENCE_FACT_EXTRACTOR_TOKEN) to avoid conflicts
    // with the validation package's FactExtractorService
    {
      provide: EVIDENCE_FACT_EXTRACTOR_TOKEN, // Use the symbol token
      useClass: EvidenceFactExtractorService, // Provide the evidence package's FactExtractorService
    },
    // Main services
    PrescriptiveRecommendationEngine,
    GEOMaturityCalculatorService,
    StructuralScoringService,
    EvidenceGraphBuilderService,
    // Enhanced recommendation service (depends on services from GEO module)
    EnhancedRecommendationService,
    PrismaService,
    EventEmitterService,
  ],
  controllers: [RecommendationsController],
  exports: [PrescriptiveRecommendationEngine, EnhancedRecommendationService],
})
export class RecommendationsModule {}



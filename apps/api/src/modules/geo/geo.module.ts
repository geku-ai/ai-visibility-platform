import { Module, Provider } from '@nestjs/common';
import { GEOOptimizationController } from './geo-optimization.controller';
import { EvidenceController } from './evidence.controller';
import { MaturityController } from './maturity.controller';
import { EEATController } from './eeat.controller';
import { DashboardController } from './dashboard.controller';
import { GEOIntelligenceController } from './geo-intelligence.controller';
import { GEODataService } from './geo-data.service';
import { 
  EnhancedGEOScoringService,
  KnowledgeGraphBuilder,
  TrustSignalAggregator,
  EvidenceGraphBuilderService,
  GEOMaturityCalculatorService,
  StructuralScoringService,
  PrescriptiveRecommendationEngine,
  SchemaAuditorService,
  FreshnessAnalyzerService,
  PageStructureAnalyzerService,
  CitationClassifierService,
  CitationAuthorityService,
  DirectoryPresenceAnalyzerService,
  EEATCalculatorService,
  FactExtractorService as EvidenceFactExtractorService,
  DashboardAggregatorService,
  EVIDENCE_FACT_EXTRACTOR_TOKEN,
  // New intelligence engines
  GEOIntelligenceOrchestrator,
  VisibilityOpportunitiesService,
  CommercialValueImpactService,
  PromptClusterService,
  EnginePatternService,
  CompetitorAdvantageService,
  TrustFailureService,
  FixDifficultyService,
  EnhancedRecommendationService,
  // Required dependencies
  IndustryDetectorService,
  DiagnosticIntelligenceService,
  EntityExtractorService,
  PremiumBusinessSummaryService,
  EvidenceBackedPromptGeneratorService,
  PremiumCompetitorDetectorService,
  EvidenceBackedShareOfVoiceService,
  PremiumCitationService,
  PremiumGEOScoreService,
  EvidenceCollectorService,
} from '@ai-visibility/geo';
import { PrismaService } from '../database/prisma.service';
import { EventsModule } from '../events/events.module';
import { BullModule } from '@nestjs/bullmq';
import { LLMRouterService, LLMConfigService } from '@ai-visibility/shared';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'maturityRecompute' },
      { name: 'recommendationRefresh' }
    ),
    EventsModule,
  ],
  providers: [
    // Core LLM services (needed if FactExtractorService from validation package is resolved)
    LLMConfigService,
    LLMRouterService,
    // Dependencies for EvidenceGraphBuilderService
    CitationClassifierService,
    // Provide FactExtractorService from evidence package using custom token
    // EvidenceGraphBuilderService uses @Inject(EVIDENCE_FACT_EXTRACTOR_TOKEN) to avoid conflicts
    // with the validation package's FactExtractorService
    {
      provide: EVIDENCE_FACT_EXTRACTOR_TOKEN, // Use the symbol token
      useClass: EvidenceFactExtractorService, // Provide the evidence package's FactExtractorService
    },
    // Main services (depend on above)
    GEODataService,
    EnhancedGEOScoringService,
    KnowledgeGraphBuilder,
    TrustSignalAggregator,
    EvidenceGraphBuilderService,
    GEOMaturityCalculatorService,
    StructuralScoringService,
    PrescriptiveRecommendationEngine,
    SchemaAuditorService,
    FreshnessAnalyzerService,
    PageStructureAnalyzerService,
    CitationAuthorityService,
    DirectoryPresenceAnalyzerService,
    EEATCalculatorService,
    DashboardAggregatorService,
    // New intelligence engines
    IndustryDetectorService,
    DiagnosticIntelligenceService, // Required by PremiumBusinessSummaryService
    EntityExtractorService, // Required by PremiumBusinessSummaryService
    PremiumBusinessSummaryService,
    EvidenceBackedPromptGeneratorService,
    PremiumCompetitorDetectorService,
    EvidenceBackedShareOfVoiceService,
    PremiumCitationService,
    PremiumGEOScoreService,
    EvidenceCollectorService,
    CommercialValueImpactService,
    PromptClusterService,
    EnginePatternService,
    CompetitorAdvantageService,
    TrustFailureService,
    FixDifficultyService,
    VisibilityOpportunitiesService,
    GEOIntelligenceOrchestrator,
    PrismaService,
  ],
  controllers: [
    GEOOptimizationController,
    EvidenceController,
    MaturityController,
    EEATController,
    DashboardController,
    GEOIntelligenceController,
  ],
  exports: [
    EnhancedGEOScoringService,
    KnowledgeGraphBuilder,
    TrustSignalAggregator,
    EvidenceGraphBuilderService,
    GEOMaturityCalculatorService,
    StructuralScoringService,
    PrescriptiveRecommendationEngine,
    EEATCalculatorService,
    DashboardAggregatorService,
    GEOIntelligenceOrchestrator,
    VisibilityOpportunitiesService,
  ],
})
export class GEOModule {}

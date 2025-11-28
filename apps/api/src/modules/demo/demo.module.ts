import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { LLMConfigService, LLMRouterService } from '@ai-visibility/shared';
import { 
  EntityExtractorService, 
  CompetitorDetectorService, 
  DiagnosticInsightsService,
  SchemaAuditorService,
  PageStructureAnalyzerService,
  FactExtractorService as EvidenceFactExtractorService,
  StructuralScoringService,
  FreshnessAnalyzerService,
  TrustSignalAggregator,
  ShareOfVoiceCalculatorService,
  EVIDENCE_FACT_EXTRACTOR_TOKEN,
  CitationClassifierService,
  EvidenceGraphBuilderService,
  // Premium services
  IndustryDetectorService,
  DiagnosticIntelligenceService,
  PremiumBusinessSummaryService,
  EvidenceBackedPromptGeneratorService,
  PremiumCompetitorDetectorService,
  EvidenceBackedShareOfVoiceService,
  PremiumCitationService,
  PremiumGEOScoreService,
  EvidenceCollectorService,
  EEATCalculatorService,
  GEOIntelligenceOrchestrator,
} from '@ai-visibility/geo';
import { IntentClustererService } from '@ai-visibility/prompts';
import { PrismaService } from '../database/prisma.service';
import { GEOModule } from '../geo/geo.module';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

@Module({
  imports: [
    ConfigModule, 
    BullModule.registerQueue({ name: 'runPrompt' }),
    forwardRef(() => GEOModule), // Import GEO module to access orchestrator
  ],
  controllers: [DemoController],
  providers: [
    // Core services (order matters - dependencies first)
    // ConfigService is global (from ConfigModule.forRoot), so we don't need to provide it
    LLMConfigService,  // Depends on ConfigService (global)
    LLMRouterService,  // Depends on LLMConfigService
    PrismaService,     // Needed by ShareOfVoiceCalculatorService
    
    // GEO services dependencies (no constructor dependencies)
    SchemaAuditorService,
    PageStructureAnalyzerService,
    // Provide FactExtractorService from evidence package using custom token
    // EntityExtractorService and EvidenceGraphBuilderService use @Inject(EVIDENCE_FACT_EXTRACTOR_TOKEN)
    // to avoid conflicts with the validation package's FactExtractorService
    {
      provide: EVIDENCE_FACT_EXTRACTOR_TOKEN,
      useClass: EvidenceFactExtractorService,
    },
    FreshnessAnalyzerService,  // Needed by StructuralScoringService
    StructuralScoringService,  // Depends on SchemaAuditorService, FreshnessAnalyzerService, PageStructureAnalyzerService
    TrustSignalAggregator,
    ShareOfVoiceCalculatorService,  // Depends on PrismaService
    CitationClassifierService,  // Needed by PremiumCitationService and EvidenceGraphBuilderService
    EvidenceGraphBuilderService,  // Depends on CitationClassifierService, EvidenceFactExtractorService (via token), optional dbPool
    
    // Main services (depend on LLMRouterService and other services)
    EntityExtractorService,  // Depends on LLMRouterService, SchemaAuditorService, PageStructureAnalyzerService, EvidenceFactExtractorService
    CompetitorDetectorService,  // Depends on LLMRouterService
    IntentClustererService,  // Depends on LLMRouterService
    DiagnosticInsightsService,  // Depends on SchemaAuditorService, StructuralScoringService, TrustSignalAggregator, ShareOfVoiceCalculatorService
    
    // Premium services (order matters - DiagnosticIntelligenceService must be before services that depend on it)
    IndustryDetectorService,  // Depends on LLMRouterService, SchemaAuditorService, PageStructureAnalyzerService
    DiagnosticIntelligenceService,  // Depends on LLMRouterService (for diagnostic intelligence generation) - MUST be before services that use it
    EvidenceCollectorService,  // Depends on PrismaService (via constructor) - needed by other premium services
    PremiumBusinessSummaryService,  // Depends on LLMRouterService, IndustryDetectorService, EntityExtractorService, SchemaAuditorService, DiagnosticIntelligenceService
    EvidenceBackedPromptGeneratorService,  // Depends on LLMRouterService, IndustryDetectorService, EvidenceCollectorService, DiagnosticIntelligenceService
    PremiumCompetitorDetectorService,  // Depends on LLMRouterService, IndustryDetectorService, EvidenceCollectorService, DiagnosticIntelligenceService
    EvidenceBackedShareOfVoiceService,  // Depends on PrismaService, EvidenceCollectorService, DiagnosticIntelligenceService
    PremiumCitationService,  // Depends on CitationClassifierService, DiagnosticIntelligenceService
    EEATCalculatorService,  // Depends on EvidenceGraphBuilderService
    PremiumGEOScoreService,  // Depends on LLMRouterService, EEATCalculatorService, EvidenceBackedShareOfVoiceService, EvidenceCollectorService, SchemaAuditorService, StructuralScoringService, DiagnosticIntelligenceService
    
    // Demo service (depends on all above)
    DemoService,
    // Note: GEOIntelligenceOrchestrator is provided by GEOModule via forwardRef
  ],
  exports: [DemoService],
})
export class DemoModule {}


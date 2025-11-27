// Core GEO services
export * from './scoring/visibility-score';
export * from './scoring/mention-detector';
export * from './scoring/ranking-calculator';
export { CitationAuthorityService, type CitationAuthority } from './scoring/citation-authority.service';
export * from './scoring/engine-bias.config';

// Enhanced GEO services
export * from './scoring/enhanced-scoring.service';

// Knowledge graph services
export * from './knowledge/knowledge-graph-builder.service';

// Trust signal services
export * from './trust/trust-signal-aggregator.service';
export * from './trust/eeat-calculator.service';
export type { EEATScore } from './trust/eeat-calculator.service';

// Citation services
export * from './citations/opportunity.service';
export * from './citations/domain-analyzer';
export * from './citations/impact-calculator';
export { CitationClassifierService, CitationSourceType, type ClassificationResult } from './citations/citation-classifier.service';

// Evidence services
export * from './evidence/evidence-graph.builder';
export {
  FactExtractorService as EvidenceFactExtractorService,
  type ExtractedFact as EvidenceExtractedFact
} from './evidence/fact-extractor.service';
export { EVIDENCE_FACT_EXTRACTOR_TOKEN } from './evidence/evidence-graph.builder';
export type { EntityEvidenceGraph, FactConsensusScore } from './evidence/evidence-graph.builder';

// Structural services
export * from './structural/structural-scoring.service';
export * from './structural/schema-auditor';
export * from './structural/freshness-analyzer';
export * from './structural/page-structure-analyzer';

// Maturity services
export * from './maturity/maturity-calculator.service';
export * from './maturity/prescriptive-recommendations.service';
export type { GEOMaturityScore } from './maturity/maturity-calculator.service';
export type { Recommendation } from './maturity/prescriptive-recommendations.service';

// Directory services
export * from './directory/directory-presence.analyzer';
export * from './directory/directory-constants';

// Dashboard services
export * from './dashboard/dashboard-aggregator.service';

// Entity extraction services
export * from './entity/entity-extractor.service';

// Competitor detection services
export * from './competitors/competitor-detector.service';

// Share of voice services
export * from './sov/share-of-voice-calculator.service';

// Diagnostic insights services
// Export DiagnosticInsightsService but not DiagnosticInsight interface (use the one from diagnostic.types.ts)
// Note: The DiagnosticInsight in diagnostic-insights.service.ts is the old format and should not be exported
export { DiagnosticInsightsService, type DiagnosticInsightsResult } from './insights/diagnostic-insights.service';

// Engine bias simulation services
export * from './scoring/engine-bias-simulator.service';

// Copilot mapping services
export * from './copilot/insight-copilot-mapper.service';

// Industry detection services
export * from './industry/industry-detector.service';

// Evidence-backed services
export * from './evidence/evidence-collector.service';
export * from './prompts/evidence-backed-prompt-generator.service';
export * from './sov/evidence-backed-sov.service';

// Premium services (export classes only, types are in types/premium-response.types.ts)
export { PremiumBusinessSummaryService } from './summary/premium-business-summary.service';
export { PremiumCompetitorDetectorService } from './competitors/premium-competitor-detector.service';
export { PremiumCitationService } from './citations/premium-citation-service';
export { PremiumGEOScoreService } from './scoring/premium-geo-score.service';

// Visibility Opportunities service
export { VisibilityOpportunitiesService } from './opportunities/visibility-opportunities.service';

// Premium types
export * from './types/premium-response.types';
export * from './types/diagnostic.types';

// Diagnostic intelligence services
export { DiagnosticIntelligenceService } from './diagnostics/diagnostic-intelligence.service';

// Industry weights config
export * from './config/industry-weights.config';

// Validation services (exported as primary names for alerts module)
export {
  HallucinationDetectorService,
  type HallucinationAlert
} from './validation/hallucination-detector';
export type { HallucinationDetectionResult } from './validation/fact-extractor';
export {
  FactExtractorService,
  type ExtractedFact,
  type FactValidationResult
} from './validation/fact-extractor';
export {
  FactValidatorService,
  type WorkspaceProfile,
  type ValidationRule,
  type ValidationResult
} from './validation/fact-validator';

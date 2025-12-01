# Cost Drivers Analysis

**Last Updated:** 2025-11-28  
**Purpose:** Document all external providers, their usage patterns, and cost implications for GEO Copilot intelligence pipeline.

---

## External Providers Overview

### LLM Providers (Token-Based Pricing)

#### 1. **OpenAI** (`openai:gpt-4`, `openai:gpt-4-turbo`)
- **Entry Points:**
  - `packages/providers/src/llm/openai-provider.ts`
  - Called via `LLMRouterService.routeLLMRequest()`
- **Usage Context:**
  - Industry detection (`IndustryDetectorService`)
  - Business summary generation (`PremiumBusinessSummaryService`)
  - Prompt generation (`EvidenceBackedPromptGeneratorService`)
  - Prompt clustering (`PromptClusterService`)
  - Competitor detection (`PremiumCompetitorDetectorService`)
  - Commercial value analysis (`CommercialValueImpactService`)
  - Cross-engine pattern recognition (`EnginePatternService`)
  - Competitor advantage analysis (`CompetitorAdvantageService`)
  - Trust failure detection (`TrustFailureService`)
  - Fix difficulty calculation (`FixDifficultyService`)
  - Diagnostic intelligence (`DiagnosticIntelligenceService`)
  - Content generation (`ContentGeneratorService`)
- **Call Multiplicity:**
  - **Per intelligence step:** 1-3 LLM calls (depending on complexity)
  - **Per prompt generation:** 1 call per batch of prompts (typically generates 20-50 prompts)
  - **Per competitor analysis:** 1 call per competitor (typically 3-10 competitors)
  - **Per opportunity:** 1-2 calls per opportunity (for root cause analysis)
- **Token Estimates:**
  - Industry detection: ~500-1000 tokens (prompt + completion)
  - Business summary: ~2000-4000 tokens
  - Prompt generation: ~3000-5000 tokens (generates 20-50 prompts)
  - Prompt clustering: ~2000-4000 tokens
  - Competitor detection: ~1500-3000 tokens per competitor
  - Commercial value: ~1000-2000 tokens per cluster
  - Pattern recognition: ~2000-3000 tokens
  - Trust failure: ~1500-2500 tokens
  - Fix difficulty: ~1000-2000 tokens
- **Pricing Model:** Per 1K tokens (input + output, different rates)

#### 2. **Anthropic** (`anthropic:claude-3-5-sonnet`, `anthropic:claude-3-opus`)
- **Entry Points:** Same as OpenAI (via `LLMRouterService` with fallback)
- **Usage Context:** Same as OpenAI (used as fallback when OpenAI fails)
- **Call Multiplicity:** Same as OpenAI
- **Token Estimates:** Similar to OpenAI, but Claude models typically have different tokenization
- **Pricing Model:** Per 1K tokens

#### 3. **Gemini** (`gemini:gemini-1.5-pro`, `gemini:gemini-1.5-flash`)
- **Entry Points:** Same as OpenAI (via `LLMRouterService` with fallback)
- **Usage Context:** Same as OpenAI (used as fallback)
- **Call Multiplicity:** Same as OpenAI
- **Token Estimates:** Similar to OpenAI
- **Pricing Model:** Per 1K tokens

---

### Search Engine Providers (Per-Request Pricing)

#### 4. **Perplexity** (`perplexity:sonar-pro`)
- **Entry Points:**
  - `packages/providers/src/perplexity-provider.ts`
  - Called via `AIProviderOrchestrator.executeParallel()`
  - Used in `EvidenceBackedShareOfVoiceService` for SOV analysis
- **Usage Context:**
  - **Share of Voice (SOV) Analysis:** Per prompt × per engine
  - **Prompt Runs:** When executing prompts across engines
  - **Evidence Collection:** For citation and mention extraction
- **Call Multiplicity:**
  - **Per prompt run:** 1 call per prompt per engine
  - **Full Intelligence:** `#prompts × #engines` (typically 20-50 prompts × 4 engines = 80-200 calls)
  - **Instant Summary V2:** Limited to ~10 prompts × 4 engines = ~40 calls
  - **Opportunities/Recommendations:** Reuses cached prompt runs (0 new calls if cached)
- **Token Estimates:** N/A (per-request pricing)
- **Pricing Model:** Per request (varies by model: sonar, sonar-pro)

#### 5. **Brave Search** (`brave:web-search`)
- **Entry Points:**
  - `packages/providers/src/brave-provider.ts`
  - Called via `AIProviderOrchestrator.executeParallel()`
- **Usage Context:**
  - Same as Perplexity (alternative search engine)
  - Used for SOV analysis and evidence collection
- **Call Multiplicity:**
  - Same as Perplexity: `#prompts × #engines`
  - Typically used in parallel with Perplexity for redundancy
- **Token Estimates:** N/A (per-request pricing)
- **Pricing Model:** Per request (subscription-based)

#### 6. **SerpAPI** (`serpapi:google-search`) - via AIO Provider
- **Entry Points:**
  - `packages/providers/src/aio-provider.ts`
  - Called via `AIProviderOrchestrator.executeParallel()`
- **Usage Context:**
  - Google AI Overview extraction
  - Organic search results
  - Knowledge graph data
- **Call Multiplicity:**
  - Same as Perplexity/Brave: `#prompts × #engines`
  - Used for Google-specific AI Overview visibility
- **Token Estimates:** N/A (per-request pricing)
- **Pricing Model:** Per request (free tier: 100/month, then $50/1M searches)

#### 7. **Azure Copilot** (`copilot:gpt-4`)
- **Entry Points:**
  - `packages/providers/src/llm/copilot-provider.ts`
  - Called via `LLMRouterService` (optional, if configured)
- **Usage Context:**
  - Same as other LLM providers (fallback option)
- **Call Multiplicity:** Same as OpenAI/Anthropic/Gemini
- **Token Estimates:** Similar to OpenAI
- **Pricing Model:** Per 1K tokens (Azure pricing)

---

## Intelligence Pipeline Cost Breakdown

### Scenario 1: Instant Summary V2 (Free Funnel)

**Pipeline Steps:**
1. Industry Detection: 1 LLM call (~1000 tokens)
2. Business Summary: 1 LLM call (~3000 tokens)
3. Prompt Generation: 1 LLM call (~4000 tokens) → generates ~10 prompts
4. SOV Analysis: ~10 prompts × 4 engines = ~40 search API calls
5. GEO Score Computation: Database queries only (no external cost)

**Total Estimated Calls:**
- LLM calls: 3
- Search API calls: ~40 (Perplexity/Brave/SerpAPI)
- **Total tokens:** ~8000 tokens (LLM only)

**Cost Drivers:**
- LLM: 3 calls × avg 2667 tokens = ~8000 tokens
- Search: 40 calls × per-request price

---

### Scenario 2: Full GEO Intelligence (Paid)

**Pipeline Steps (15 steps):**
1. Industry Detection: 1 LLM call
2. Business Summary: 1 LLM call
3. Prompt Generation: 1 LLM call → generates 20-50 prompts
4. Prompt Clustering: 1 LLM call
5. Competitor Detection: 1 LLM call per competitor (3-10 competitors)
6. SOV Analysis: `#prompts × #engines` = 20-50 × 4 = 80-200 search calls
7. Citation Analysis: Database queries (no external cost)
8. Commercial Value: 1 LLM call per cluster (5-10 clusters)
9. Cross-Engine Patterns: 1 LLM call
10. Competitor Advantage: 1 LLM call per competitor
11. Trust Failure: 1 LLM call
12. Fix Difficulty: 1 LLM call per opportunity
13. GEO Score: Database queries (no external cost)
14. Visibility Opportunities: 1-2 LLM calls per opportunity (20-50 opportunities)
15. Recommendations: 1 LLM call per recommendation (10-20 recommendations)

**Total Estimated Calls:**
- LLM calls: ~15-30 (depending on competitors/opportunities)
- Search API calls: ~80-200 (Perplexity/Brave/SerpAPI)
- **Total tokens:** ~30,000-60,000 tokens (LLM only)

**Cost Drivers:**
- LLM: 15-30 calls × avg 2000 tokens = ~30,000-60,000 tokens
- Search: 80-200 calls × per-request price

---

### Scenario 3: Opportunities Only (Cached Intelligence)

**Assumptions:**
- Full intelligence already cached
- Only generating opportunities from existing data

**Pipeline Steps:**
- Visibility Opportunities: 1-2 LLM calls per opportunity (20-50 opportunities)
- May reuse cached prompt runs (0 new search calls if cached)

**Total Estimated Calls:**
- LLM calls: ~20-100 (depending on opportunity count)
- Search API calls: 0 (if cached) or ~80-200 (if not cached)
- **Total tokens:** ~20,000-100,000 tokens

---

### Scenario 4: Recommendations Only (Cached Intelligence)

**Assumptions:**
- Full intelligence already cached
- Only generating recommendations

**Pipeline Steps:**
- Enhanced Recommendations: 1 LLM call per recommendation (10-20 recommendations)

**Total Estimated Calls:**
- LLM calls: ~10-20
- Search API calls: 0 (cached)
- **Total tokens:** ~10,000-20,000 tokens

---

### Scenario 5: Future Copilot Automation (Weekly/Monthly)

**Assumptions:**
- Weekly automated runs per client
- Varies by automation level (low/medium/high)

**Low Automation:**
- 1 full intelligence run per week
- 5 pages optimized per week
- 10 review responses per week
- **Cost:** Similar to 1 Full Intelligence run + 5 content generations + 10 LLM calls for reviews

**Medium Automation:**
- 2 full intelligence runs per week
- 10 pages optimized per week
- 20 review responses per week
- **Cost:** 2× Full Intelligence + 10 content generations + 20 review calls

**High Automation:**
- 4 full intelligence runs per week
- 20 pages optimized per week
- 40 review responses per week
- **Cost:** 4× Full Intelligence + 20 content generations + 40 review calls

---

## Call Multiplicity Patterns

### Pattern 1: LLM Calls (Per Intelligence Step)
- **Multiplier:** 1 call per step
- **Variations:**
  - Competitor analysis: `1 × #competitors`
  - Opportunity analysis: `1-2 × #opportunities`
  - Recommendation generation: `1 × #recommendations`

### Pattern 2: Search API Calls (Per Prompt × Per Engine)
- **Multiplier:** `#prompts × #engines`
- **Typical Values:**
  - Instant Summary: 10 prompts × 4 engines = 40 calls
  - Full Intelligence: 20-50 prompts × 4 engines = 80-200 calls
- **Caching:** If prompt runs are cached, search calls = 0

### Pattern 3: Content Generation (Per Page/Item)
- **Multiplier:** 1 LLM call per content item
- **Token Estimate:** ~5000-10000 tokens per content item

---

## Cost Optimization Opportunities

1. **Caching:**
   - Prompt runs can be cached (reduces search API calls to 0)
   - Industry detection can be cached per domain
   - Business summary can be cached per domain

2. **Batching:**
   - Prompt generation batches multiple prompts in one call
   - Competitor analysis could be batched (currently 1 call per competitor)

3. **Provider Selection:**
   - Use cheaper models for non-critical steps (e.g., Gemini Flash for simple tasks)
   - Use search engines only when needed (not for all prompts)

4. **Intelligent Fallback:**
   - Current system tries all providers; could optimize to try cheapest first

---

## Notes

- All token estimates are approximate and based on typical prompt/completion sizes
- Actual costs vary by:
  - Prompt complexity
  - Industry vertical
  - Number of competitors
  - Number of opportunities identified
  - Provider pricing (subject to change)
- Database queries (PostgreSQL) are not included in cost model (infrastructure cost, not variable)
- Redis usage (queues, caching) is not included (infrastructure cost)



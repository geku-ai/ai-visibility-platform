# Instant Summary & Data Collection - Comprehensive Fixes

## Issues Summary

### 1. ✅ Domain Transfer Fixed
**Problem**: Domain from instant summary wasn't being used in onboarding.

**Fix Applied**: Updated `OnboardingWizard.tsx` to check `sessionStorage.getItem('geku_analyzed_domain')` and pre-populate the domain field.

**Status**: ✅ Fixed in frontend (needs deployment)

### 2. ⚠️ Instant Summary Shows Zeros - Root Cause Identified
**Problem**: Instant summary checks database for existing prompt runs but never actually EXECUTES them.

**Root Cause**: 
- `getInstantSummaryV2` generates prompts (Step 3)
- Checks database for mentions (Step 4) - but database is empty because no prompts were run
- Checks database for visibility (Step 5) - but database is empty

**Solution Required**: 
The instant summary needs to actually **execute prompt runs** through search engines (Perplexity, Brave, AIO) before checking visibility. Currently it only:
1. Generates prompts
2. Checks if they exist in database (they don't)
3. Returns zeros

**Recommended Fix**:
- After generating prompts, queue/execute them through search engines
- Wait for completion (or use async with reasonable timeout)
- Then check database for results
- OR: Use the existing demo run flow that actually executes prompts

### 3. ⚠️ LLM Providers vs Search Engines - Clarification Needed
**Important Distinction**:
- **LLM Providers** (OpenAI, Anthropic, Gemini): Generate text responses
- **Search Engines** (Perplexity, Brave, AIO): Return search results

**Current State**:
- LLM Router supports: OpenAI, Anthropic, Gemini ✅
- Search Engines (Perplexity, Brave, AIO) are used for **prompt runs** (checking visibility), not LLM text generation
- These are handled by the `run-prompt-worker` which uses the ProviderRegistry

**The Issue**: 
The instant summary doesn't actually trigger prompt runs through search engines. It should use the demo run flow which executes prompts.

### 4. ⚠️ Failed Jobs (50 in runPrompt queue)
**Root Cause**: Based on logs:
- OpenAI quota exceeded (429 errors)
- All OpenAI API keys exhausted
- Jobs retry but eventually fail after max attempts

**Why This Matters**: 
- These are likely prompt run jobs that failed due to OpenAI quota
- But prompt runs should use Perplexity/Brave/AIO, not OpenAI
- OpenAI is only used for LLM text generation (summaries, etc.)

**Investigation Needed**:
- Check if prompt runs are incorrectly using OpenAI instead of search engines
- Verify job payloads to see which engines are being used
- Check if failed jobs are blocking new jobs

## Recommended Next Steps

### Priority 1: Fix Instant Summary to Execute Prompts
The instant summary should actually run prompt analysis, not just check for existing data.

**Option A**: Use existing demo run flow
- Call `/v1/demo/run` after generating prompts
- Wait for completion
- Then check results

**Option B**: Execute prompts directly
- Queue prompt runs for generated prompts
- Use search engines (Perplexity, Brave, AIO)
- Wait for completion
- Then check database

### Priority 2: Verify Search Engine Usage
Ensure prompt runs are using search engines (Perplexity, Brave, AIO) not LLM providers (OpenAI).

### Priority 3: Clean Up Failed Jobs
- Investigate why 50 jobs failed
- Check if they're blocking new jobs
- Clean up or retry with correct engines

### Priority 4: Frontend Domain Transfer
The frontend fix is done but needs to be deployed. The onboarding wizard will now pre-populate the domain from instant summary.

## Files Modified

1. ✅ `/Users/tusharmehrotra/geku/src/pages/auth/OnboardingWizard.tsx`
   - Added `getPreAnalyzedDomain()` function
   - Pre-populates domain from `sessionStorage.getItem('geku_analyzed_domain')`

## Files That Need Changes

1. `apps/api/src/modules/demo/demo.service.ts`
   - `getInstantSummaryV2()` method needs to actually execute prompt runs
   - Currently only checks database, never executes

2. `apps/jobs/src/workers/run-prompt-worker.ts`
   - Verify it's using search engines, not LLM providers
   - Check error handling for failed jobs

3. Queue monitoring
   - Investigate 50 failed jobs
   - Check if they're blocking new jobs


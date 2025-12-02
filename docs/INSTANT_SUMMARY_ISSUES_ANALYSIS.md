# Instant Summary & Data Collection Issues Analysis

## Issues Identified

### 1. **Instant Summary Shows Zeros/Blanks**
**Root Cause**: The instant summary endpoint checks the database for existing prompt runs but doesn't actually EXECUTE any prompts. Since no prompts have been run, the database is empty, resulting in all zeros.

**Current Flow**:
- Generates prompts (Step 3)
- Checks database for existing mentions (Step 4 - SOV Analysis)
- Checks database for visibility (Step 5 - Engine visibility check)
- **Problem**: Never actually runs the prompts through LLM providers

**Solution**: Need to actually execute prompt runs for the generated prompts before checking visibility.

### 2. **Domain Doesn't Transfer After Sign-In**
**Root Cause**: Frontend stores `geku_analyzed_domain` in sessionStorage, but:
- SignUp.tsx reads it and navigates to dashboard, but doesn't pass it to backend
- Onboarding flow doesn't check sessionStorage for pre-analyzed domain
- Workspace `primaryDomain` is never set from the instant summary domain

**Solution**: 
- Onboarding wizard should check sessionStorage for `geku_analyzed_domain`
- If found, pre-populate the domain field and set it as `primaryDomain` in workspace
- Backend should accept domain from instant summary and store it

### 3. **Limited LLM Provider Usage**
**Root Cause**: LLM Router only supports 3 providers:
- `openai`
- `anthropic` 
- `gemini`

**Missing Providers** (available in ProviderRegistry but not in LLM Router):
- `perplexity` (PERPLEXITY_API_KEY)
- `brave` (BRAVE_API_KEY)
- `aio` (AIO_API_KEY)
- SERP providers

**Solution**: Extend LLM Router to support all available providers from the registry.

### 4. **Failed Jobs (50 in runPrompt queue)**
**Root Cause**: Based on logs, jobs are failing due to:
- OpenAI quota exceeded (429 errors)
- All OpenAI API keys exhausted
- Jobs retry but eventually fail after max attempts

**Solution**: 
- Better error handling and job retry logic
- Skip OpenAI if quota exceeded, use other providers
- Job cleanup and monitoring

## Implementation Plan

1. **Fix Instant Summary to Execute Prompts**
   - After generating prompts, actually queue/execute them
   - Wait for completion (or use async with timeout)
   - Then check database for results

2. **Fix Domain Transfer**
   - Update onboarding to read sessionStorage
   - Pre-populate domain field
   - Ensure backend saves it to workspace

3. **Extend LLM Router**
   - Add Perplexity, Brave, AIO support
   - Check for API keys
   - Add to provider rotation

4. **Fix Failed Jobs**
   - Improve error handling
   - Better retry logic
   - Provider fallback


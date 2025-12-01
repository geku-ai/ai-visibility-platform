# Provider Error Diagnostics & Fixes

## Overview

This document explains common provider errors (Perplexity 401, OpenAI rate limits) and how the system handles them.

## Common Issues

### 1. Perplexity API 401 Error

**Symptom:**
```
Perplexity API error: 401 Authorization Required
```

**Root Cause:**
- Invalid, expired, or missing `PERPLEXITY_API_KEY` environment variable
- API key revoked or not activated
- Incorrect API key format

**How It's Handled:**
1. **Perplexity Provider** (`packages/providers/src/perplexity-provider.ts`):
   - Detects 401 status code
   - Provides clear error message: "Perplexity API authentication failed (401). The API key is invalid, expired, or missing."
   - Marks error with `isAuthError: true` flag

2. **Run Prompt Worker** (`apps/jobs/src/workers/run-prompt-worker.ts`):
   - Catches authentication errors
   - Provides diagnostic message with exact environment variable name
   - Marks prompt run as `FAILED` with detailed error message
   - Logs error category as `AUTHENTICATION`

**Fix:**
1. Verify `PERPLEXITY_API_KEY` is set in the jobs service environment
2. Check API key is valid at https://www.perplexity.ai/settings/api
3. Ensure key has proper permissions
4. Restart jobs service after updating environment variable

### 2. OpenAI Rate Limit Errors

**Symptom:**
```
OpenAI API key rate-limited, rotating to next key
```

**Root Cause:**
- API key has exceeded rate limits (requests per minute)
- Quota exceeded (monthly spending limit)
- Multiple keys all rate-limited

**How It's Handled:**
1. **OpenAI Provider** (`packages/providers/src/llm/openai-provider.ts`):
   - Detects 429 status code
   - Automatically rotates to next available API key
   - Marks rate-limited keys with cooldown period (1 minute)
   - Retries with different keys

2. **LLM Router** (`packages/shared/src/llm-router.ts`):
   - Tries OpenAI first (if configured)
   - Falls back to Anthropic if OpenAI fails
   - Falls back to Gemini if Anthropic fails
   - Returns graceful fallback response if all providers fail

**Fix:**
1. Add multiple OpenAI API keys (comma-separated in `OPENAI_API_KEY` or `OPENAI_API_KEY_1`, `OPENAI_API_KEY_2`, etc.)
2. Upgrade OpenAI plan for higher rate limits
3. Reduce request frequency
4. System will automatically use fallback providers (Anthropic, Gemini)

### 3. Incomplete Results

**Symptom:**
- Results are missing data
- Some engines show no visibility
- GEO Score is lower than expected

**Root Cause:**
- Provider failures (401, rate limits) cause prompt runs to fail
- Failed prompt runs mean no data collected for that engine/prompt combination
- Intelligence pipeline continues with defaults, but data is incomplete

**How It's Handled:**
1. **Orchestrator** (`packages/geo/src/engine/geo-intelligence-orchestrator.service.ts`):
   - Each step wrapped in `executeStep` with try-catch
   - Failed steps use default values
   - Warnings collected and included in response
   - Pipeline continues even if some steps fail

2. **Demo Service** (`apps/api/src/modules/demo/demo.service.ts`):
   - Instant Summary V2 has lightweight 5-step pipeline
   - Each step has fallback values
   - Always returns meaningful summary, GEO score, and insights
   - Warnings included in metadata

**Fix:**
1. Fix provider authentication issues (see above)
2. Ensure all required API keys are configured
3. Check provider health status
4. Review logs for specific provider failures
5. Re-run analysis after fixing provider issues

## Error Categories

The system categorizes errors for better diagnostics:

- **AUTHENTICATION**: API key issues (401, invalid key)
- **RATE_LIMIT**: Rate limit exceeded (429, quota)
- **NETWORK**: Network/connectivity issues (timeout, ECONNREFUSED)
- **OTHER**: Other errors (validation, unknown)

## Diagnostic Logs

When a provider fails, you'll see logs like:

```
[RunPromptWorker] Prompt run failed for <idempotencyKey>:
  error: "Perplexity API authentication failed (401)..."
  errorCategory: "AUTHENTICATION"
  diagnostic: "⚠️ API key issue detected for PERPLEXITY. Check your PERPLEXITY_API_KEY environment variable."
```

## Required API Keys

### For Full Intelligence Pipeline:
- `OPENAI_API_KEY` (or `OPENAI_API_KEY_1`, `OPENAI_API_KEY_2`, etc.)
- `ANTHROPIC_API_KEY` (fallback)
- `GOOGLE_AI_API_KEY` (fallback)
- `PERPLEXITY_API_KEY` (for search)
- `BRAVE_API_KEY` (for search)
- `SERPAPI_KEY` (for AIO/Google search)

### For Instant Summary V2 (Lightweight):
- At least one LLM provider (OpenAI, Anthropic, or Gemini)
- Database access (for existing data)

## Best Practices

1. **Multiple API Keys**: Configure multiple keys for critical providers (especially OpenAI) to handle rate limits
2. **Monitor Logs**: Check logs regularly for authentication and rate limit errors
3. **Health Checks**: Use provider health check endpoints to verify API keys before running jobs
4. **Graceful Degradation**: System continues with defaults when providers fail, but results will be incomplete
5. **Retry Strategy**: Failed jobs can be retried after fixing provider issues

## Troubleshooting Steps

1. **Check Environment Variables**:
   ```bash
   # In jobs service
   echo $PERPLEXITY_API_KEY
   echo $OPENAI_API_KEY
   ```

2. **Review Logs**:
   - Look for `[RunPromptWorker]` logs for job failures
   - Look for `[LLM Router]` logs for LLM provider issues
   - Look for `[Perplexity]` logs for Perplexity-specific errors

3. **Verify API Keys**:
   - Test Perplexity key: https://www.perplexity.ai/settings/api
   - Test OpenAI key: Check OpenAI dashboard
   - Test Anthropic key: Check Anthropic dashboard

4. **Check Provider Status**:
   - Perplexity: https://status.perplexity.ai/
   - OpenAI: https://status.openai.com/
   - Anthropic: https://status.anthropic.com/

5. **Re-run After Fixes**:
   - Fix API key issues
   - Restart jobs service
   - Re-run failed prompt runs
   - Re-run intelligence analysis


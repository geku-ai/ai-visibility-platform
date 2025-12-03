# Fix: Mention Extraction and Data Aggregation Issues

## Problems Identified

1. **No Mentions Found**: Instant summary shows 0 mentions, 0 competitors, 0 SOV data
2. **Low GEO Score**: Score of 28/100 for a major brand like Booking.com seems incorrect
3. **Missing Competitor Data**: No competitor information displayed
4. **Missing SOV Data**: Share of Voice section shows no data

## Root Causes

### 1. Mention Extraction Confidence Threshold Too High
- `extractMentions` was using default `minConfidence: 0.6`
- This was too strict for LLM responses that mention brands in various contexts
- Many valid mentions were being filtered out

### 2. Workspace Brand/Domain Retrieval Race Condition
- Jobs might start before workspace is fully committed to database
- Worker queries workspace immediately, might not find it
- No retry logic to handle timing issues

### 3. Limited Brand Variations
- Only searching for exact brand name and domain
- Not including capitalized variations (e.g., "Booking" vs "booking")
- Missing common brand name variations

### 4. Insufficient Logging
- No visibility into why mentions aren't being found
- Can't debug if brands are being passed correctly
- Can't see if mentions are being saved to database

## Solutions Implemented

### 1. Lower Confidence Threshold
```typescript
// Before: extractMentions(result.answerText, brandsToSearch, {})
// After:
extractMentions(result.answerText, brandsToSearch, {
  minConfidence: 0.4, // Lower threshold to catch more mentions
})
```

### 2. Add Retry Logic for Workspace Queries
- Retry up to 3 times with 500ms delay
- Handles race conditions where workspace isn't committed yet
- Logs retry attempts for debugging

### 3. Add Brand Variations
- Include capitalized versions of brand names
- Include capitalized versions of domains
- Include base domain name (e.g., "booking" from "booking.com")
- Include capitalized base domain

### 4. Enhanced Logging
- Log when brands are retrieved from workspace
- Log mention extraction results (found X mentions or no mentions)
- Log response sample when no mentions found
- Log when mentions are successfully saved to database
- Log errors when mention creation fails

## Files Changed

- `apps/jobs/src/workers/run-prompt-worker.ts`
  - Lowered `minConfidence` threshold
  - Added retry logic for workspace queries
  - Added brand variations (capitalized versions)
  - Enhanced logging throughout mention extraction flow

## Expected Improvements

1. **More Mentions Found**: Lower confidence threshold should catch more valid mentions
2. **Better Brand Matching**: Capitalized variations should match more LLM responses
3. **Reliable Workspace Access**: Retry logic ensures workspace data is available
4. **Better Debugging**: Enhanced logging shows exactly what's happening

## Verification

After deployment, check jobs service logs for:
- `[RunPromptWorker] Retrieved X brand(s) from workspace: ...`
- `[RunPromptWorker] Found X mention(s) for brands: ...`
- `[RunPromptWorker] Created X mention(s) in database for answer ...`

If still seeing 0 mentions:
- Check if brands are being retrieved from workspace
- Check if LLM responses actually contain brand names
- Check if mention creation is failing silently

## Next Steps if Issues Persist

1. Check actual LLM response content to see if brands are mentioned
2. Verify workspace has `brandName` and `primaryDomain` set correctly
3. Check if `extractMentions` function needs further tuning
4. Consider adding fuzzy matching for brand name variations


# Competitor Extraction and Status Calculation Fixes

## Problems Identified

1. **No competitor data**: The instant summary was showing "No competitor data available" because `extractMentions` only searched for specific brands (the main brand), not ALL brands mentioned in LLM responses. Competitor mentions like "Vrbo", "Booking.com", "Expedia" were present in responses but not being extracted.

2. **Loading state stuck**: The "Collecting data from AI engines" loading state persisted even after most jobs completed because the status calculation required ALL jobs to be finished (no PENDING jobs), but jobs were being queued asynchronously, causing inconsistent job counts.

3. **Inconsistent job counts**: Total and pending job counts were changing on each poll because jobs were being queued asynchronously and not all were in the database when the first status check occurred.

## Root Causes

### Issue 1: Competitor Extraction
- `extractMentions` function only extracted mentions of brands in the `brands` array passed to it
- When we passed `brandsToSearch = ['Airbnb', 'airbnb.com', ...]`, it only found mentions of Airbnb
- Competitor names like "Vrbo", "Booking.com", "Expedia" appeared in LLM responses but weren't being extracted because they weren't in the search list

### Issue 2: Status Calculation
- Status was set to `'analysis_complete'` only when `pendingJobs === 0`
- Jobs were queued asynchronously, so when the instant summary endpoint was first called, not all jobs were in the database yet
- This caused the status to remain `'analysis_running'` even when most jobs had completed

## Solutions Implemented

### Fix 1: Extract All Brand Mentions
- **Added `extractAllBrandMentions` function** in `packages/parser/src/mentions.ts`:
  - Extracts domain names (e.g., "vrbo.com", "booking.com")
  - Extracts capitalized brand names (e.g., "Vrbo", "Booking", "Expedia")
  - Filters out common words and excluded brands
  - Returns all potential brand mentions, not just the ones we're searching for

- **Updated `run-prompt-worker.ts`**:
  - Now calls both `extractMentions` (for main brand) and `extractAllBrandMentions` (for all brands)
  - Combines both sets of mentions, deduplicating by brand name and position
  - Stores ALL mentions in the database, including competitors
  - Enhanced logging to show main brand mentions vs. competitor mentions

### Fix 2: Improved Status Calculation
- **Updated `demo.service.ts`**:
  - Status is now complete when:
    1. All jobs are finished (no PENDING), OR
    2. We have enough completed jobs (>80%) and some data, OR
    3. We have some data and no pending jobs
  - This prevents the loading state from getting stuck when jobs are still being queued
  - Added `hasEnoughData` check to mark as complete when >80% of jobs are done

## Code Changes

### `packages/parser/src/mentions.ts`
- Added `extractAllBrandMentions` function that extracts:
  - Domain names using regex pattern
  - Capitalized brand names using regex pattern
  - Filters out common words, excluded brands, dates, numbers
  - Returns mentions with confidence scores

### `apps/jobs/src/workers/run-prompt-worker.ts`
- Import `extractAllBrandMentions` from `@ai-visibility/parser`
- Call both `extractMentions` and `extractAllBrandMentions`
- Combine and deduplicate mentions
- Enhanced logging to show competitor brands found
- Store all mentions (including competitors) in database

### `apps/api/src/modules/demo/demo.service.ts`
- Improved status calculation logic:
  - Added `hasEnoughData` check (>= 80% complete)
  - Status is complete if `allJobsFinished || (hasEnoughData && hasSomeData) || (hasSomeData && pendingJobs === 0)`
  - Better logging for status determination

## Expected Results

1. **Competitor data should now appear**: Competitor mentions like "Vrbo", "Booking.com", "Expedia" will be extracted from LLM responses and stored in the database, then aggregated in the instant summary.

2. **Loading state should resolve faster**: Status will be marked as complete when >80% of jobs are done, preventing the stuck loading state.

3. **More accurate job counts**: Status calculation accounts for async job queuing and marks as complete when appropriate.

## Testing

After deployment, verify:
1. Competitor data appears in instant summary (not just "No competitor data available")
2. Share of Voice data shows competitors
3. Loading state resolves when most jobs complete (not waiting for 100%)
4. Job counts are consistent across polls


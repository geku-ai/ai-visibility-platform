# 🚨 CRITICAL FIX: Instant Summary Polling Logic

## Problem

The instant summary page is not polling for updated data when analysis is running. This causes:
- Competitor data never appears
- Share of Voice data never appears  
- Citations never populate
- Data remains incomplete even after jobs complete

## Root Cause

The frontend polling logic skips polling when `geoScore > 0`, but it should poll when `status === 'analysis_running'` even if there's already some data.

**Current broken logic** (lines 90-93 in `InstantSummary.tsx`):
```typescript
if (hasRealData) {
  console.log('[InstantSummary] Real data detected, no polling needed');
  return; // ❌ This prevents polling even when analysis is still running
}
```

**What happens:**
1. Backend returns initial response with `geoScore.total: 28` (calculated from initial data)
2. Backend also returns `status: 'analysis_running'` and `completedJobs: 0`
3. Frontend sees `geoScore > 0` and skips polling
4. Jobs complete in background (30 jobs queued)
5. Frontend never polls to get updated data with competitors/SOV/citations

## Solution

Update the polling logic to poll when analysis is running, regardless of whether there's initial data.

## File to Fix

**File**: `/Users/tusharmehrotra/geku/src/pages/InstantSummary.tsx`

**Location**: Lines 48-110 (the polling `useEffect`)

## Required Changes

### Change 1: Update Polling Condition (Lines 90-110)

**Replace this:**
```typescript
if (hasRealData) {
  console.log('[InstantSummary] Real data detected, no polling needed');
  return;
}

if (isCollectingData) {
  console.log('[InstantSummary] Already polling, skipping');
  return;
}

// Check if analysis is complete (no need to poll)
if ((data as any).status === 'analysis_complete') {
  console.log('[InstantSummary] Analysis already complete, no polling needed');
  return;
}

// Check if analysis failed (no need to poll)
if ((data as any).status === 'error') {
  console.warn('[InstantSummary] Analysis in error state, no polling');
  return;
}
```

**With this:**
```typescript
// Check if analysis failed (no need to poll)
if ((data as any).status === 'error') {
  console.warn('[InstantSummary] Analysis in error state, no polling');
  return;
}

// Check if analysis is complete (no need to poll)
if ((data as any).status === 'analysis_complete') {
  console.log('[InstantSummary] Analysis already complete, no polling needed');
  return;
}

if (isCollectingData) {
  console.log('[InstantSummary] Already polling, skipping');
  return;
}

// ✅ NEW: Poll if analysis is running, even if there's initial data
// This ensures we get competitor/SOV/citation data as jobs complete
const status = (data as any).status;
const completedJobs = (data as any).completedJobs || 0;
const totalJobs = (data as any).totalJobs || 0;
const isAnalysisRunning = status === 'analysis_running' && completedJobs < totalJobs;

if (isAnalysisRunning) {
  console.log('[InstantSummary] Analysis running, starting polling', {
    status,
    completedJobs,
    totalJobs,
    geoScore,
    hasRealData,
  });
  // Continue to start polling below
} else if (hasRealData) {
  console.log('[InstantSummary] Real data detected and analysis complete, no polling needed');
  return;
} else {
  // No data and not running - shouldn't happen, but don't poll
  console.warn('[InstantSummary] No data and analysis not running, skipping polling');
  return;
}
```

## Expected Behavior After Fix

1. **Initial Response**: Backend returns `geoScore.total: 28`, `status: 'analysis_running'`, `completedJobs: 0`, `totalJobs: 30`
2. **Polling Starts**: Frontend detects `status === 'analysis_running'` and `completedJobs < totalJobs`, starts polling
3. **Polling Continues**: Frontend polls every 5 seconds, checking for updated data
4. **Data Updates**: As jobs complete, backend aggregates competitor/SOV/citation data
5. **Polling Stops**: When `status === 'analysis_complete'` OR `completedJobs === totalJobs`, polling stops
6. **UI Updates**: Frontend displays complete data with competitors, SOV, and citations

## Testing

1. Go to `/instant-summary?domain=booking.com`
2. Click "Analyze"
3. **Expected**: 
   - Initial response shows (may have some data)
   - Polling starts automatically (check console for `[InstantSummary] Analysis running, starting polling`)
   - Console shows polling attempts every 5 seconds
   - After 30-60 seconds, data updates with competitors/SOV/citations
   - Polling stops when `status === 'analysis_complete'`

## Backend Status

✅ **Backend is working correctly**:
- Returns `status: 'analysis_running'` when jobs are queued
- Returns `completedJobs` and `totalJobs` for progress tracking
- Aggregates competitor/SOV/citation data when `completedJobs > 0`
- Logs show: `[Instant Summary] Queued 30 prompt runs for 10 prompts across 3 engines`

The issue is purely frontend - polling is not starting when it should.

## Additional Notes

- The network error (`net::ERR_NETWORK_CHANGED`) might be a separate issue (backend restarting), but the main issue is the polling logic
- The backend correctly returns `status: 'analysis_running'` - the frontend just needs to respect it
- This fix ensures polling happens whenever analysis is running, regardless of initial data quality


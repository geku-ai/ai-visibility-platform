# Instant Summary Competitor Detection and Status Fixes

## Problems Identified

1. **Airbnb showing as its own competitor**: The competitor detection query was including domain variations of the main brand (e.g., "airbnb.com" was being treated as a competitor to "Airbnb") because the comparison didn't normalize domain variations.

2. **Loading state stuck**: The "Collecting data from AI engines" loading state was persisting even after jobs completed because the status calculation didn't properly account for PENDING jobs and async job queuing.

## Root Causes

### Issue 1: Competitor Detection
- Brand name is derived as "Airbnb" (capitalized) from `deriveBrandFromHost("airbnb.com")`
- Mentions are stored with brand names like "Airbnb", "airbnb.com", "Airbnb.com" (from brand variations)
- The competitor filter `LOWER(m."brand") != LOWER($3)` where `$3` is "Airbnb" would match "airbnb.com" because `"airbnb.com" != "airbnb"` is TRUE
- Domain variations of the main brand were not being filtered out

### Issue 2: Status Calculation
- Jobs are queued asynchronously (`addBulk` is not awaited)
- Status was set to `'analysis_complete'` only when `completedJobs === totalJobs`
- PENDING jobs were not being considered in the status calculation
- The frontend polling might not see the status change correctly

## Solutions Implemented

### Fix 1: Improved Competitor Detection (`apps/api/src/modules/demo/demo.service.ts`)

**Before:**
```typescript
AND LOWER(m."brand") != LOWER($3)
```

**After:**
- Added `normalizeBrandForComparison()` function to normalize brand names to base domain (without TLD)
- Filter out competitors that match the main brand in any form:
  - Exact case-insensitive match
  - Normalized base domain match (e.g., "airbnb" matches "airbnb.com")
  - Domain base match (e.g., "airbnb" from "airbnb.com")
  - Full domain match

**Code Changes:**
```typescript
const normalizeBrandForComparison = (brandName: string): string => {
  const cleaned = brandName.toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\.(com|net|org|io|co|ai|app|dev)$/, '');
  return cleaned;
};

const mainBrandNormalized = normalizeBrandForComparison(brand);
const mainBrandDomain = normalized.host.toLowerCase().replace(/^www\./, '');
const mainBrandBase = mainBrandDomain.split('.')[0];

// Filter out the main brand and its variations
const competitorRows = (allBrandRows as any[]).filter(row => {
  const mentionBrand = row.brand;
  const mentionNormalized = normalizeBrandForComparison(mentionBrand);
  const mentionDomain = mentionBrand.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
  const mentionBase = mentionDomain.split('.')[0];
  
  // Exclude if it matches the main brand in any form
  if (mentionBrand.toLowerCase() === brand.toLowerCase()) return false;
  if (mentionNormalized === mainBrandNormalized) return false;
  if (mentionBase === mainBrandBase && mainBrandBase.length > 2) return false;
  if (mentionDomain === mainBrandDomain) return false;
  
  return true;
}).slice(0, 10);
```

### Fix 2: Improved Status Calculation (`apps/api/src/modules/demo/demo.service.ts`)

**Before:**
```typescript
status: completedJobs === totalJobs && totalJobs > 0 ? 'analysis_complete' : 'analysis_running',
```

**After:**
- Count PENDING and FAILED jobs separately
- Mark as complete when:
  - All jobs are finished (no PENDING jobs), OR
  - We have some completed jobs and no pending jobs (all queued jobs have been processed)
- Added detailed logging for status determination

**Code Changes:**
```typescript
// Count all job statuses for accurate progress calculation
let pendingJobs = 0;
let failedJobs = 0;
if (totalJobs > 0) {
  const statusBreakdown = await this.prisma.$queryRaw<{ status: string; count: number }>(...);
  (statusBreakdown as any[]).forEach(row => {
    if (row.status === 'PENDING') pendingJobs = row.count;
    if (row.status === 'FAILED') failedJobs = row.count;
  });
}

// Status is complete only when all jobs are finished (SUCCESS or FAILED, no PENDING)
const allJobsFinished = totalJobs > 0 && pendingJobs === 0;
const hasSomeData = completedJobs > 0 && totalJobs > 0;

status: allJobsFinished || (hasSomeData && pendingJobs === 0) ? 'analysis_complete' : 'analysis_running',
```

## Expected Impact

1. **Correct Competitor Detection**: Domain variations of the main brand (e.g., "airbnb.com", "Airbnb.com") will no longer appear as competitors. Only actual competing brands will be shown.

2. **Accurate Status**: The loading state will correctly transition to "complete" when all jobs have finished processing, even if they were queued asynchronously.

3. **Better Logging**: Enhanced logging will help diagnose any remaining issues with competitor detection and status calculation.

## Testing Recommendations

1. **Test Competitor Detection**:
   - Run instant summary for "airbnb.com"
   - Verify that "airbnb.com" or "Airbnb" does NOT appear in the competitors list
   - Verify that actual competitors (e.g., "Vrbo", "Booking.com") appear if mentioned

2. **Test Status Calculation**:
   - Run instant summary and monitor the status
   - Verify that status changes from "analysis_running" to "analysis_complete" when all jobs finish
   - Check logs for status determination details

3. **Check Logs**:
   - Look for `[Instant Summary] Competitor brands:` to see which brands are being detected
   - Look for `[Instant Summary] Status determination:` to see why status was set

## Files Modified

1. `apps/api/src/modules/demo/demo.service.ts` - Fixed competitor detection and status calculation

## Related Issues

These fixes address:
- Airbnb showing as its own competitor
- Loading state stuck on "Collecting data from AI engines"
- Inaccurate status reporting


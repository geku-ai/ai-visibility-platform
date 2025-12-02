# Auth & Data Quality Analysis

## 🔍 Issues Identified

### 1. Clerk Authentication Misalignment

**Problem:**
- Clerk JWT tokens from OAuth providers (Google) may not include `email` in the JWT payload
- Multiple users with missing emails were getting `unknown@example.com`, causing duplicate key errors
- JWT strategy was trying multiple fallback locations but not logging what Clerk actually provides

**Root Cause:**
- Clerk's JWT tokens for OAuth providers don't always include email in the standard claims
- Email might be in custom claims like `https://clerk.com/email` or need to be fetched from Clerk's API

**Fixes Applied:**
1. ✅ **Email Fallback Logic** (`auth.service.ts`):
   - Uses userId-based email (`${userId}@clerk.user`) when email is missing/invalid
   - Prevents duplicate key errors
   - Handles `ON CONFLICT` gracefully

2. ✅ **Enhanced JWT Logging** (`jwt.strategy.ts`):
   - Logs all available claims in JWT payload
   - Warns when email is missing
   - Helps diagnose what Clerk actually provides

**Recommendations:**
- Consider fetching email from Clerk's API if missing from JWT (requires `CLERK_SECRET_KEY`)
- Monitor logs to see what claims Clerk provides for different auth methods
- Document expected JWT structure for your Clerk instance

---

### 2. Instant Summary Data Quality Issues

**Problem:**
- Instant summary shows "0 competitors" and "0 SOV data"
- Data appears incomplete or synthetic
- Jobs complete but aggregation finds nothing

**Root Causes Identified:**

#### A. Mention Extraction Failing
**Issue:** Worker only gets brands from `demo_runs` table, but instant summary doesn't create demo runs
- **Location:** `apps/jobs/src/workers/run-prompt-worker.ts` lines 260-288
- **Impact:** `brandsToSearch` array is empty → `extractMentions()` finds nothing → no mentions saved
- **Fix Applied:** ✅ Now also checks workspace for `brandName` and `primaryDomain`

#### B. Data Aggregation Timing
**Issue:** Instant summary returns immediately while jobs run in background
- Jobs take 30-90 seconds to complete
- Aggregation runs before jobs finish
- Frontend polling should handle this, but initial response shows zeros

#### C. Competitor Detection Threshold
**Issue:** Threshold was `HAVING COUNT(*) >= 2` (too high)
- **Fix Applied:** ✅ Lowered to `>= 1` to catch more competitors

**Data Flow Verification:**

✅ **Real Search Engine Calls:**
- Perplexity: Real API calls to `api.perplexity.ai` (lines 49-66 in `perplexity-provider.ts`)
- Brave: Real API calls to `api.search.brave.com` 
- AIO: Real API calls via SerpAPI
- Citations extracted from actual responses (lines 91-100 in `perplexity-provider.ts`)

✅ **Real Data Storage:**
- Prompt runs saved to `prompt_runs` table
- Answers saved to `answers` table
- Mentions extracted and saved to `mentions` table (lines 304-315 in `run-prompt-worker.ts`)
- Citations extracted and saved to `citations` table (lines 317-328)

✅ **Real Data Aggregation:**
- Competitors aggregated from `mentions` table (lines 2640-2661 in `demo.service.ts`)
- SOV aggregated from `mentions` table (lines 2733-2770)
- Citations aggregated from `citations` table (lines 2773-2795)

**Why Data Might Still Look "Bad":**

1. **Timing Issue:** Initial response returns before jobs complete
   - **Solution:** Frontend polling (already implemented) should update data as jobs complete

2. **Brand Extraction:** If brand name doesn't match what's in search results
   - **Example:** Searching for "Booking.com" but results say "Booking" → mentions might not match
   - **Solution:** Worker now extracts brand from domain (e.g., "booking" from "booking.com")

3. **Search Results Quality:** Depends on actual search engine responses
   - If Perplexity/Brave don't mention competitors, we won't find them
   - This is expected behavior - we're showing what AI engines actually say

4. **Mention Extraction Logic:** Requires brand names to search for
   - **Fix Applied:** ✅ Worker now gets brands from workspace when demo_run not available

---

## 🔧 Fixes Applied

### Fix 1: Worker Brand Extraction
**File:** `apps/jobs/src/workers/run-prompt-worker.ts`
- ✅ Now checks workspace for `brandName` and `primaryDomain` when `demoRunId` is missing
- ✅ Extracts brand from domain (e.g., "booking" from "booking.com")
- ✅ Adds logging to show which brands are being searched

### Fix 2: Competitor Detection
**File:** `apps/api/src/modules/demo/demo.service.ts`
- ✅ Lowered threshold from 2 to 1 mention
- ✅ Added logging for total mentions found
- ✅ Added logging for competitor brands detected

### Fix 3: Clerk Email Handling
**File:** `apps/api/src/modules/auth/auth.service.ts`
- ✅ Uses userId-based email when email is missing/invalid
- ✅ Handles duplicate key errors gracefully

### Fix 4: Enhanced JWT Logging
**File:** `apps/api/src/modules/auth/jwt.strategy.ts`
- ✅ Logs all available JWT claims
- ✅ Warns when email is missing
- ✅ Helps diagnose Clerk token structure

---

## 📊 Data Quality Verification

### How to Verify Data is Real:

1. **Check Job Logs:**
   ```
   [RunPromptWorker] Starting job - engineKey: PERPLEXITY
   [RunPromptWorker] Searching for mentions of brands: Booking, booking.com, booking
   Prompt run completed: <id>
   ```

2. **Check Database:**
   ```sql
   SELECT COUNT(*) FROM mentions WHERE "answerId" IN (
     SELECT id FROM answers WHERE "promptRunId" IN (
       SELECT id FROM prompt_runs WHERE "workspaceId" = 'demo_booking_com'
     )
   );
   ```

3. **Check API Response:**
   - Look for `status: 'analysis_running'` initially
   - Should change to `status: 'analysis_complete'` when jobs finish
   - `completedJobs` should increase over time

### Expected Behavior:

1. **Initial Response (0-5 seconds):**
   - Returns immediately with `status: 'analysis_running'`
   - `completedJobs: 0`, `totalJobs: 30`
   - Competitors/SOV may be empty (jobs still running)

2. **After 30-90 seconds:**
   - Frontend polling detects `status: 'analysis_running'` and `completedJobs < totalJobs`
   - Polls every 5 seconds
   - Data updates as jobs complete

3. **Final State:**
   - `status: 'analysis_complete'`
   - `completedJobs === totalJobs`
   - Competitors/SOV populated from database

---

## 🚨 Remaining Issues to Monitor

### 1. Clerk Email for OAuth Users
**Status:** Partially fixed (userId-based email fallback)
**Action:** Monitor logs to see if email appears in JWT for Google OAuth users
**Potential Solution:** Fetch email from Clerk API if missing (requires `CLERK_SECRET_KEY`)

### 2. Mention Extraction Quality
**Status:** Fixed (now gets brands from workspace)
**Action:** Monitor logs to verify brands are being extracted correctly
**Check:** Look for `[RunPromptWorker] Searching for mentions of brands: ...` in job logs

### 3. Competitor Detection Sensitivity
**Status:** Fixed (threshold lowered to 1)
**Action:** Monitor if we're now finding too many false positives
**Adjustment:** May need to tune threshold based on results

---

## 📝 Recommendations

### For Auth:
1. **Add Clerk API Integration** (if email missing):
   ```typescript
   // In auth.service.ts, if email is missing:
   if (!email && CLERK_SECRET_KEY) {
     const clerkUser = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
       headers: { 'Authorization': `Bearer ${CLERK_SECRET_KEY}` }
     });
     email = clerkUser.primaryEmailAddress?.emailAddress;
   }
   ```

2. **Monitor JWT Payloads:**
   - Check logs for what claims Clerk provides
   - Document expected structure for your Clerk instance
   - Consider adding a test endpoint to decode and log JWT structure

### For Data Quality:
1. **Add Data Validation:**
   - Verify mentions are being saved (check database)
   - Verify citations are being saved
   - Add health check endpoint to verify data pipeline

2. **Improve Brand Matching:**
   - Consider fuzzy matching for brand names
   - Handle variations (e.g., "Booking.com" vs "Booking")
   - Extract brand aliases from workspace profile

3. **Add Quality Metrics:**
   - Track mention extraction success rate
   - Track citation extraction success rate
   - Alert if extraction rates drop below threshold

---

## ✅ Verification Checklist

- [x] Worker gets brands from workspace (not just demo_run)
- [x] Competitor threshold lowered to 1 mention
- [x] Email handling fixed (userId-based fallback)
- [x] Enhanced JWT logging added
- [ ] Verify mentions are being saved (check database after job completion)
- [ ] Verify citations are being saved
- [ ] Monitor Clerk JWT payloads for email availability
- [ ] Test with Google OAuth to verify email handling


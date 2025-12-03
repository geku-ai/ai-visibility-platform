# Critical Fixes: Onboarding 403 Error and Mention Extraction

## Issues Fixed

### 1. 403 Forbidden on `POST /v1/onboarding/start`

**Problem:**
- The `WorkspaceAccessGuard` was only checking `request.params.workspaceId` (for GET requests) and `request.headers['x-workspace-id']`
- For `POST /v1/onboarding/start`, the `workspaceId` is in `request.body.workspaceId`
- This caused the guard to fail with `Missing workspaceId or userId` even though the workspaceId was present in the request body

**Fix:**
- Updated `WorkspaceAccessGuard` to also check `request.body?.workspaceId` for POST requests
- Added enhanced logging to show `requestBody` and `requestParams` for better diagnostics

**File:** `apps/api/src/guards/workspace-access.guard.ts`

**Code Change:**
```typescript
// Before:
const workspaceId = request.params.workspaceId || request.headers['x-workspace-id'];

// After:
const workspaceId = request.params.workspaceId || request.body?.workspaceId || request.headers['x-workspace-id'];
```

---

### 2. Missing Brands for Mention Extraction

**Problem:**
- The `run-prompt-worker` was logging `[RunPromptWorker] No brands found for mention extraction (workspaceId: demo_booking_com, demoRunId: none)`
- This happened because instant summary workspaces (`demo_*`) were created without `brandName` and `primaryDomain` set
- The worker's fallback logic to get brands from the workspace was failing because these fields were null

**Fix:**
- Updated `ensureWorkspace` method to accept an optional `domain` parameter
- Modified workspace creation/update to set `brandName` and `primaryDomain` when provided
- Updated all calls to `ensureWorkspace` in `getInstantSummaryV2` and other methods to pass the domain

**File:** `apps/api/src/modules/demo/demo.service.ts`

**Code Changes:**
1. **Updated `ensureWorkspace` signature:**
   ```typescript
   // Before:
   private async ensureWorkspace(workspaceId: string, name: string): Promise<void>

   // After:
   private async ensureWorkspace(workspaceId: string, name: string, domain?: string): Promise<void>
   ```

2. **Updated workspace INSERT to include brandName and primaryDomain:**
   ```sql
   INSERT INTO "workspaces" (..., "brandName", "primaryDomain", ...)
   VALUES (..., $6, $7, ...)
   ON CONFLICT ("id") DO UPDATE SET
     "brandName" = COALESCE(EXCLUDED."brandName", "workspaces"."brandName"),
     "primaryDomain" = COALESCE(EXCLUDED."primaryDomain", "workspaces"."primaryDomain")
   ```

3. **Updated all `ensureWorkspace` calls to pass domain:**
   ```typescript
   // Before:
   await this.ensureWorkspace(workspaceId, brand);

   // After:
   await this.ensureWorkspace(workspaceId, brand, normalized.href);
   ```

---

## Impact

### Onboarding Flow
- ✅ Users can now successfully submit the domain in the onboarding wizard
- ✅ `POST /v1/onboarding/start` will no longer return 403 Forbidden
- ✅ Workspace access verification works for both GET (params) and POST (body) requests

### Instant Summary Data Quality
- ✅ Workspaces created for instant summary now have `brandName` and `primaryDomain` set immediately
- ✅ Worker can extract brands from workspace even when `demoRunId` is not present
- ✅ Competitor and SOV data should now populate correctly as jobs complete
- ✅ Mentions extraction will work for instant summary runs

---

## Testing

### Test 1: Onboarding Flow
1. Sign in via Clerk
2. Navigate to onboarding wizard
3. Enter domain (should be pre-filled from instant summary)
4. Click "Continue" or submit
5. **Expected:** No 403 error, onboarding proceeds to next step

### Test 2: Instant Summary Mention Extraction
1. Go to instant summary page
2. Enter domain (e.g., `booking.com`)
3. Click "Analyze"
4. Wait for jobs to complete (30-60 seconds)
5. **Expected:** 
   - Competitor data appears
   - SOV data appears
   - Citations appear
   - No `[RunPromptWorker] No brands found` errors in jobs service logs

---

## Related Files

- `apps/api/src/guards/workspace-access.guard.ts` - Guard fix for POST body workspaceId
- `apps/api/src/modules/demo/demo.service.ts` - Workspace creation with brandName/primaryDomain
- `apps/jobs/src/workers/run-prompt-worker.ts` - Already has fallback logic (no changes needed)

---

## Deployment Notes

- ✅ No database migrations required (columns already exist)
- ✅ Backward compatible (domain parameter is optional)
- ✅ No breaking changes to API contracts

---

## Status

✅ **Ready for deployment**

Both fixes are backward compatible and should resolve the immediate issues preventing onboarding completion and instant summary data population.


# Critical Fixes: SQL Error and DTO Validation

## Issues Fixed

### 1. SQL Error: `column pr.engineKey does not exist`

**Problem:**
- The competitor aggregation query was trying to access `pr."engineKey"` directly from the `prompt_runs` table
- However, `prompt_runs` doesn't have an `engineKey` column - it has an `engineId` that references the `engines` table
- This caused the aggregation to fail with: `column pr.engineKey does not exist`
- Result: No competitor/SOV/citation data was being returned

**Fix:**
- Updated SQL queries to join with the `engines` table: `JOIN "engines" e ON e.id = pr."engineId"`
- Changed `pr."engineKey" = $2` to `e."key" = $2`
- Applied to both visibility count and tested count queries

**File:** `apps/api/src/modules/demo/demo.service.ts` (lines 2698-2721)

**Code Change:**
```sql
-- Before (BROKEN):
SELECT COUNT(DISTINCT pr."promptId")::int as count
FROM "prompt_runs" pr
JOIN "answers" a ON a."promptRunId" = pr.id
WHERE pr."workspaceId" = $1
  AND pr."engineKey" = $2  -- ❌ This column doesn't exist

-- After (FIXED):
SELECT COUNT(DISTINCT pr."promptId")::int as count
FROM "prompt_runs" pr
JOIN "engines" e ON e.id = pr."engineId"  -- ✅ Join with engines table
JOIN "answers" a ON a."promptRunId" = pr.id
WHERE pr."workspaceId" = $1
  AND e."key" = $2  -- ✅ Use engines.key instead
```

---

### 2. DTO Validation Error: `property entryType should not exist, property demoRunId should not exist`

**Problem:**
- Frontend was sending `entryType` and `demoRunId` in the request body for `POST /v1/onboarding/start`
- The `StartOnboardingRequestDto` only had `workspaceId` field
- NestJS validation pipe rejected the request with 400 Bad Request
- Result: Onboarding flow couldn't be started

**Fix:**
- Added `entryType` and `demoRunId` as optional fields to `StartOnboardingRequestDto`
- Marked them with `@IsOptional()` and `@ApiPropertyOptional()`
- These fields are ignored by the backend (not used), but now validation won't reject them

**File:** `apps/api/src/modules/onboarding/dto/onboarding.dto.ts`

**Code Change:**
```typescript
// Before (BROKEN):
export class StartOnboardingRequestDto {
  @ApiProperty({ description: 'Workspace ID' })
  @IsString()
  workspaceId: string;
}

// After (FIXED):
export class StartOnboardingRequestDto {
  @ApiProperty({ description: 'Workspace ID' })
  @IsString()
  workspaceId: string;

  @ApiPropertyOptional({ description: 'Entry type (optional, ignored if provided)' })
  @IsOptional()
  @IsString()
  entryType?: string;

  @ApiPropertyOptional({ description: 'Demo run ID (optional, ignored if provided)' })
  @IsOptional()
  @IsString()
  demoRunId?: string;
}
```

---

## Impact

### Instant Summary Data
- ✅ Competitor data will now populate correctly
- ✅ Share of Voice (SOV) data will now populate correctly
- ✅ Citation data will now populate correctly
- ✅ No more SQL errors in aggregation queries

### Onboarding Flow
- ✅ `POST /v1/onboarding/start` will no longer return 400 Bad Request
- ✅ Frontend can send `entryType` and `demoRunId` without validation errors
- ✅ Onboarding flow can proceed normally

---

## Testing

### Test 1: Instant Summary Competitor Data
1. Go to instant summary page
2. Enter domain (e.g., `booking.com`)
3. Click "Analyze"
4. Wait for jobs to complete (30-60 seconds)
5. **Expected:**
   - Competitor data appears in "TOP COMPETITORS" section
   - SOV data appears in "Share of Voice" section
   - Citations appear in citations section
   - No SQL errors in API service logs

### Test 2: Onboarding Flow
1. Sign in via Clerk
2. Navigate to onboarding wizard
3. Enter domain (should be pre-filled from instant summary)
4. Click "Continue" or submit
5. **Expected:**
   - No 400 Bad Request error
   - Onboarding proceeds to next step
   - No validation errors in API service logs

---

## Related Files

- `apps/api/src/modules/demo/demo.service.ts` - SQL query fix for competitor aggregation
- `apps/api/src/modules/onboarding/dto/onboarding.dto.ts` - DTO validation fix

---

## Deployment Notes

- ✅ No database migrations required
- ✅ Backward compatible (optional fields added)
- ✅ No breaking changes to API contracts

---

## Status

✅ **Ready for deployment**

Both fixes are critical and should resolve the immediate issues preventing competitor/SOV data from appearing and onboarding from starting.


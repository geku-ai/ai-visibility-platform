# Direct Signup Onboarding Flow Fix

## Problem
When users sign up directly (not through instant summary), the backend didn't know which domain to analyze. The dashboard endpoints would fail or show empty data because `primaryDomain` was not set.

## Solution Implemented

### Backend Changes

1. **Auto-Create Workspace for New Users** (`apps/api/src/modules/auth/auth.service.ts`)
   - Updated `getUserWorkspaces()` to automatically create a workspace if user has none
   - New workspaces are created with:
     - `onboardingEntryType = 'self_serve'`
     - `onboardingStatus = 'not_started'`
     - User is added as ADMIN member

2. **Onboarding Complete Guard** (`apps/api/src/guards/onboarding-complete.guard.ts`)
   - New guard that checks if workspace has completed onboarding
   - Returns `ONBOARDING_REQUIRED` error if:
     - `primaryDomain` is missing, OR
     - `onboardingStatus !== 'completed'`
   - Error response includes `onboardingStatus` and `hasDomain` for frontend handling

3. **Protected Dashboard Endpoints**
   - Added `OnboardingCompleteGuard` to:
     - `/v1/metrics/*` (MetricsController)
     - `/v1/geo/dashboard/*` (DashboardController)

4. **Updated Auth Profile Endpoint** (`apps/api/src/modules/auth/auth.controller.ts`)
   - Now calls `getUserWorkspaces()` which auto-creates workspace if needed
   - Ensures user always has at least one workspace after authentication

## Frontend Changes Needed (via Lovable)

The frontend needs to handle the `ONBOARDING_REQUIRED` error and redirect users to onboarding:

1. **Update API Error Handling**
   - In `apiClient.ts` or error handler, catch `ONBOARDING_REQUIRED` errors
   - Redirect to `/auth/onboarding` when this error is detected

2. **Update Dashboard Component**
   - Check for `ONBOARDING_REQUIRED` error when loading metrics
   - Show onboarding prompt or redirect if onboarding incomplete

3. **Update SignUp/SignIn Flow**
   - After successful auth, check onboarding status from `/v1/auth/profile`
   - If `onboardingStatus !== 'completed'`, redirect to `/auth/onboarding`
   - Remove dependency on `sessionStorage.getItem('geku_analyzed_domain')`

4. **Update ProtectedRoute Component**
   - After auth check, verify onboarding status
   - Redirect to onboarding if required before allowing dashboard access

## API Error Response Format

When onboarding is required, endpoints return:
```json
{
  "statusCode": 403,
  "message": {
    "code": "ONBOARDING_REQUIRED",
    "message": "Onboarding must be completed before accessing dashboard",
    "onboardingStatus": "not_started" | "in_progress",
    "hasDomain": false
  }
}
```

## Testing Checklist

- [ ] New user signs up → workspace auto-created
- [ ] New user tries to access dashboard → redirected to onboarding
- [ ] User completes onboarding → can access dashboard
- [ ] User with incomplete onboarding → cannot access dashboard
- [ ] User from instant summary flow → can access dashboard (domain already set)


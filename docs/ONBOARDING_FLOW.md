# Onboarding Flow Documentation

## Overview

The onboarding system supports three entry routes for users to get started with GEO:

1. **Instant Summary (Free Funnel)** - Anonymous users can try instant summary without signing up
2. **Self-Serve Signup** - Normal user signup flow
3. **Invited/Enterprise** - Admin-created or enterprise workspaces

## Onboarding Status

The system tracks onboarding progress through three states:

- `not_started` - User hasn't begun onboarding
- `in_progress` - User has started but not completed onboarding
- `completed` - User has finished onboarding and can access full features

## Onboarding Entry Types

- `instant_summary` - User came through the free instant summary funnel
- `self_serve` - User signed up normally through the signup flow
- `invited` - User was invited to an existing workspace (non-enterprise)
- `enterprise` - User belongs to an enterprise workspace

## API Endpoints

### GET `/v1/onboarding/state/:workspaceId`

Returns the current onboarding state for a workspace.

**Authentication:** Required (JWT)

**Response:**
```json
{
  "workspaceId": "workspace_123",
  "tier": "free",
  "onboardingStatus": "not_started",
  "onboardingEntryType": "self_serve",
  "nextScreen": "onboarding",
  "pendingItems": [
    "Add primary domain",
    "Add brand name",
    "Select business type"
  ],
  "onboardingData": {
    "primaryDomain": "example.com",
    "brandName": "Example Inc",
    "businessType": "SaaS",
    "location": {
      "city": "San Francisco",
      "country": "USA"
    },
    "competitors": ["competitor1.com", "competitor2.com"],
    "goals": ["visibility", "trust"],
    "businessSize": "11-50",
    "userRole": "owner",
    "copilotPreferences": {
      "weeklyIntelligence": true,
      "pageOptimization": false,
      "reviewAutomation": true
    }
  }
}
```

**nextScreen values:**
- `instant-summary` - Show instant summary page (for users who haven't signed up yet)
- `onboarding` - Show onboarding flow
- `dashboard` - Show main dashboard (onboarding completed)

### POST `/v1/onboarding/start`

Marks onboarding as started (sets status to `in_progress` if it was `not_started`).

**Authentication:** Required (JWT)

**Request Body:**
```json
{
  "workspaceId": "workspace_123"
}
```

**Response:** Updated `OnboardingStateDto`

### POST `/v1/onboarding/complete`

Marks onboarding as completed. Requires all required fields to be set:
- `primaryDomain`
- `brandName`
- `businessType`

**Authentication:** Required (JWT)

**Request Body:**
```json
{
  "workspaceId": "workspace_123"
}
```

**Response:** Updated `OnboardingStateDto`

**Errors:**
- `400 Bad Request` - If required fields are missing

### POST `/v1/onboarding/data`

Saves onboarding data to the workspace. Automatically sets status to `in_progress` if it was `not_started`.

**Authentication:** Required (JWT)

**Request Body:**
```json
{
  "workspaceId": "workspace_123",
  "data": {
    "primaryDomain": "example.com",
    "brandName": "Example Inc",
    "businessType": "SaaS",
    "location": {
      "city": "San Francisco",
      "country": "USA"
    },
    "userRole": "owner",
    "competitors": ["competitor1.com"],
    "businessSize": "11-50",
    "goals": ["visibility", "trust"],
    "copilotPreferences": {
      "weeklyIntelligence": true,
      "pageOptimization": false,
      "reviewAutomation": true
    }
  }
}
```

**Required Fields:**
- `primaryDomain` (string)
- `brandName` (string)
- `businessType` (enum: 'travel', 'SaaS', 'ecommerce', 'local_services', 'healthcare', 'education', 'finance', 'real_estate', 'other')

**Optional Fields:**
- `location` (object with `city` and `country`)
- `userRole` (enum: 'owner', 'marketer', 'agency', 'enterprise_admin')
- `competitors` (array of domain strings)
- `businessSize` (enum: 'solo', '1-10', '11-50', '50+')
- `goals` (array of strings: 'visibility', 'trust', 'design', 'content', 'citations', 'schema')
- `copilotPreferences` (object with boolean flags)

**Response:** Updated `OnboardingStateDto`

## Workspace Creation Defaults

When a workspace is created, onboarding defaults are set based on the entry type:

### Self-Serve Signup
```typescript
onboardingStatus: 'not_started'
onboardingEntryType: 'self_serve'
```

### Enterprise/Invited
```typescript
onboardingStatus: 'in_progress'
onboardingEntryType: 'enterprise' // if tier is 'enterprise', otherwise 'invited'
```

### Instant Summary (Demo)
```typescript
onboardingStatus: 'not_started'
onboardingEntryType: 'instant_summary'
```

## Database Schema

The `Workspace` model includes the following onboarding fields:

```prisma
model Workspace {
  // ... other fields
  
  onboardingStatus      String  @default("not_started")
  onboardingEntryType   String?
  
  // Onboarding data
  primaryDomain         String?
  brandName             String?
  businessType          String?
  location              Json?
  userRole              String?
  competitors           String[]
  businessSize          String?
  goals                 String[]
  copilotPreferences    Json?
}
```

## Integration Points

### When Creating Workspaces

If you create workspaces programmatically (e.g., during signup), call `OnboardingService.initializeOnboarding()`:

```typescript
// For normal signup
await onboardingService.initializeOnboarding(workspaceId, 'self_serve');

// For enterprise
await onboardingService.initializeOnboarding(workspaceId, 'enterprise');

// For invited users
await onboardingService.initializeOnboarding(workspaceId, 'invited');
```

### Frontend Integration

The frontend should:

1. Call `GET /v1/onboarding/state/:workspaceId` after user logs in
2. Check `nextScreen` to determine which page to show:
   - If `nextScreen === 'onboarding'` → Show onboarding flow
   - If `nextScreen === 'dashboard'` → Show dashboard
3. When user completes onboarding form, call `POST /v1/onboarding/data`
4. When user finishes onboarding, call `POST /v1/onboarding/complete`

## Route A: Instant Summary (Free Funnel)

**Current Behavior:**
- `/v1/instant-summary/v2?domain=...` works without authentication
- No changes needed to this endpoint

**Future Enhancement (TODO):**
- Track domains that have been "pre-touched" by instant summary
- When a workspace is later created with that domain, set `onboardingEntryType = 'instant_summary'`
- This is currently a TODO as it requires tracking anonymous domain usage

## Route B: Self-Serve Signup

**Flow:**
1. User signs up → Workspace created with `onboardingEntryType = 'self_serve'`, `onboardingStatus = 'not_started'`
2. Frontend calls `GET /v1/onboarding/state/:workspaceId` → Returns `nextScreen = 'onboarding'`
3. User fills onboarding form → Frontend calls `POST /v1/onboarding/data`
4. User completes onboarding → Frontend calls `POST /v1/onboarding/complete`
5. Next login → `GET /v1/onboarding/state/:workspaceId` returns `nextScreen = 'dashboard'`

## Route C: Invited/Enterprise

**Flow:**
1. Admin creates workspace → `onboardingEntryType = 'enterprise'` (if tier is enterprise) or `'invited'`, `onboardingStatus = 'in_progress'`
2. User logs in → Frontend calls `GET /v1/onboarding/state/:workspaceId` → Returns `nextScreen = 'onboarding'`
3. User completes onboarding → Frontend calls `POST /v1/onboarding/complete`
4. Next login → `nextScreen = 'dashboard'`

## Validation

The system validates required fields before allowing onboarding completion:

- `primaryDomain` - Must be a valid domain string
- `brandName` - Must be non-empty
- `businessType` - Must be one of the allowed enum values

If any required field is missing when calling `POST /v1/onboarding/complete`, the API returns `400 Bad Request`.

## Notes

- All onboarding endpoints require authentication via JWT
- Workspace access is verified using `WorkspaceAccessGuard`
- The `tier` field in the response helps the frontend determine feature availability
- Onboarding data is stored directly on the `Workspace` model for easy access by GEO Intelligence and Copilot features



# Fix: Onboarding Data DTO Field Name Mismatch

## Problem

The frontend sends `onboardingData` as a nested object:
```json
{
  "workspaceId": "...",
  "onboardingData": {
    "primaryDomain": "booking.com",
    "brandName": "Booking"
  }
}
```

But the backend DTO `SaveOnboardingDataRequestDto` expected:
```json
{
  "workspaceId": "...",
  "data": {
    "primaryDomain": "booking.com",
    "brandName": "Booking"
  }
}
```

This caused a `400 Bad Request` error: `'property onboardingData should not exist'`

## Solution

Updated `SaveOnboardingDataRequestDto` to accept both field names:
- `data` (original)
- `onboardingData` (what frontend sends)

The controller now checks for both and uses whichever is provided.

## Files Changed

- `apps/api/src/modules/onboarding/dto/onboarding.dto.ts`
- `apps/api/src/modules/onboarding/onboarding.controller.ts`

## Verification

After deployment, test onboarding flow:
1. Sign in via Clerk
2. Go to onboarding wizard
3. Enter domain and click "Continue"
4. Should see `200 OK` instead of `400 Bad Request`


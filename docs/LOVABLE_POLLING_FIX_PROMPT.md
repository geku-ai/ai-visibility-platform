# 🚨 CRITICAL FIX: Instant Summary Timeout and Polling Logic

## Problems

### Problem 1: Request Timeout (HTTP 499)
The frontend request times out after ~55 seconds while the backend takes ~93 seconds to process. This causes:
- `net::ERR_NETWORK_CHANGED` errors
- "Failed to fetch" errors
- Request never completes, so no data is received

**HTTP Logs show:**
- `httpStatus: 499` (Client Closed Request)
- `totalDuration: 55467ms` (~55 seconds)
- `responseDetails: "client has closed the request before the server could send a response"`

### Problem 2: Polling Not Starting
Even when the request succeeds, polling doesn't start when analysis is running. This causes:
- Competitor data never appears
- Share of Voice data never appears  
- Citations never populate
- Data remains incomplete even after jobs complete

## Root Causes

### Root Cause 1: No Timeout Configuration
The frontend `fetch` call has no timeout, so it uses the browser default (~30-60 seconds). The backend takes ~93 seconds, causing the request to timeout.

**File**: `/Users/tusharmehrotra/geku/src/lib/apiClient.ts`
- Line 76: `const response = await fetch(url, { ...options, headers })`
- No `signal` or `timeout` configured

### Root Cause 2: Polling Logic Bug
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

## Files to Fix

### File 1: API Client Timeout
**File**: `/Users/tusharmehrotra/geku/src/lib/apiClient.ts`

**Location**: Lines 32-105 (the `request` function)

### File 2: Polling Logic
**File**: `/Users/tusharmehrotra/geku/src/pages/InstantSummary.tsx`

**Location**: Lines 48-110 (the polling `useEffect`)

## Required Changes

### Change 1: Add Timeout to API Client (apiClient.ts)

**File**: `/Users/tusharmehrotra/geku/src/lib/apiClient.ts`

**Replace the `request` function (lines 32-105) with:**

```typescript
async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  // Try to get Clerk token first, fallback to session store
  let token: string | null = null;
  
  try {
    // Use the token getter if available (preferred method)
    if (getClerkToken) {
      token = await getClerkToken();
    }
    
    // Fallback to window.Clerk if getter not available
    if (!token && window.Clerk && window.Clerk.session) {
      token = await window.Clerk.session.getToken();
    }
    
    // Last resort: session store
    if (!token) {
      token = useSessionStore.getState().token;
    }
  } catch (error) {
    console.warn('[Auth] Failed to get Clerk token, using session store:', error);
    token = useSessionStore.getState().token;
  }
  
  // Demo endpoints are public - no authentication required
  const isPublic = endpoint === '/v1/instant-summary' || 
                   endpoint.startsWith('/v1/demo') ||
                   endpoint.startsWith('/v1/demo/instant-summary/v2');

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token && !isPublic) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${baseURL}${endpoint}`;

  // ✅ NEW: Add timeout for long-running requests (especially instant-summary)
  // Backend can take 90-120 seconds, so set timeout to 180 seconds (3 minutes)
  const timeoutMs = endpoint.includes('instant-summary') ? 180000 : 60000; // 3 min for instant-summary, 1 min for others
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal, // ✅ Add abort signal
    });

    clearTimeout(timeoutId); // Clear timeout if request completes

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(
        response.status,
        errorData.message || `Request failed with status ${response.status}`,
        errorData
      );
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId); // Always clear timeout
    
    // ✅ NEW: Handle 499 (Client Closed Request) and timeout errors gracefully
    if (error instanceof Error) {
      if (error.name === 'AbortError' || error.message.includes('aborted')) {
        console.warn(`[API] Request timeout for ${endpoint} (${timeoutMs}ms)`);
        // For instant-summary, this is expected - backend is still processing
        // Return a partial response that triggers polling
        if (endpoint.includes('instant-summary')) {
          throw new ApiError(499, 'Request timeout - analysis still running, will poll for updates', {
            timeout: true,
            endpoint,
          });
        }
      }
      
      // Handle network errors (including 499 from Railway)
      if (error.message.includes('Failed to fetch') || error.message.includes('network')) {
        console.warn(`[API] Network error for ${endpoint}:`, error.message);
        if (endpoint.includes('instant-summary')) {
          throw new ApiError(499, 'Network error - analysis may still be running, will poll for updates', {
            networkError: true,
            endpoint,
          });
        }
      }
    }
    
    if (error instanceof ApiError) throw error;
    
    // Log the actual error for debugging
    console.error('[API Error]', endpoint, error);
    
    // Mock data fallback in demo mode
    if (mockMode) {
      console.warn('[Mock Mode] API call failed, returning mock data for:', endpoint);
      return getMockData(endpoint) as T;
    }
    
    throw new ApiError(500, `Network error calling ${endpoint}`, error);
  }
}
```

### Change 2: Handle 499 Errors in InstantSummary Component

**File**: `/Users/tusharmehrotra/geku/src/pages/InstantSummary.tsx`

**In the `handleAnalyze` function (around line 260), update error handling:**

**Find this:**
```typescript
if (!response.ok) {
  const errorMessage = (response as any).data?.message || 
                      (response as any).data?.error?.message || 
                      'Failed to load summary';
  console.error('[InstantSummary] API error response', { message: errorMessage, data: response.data });
  setError(errorMessage);
  setIsLoading(false);
  return;
}
```

**Replace with:**
```typescript
if (!response.ok) {
  const errorMessage = (response as any).data?.message || 
                      (response as any).data?.error?.message || 
                      'Failed to load summary';
  
  // ✅ NEW: Handle 499 (timeout) gracefully - backend is still processing
  if (response.status === 499 || (response as any).data?.timeout || (response as any).data?.networkError) {
    console.log('[InstantSummary] Request timeout/network error - backend still processing, will poll', {
      status: response.status,
      error: errorMessage,
    });
    // Don't set error - instead, set a minimal data structure to trigger polling
    // The polling logic will fetch the actual data
    setData({
      domain: analyzeDomain,
      geoScore: { total: 0 }, // Temporary - will be updated by polling
      status: 'analysis_running',
      completedJobs: 0,
      totalJobs: 30, // Estimated
      prompts: [],
    } as any);
    setIsLoading(false);
    // Polling will start automatically via the useEffect
    return;
  }
  
  console.error('[InstantSummary] API error response', { message: errorMessage, data: response.data });
  setError(errorMessage);
  setIsLoading(false);
  return;
}
```

**Also update the catch block (around line 340):**

**Find this:**
```typescript
} catch (err: any) {
  const duration = Date.now() - startTime;
  console.error('[InstantSummary] Analysis failed', {
    duration: `${duration}ms`,
    error: err?.message || 'Unknown error',
    domain: analyzeDomain,
  });
  setError(err?.message || 'Failed to analyze domain. Please try again.');
  setIsLoading(false);
}
```

**Replace with:**
```typescript
} catch (err: any) {
  const duration = Date.now() - startTime;
  
  // ✅ NEW: Handle timeout/network errors gracefully
  if (err instanceof ApiError && (err.status === 499 || err.data?.timeout || err.data?.networkError)) {
    console.log('[InstantSummary] Request timeout - backend still processing, will poll', {
      duration: `${duration}ms`,
      error: err.message,
      domain: analyzeDomain,
    });
    // Set minimal data to trigger polling
    setData({
      domain: analyzeDomain,
      geoScore: { total: 0 },
      status: 'analysis_running',
      completedJobs: 0,
      totalJobs: 30,
      prompts: [],
    } as any);
    setIsLoading(false);
    // Polling will start automatically
    return;
  }
  
  console.error('[InstantSummary] Analysis failed', {
    duration: `${duration}ms`,
    error: err?.message || 'Unknown error',
    domain: analyzeDomain,
  });
  setError(err?.message || 'Failed to analyze domain. Please try again.');
  setIsLoading(false);
}
```

**Don't forget to import `ApiError`:**
```typescript
import { ApiError } from '@/lib/apiClient';
```

### Change 3: Update Polling Condition (Lines 90-110)

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


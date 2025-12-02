# 🚨 CRITICAL FRONTEND FIXES REQUIRED

## Issue Summary

Two critical issues are preventing the application from working correctly:

1. **Instant Summary Shows Zeros**: Backend queues jobs correctly, but frontend doesn't handle async data collection
2. **Post-Auth "No Workspace Selected"**: Workspace isn't being set in the store after sign-in

---

## Issue 1: Instant Summary Shows Zeros (Async Data Collection)

### Problem
- Backend **IS working correctly** - it queues 30 prompt runs and they execute successfully
- But the instant summary endpoint returns **immediately** before jobs complete
- Frontend shows zeros because database is still empty when it checks
- This is **expected behavior** - jobs run asynchronously in background

### Backend Behavior
- `GET /v1/demo/instant-summary/v2?domain=example.com`:
  1. Generates prompts
  2. Queues 30 jobs (10 prompts × 3 engines: PERPLEXITY, BRAVE, AIO)
  3. Returns summary **immediately** with zeros (no data yet)
  4. Jobs run in background and populate database over next 30-60 seconds

### Frontend Fix Required

**File**: `/Users/tusharmehrotra/geku/src/pages/InstantSummary.tsx`

**Changes Needed**:

1. **Add polling mechanism** to check for data updates after initial response
2. **Show loading state** while data is being collected
3. **Update UI** when data becomes available

**Implementation**:

```typescript
// After fetching instant summary, poll for updates
const [summaryData, setSummaryData] = useState<any>(null);
const [isCollectingData, setIsCollectingData] = useState(false);
const [pollCount, setPollCount] = useState(0);

// After initial fetch
useEffect(() => {
  if (summaryData?.metadata?.demoRunId && !isCollectingData) {
    setIsCollectingData(true);
    
    // Poll every 5 seconds for up to 60 seconds
    const pollInterval = setInterval(async () => {
      setPollCount(prev => prev + 1);
      
      if (pollCount >= 12) { // 12 × 5s = 60s max
        clearInterval(pollInterval);
        setIsCollectingData(false);
        return;
      }
      
      try {
        // Re-fetch instant summary to get updated data
        const updated = await apiClient.get(`/v1/demo/instant-summary/v2?domain=${domain}`);
        if (updated?.data?.data) {
          const newData = updated.data.data;
          
          // Check if we have real data now (non-zero scores)
          if (newData.geoScore?.overall > 0 || 
              newData.visibilitySnapshot?.engines?.some((e: any) => e.visible)) {
            setSummaryData(newData);
            setIsCollectingData(false);
            clearInterval(pollInterval);
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 5000);
    
    return () => clearInterval(pollInterval);
  }
}, [summaryData?.metadata?.demoRunId, domain]);
```

**UI Changes**:

```typescript
// Show collecting state
{isCollectingData && (
  <div className="text-center py-4">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
    <p className="text-sm text-muted-foreground">
      Collecting data from AI engines... ({pollCount * 5}s)
    </p>
  </div>
)}
```

---

## Issue 2: Post-Auth "No Workspace Selected"

### Problem
- Backend creates workspace automatically when user signs in
- But frontend `ProtectedRoute` tries to set workspace **during render** (not in useEffect)
- This doesn't work reliably - workspace never gets set in store
- Dashboard shows "No Workspace Selected" message

### Backend Behavior
- `GET /v1/auth/profile`:
  1. Validates user
  2. **Auto-creates workspace** if user has none
  3. Returns `{ user: {...}, workspaces: [...] }`

### Frontend Fix Required

**File**: `/Users/tusharmehrotra/geku/src/components/ProtectedRoute.tsx`

**Current Code (BROKEN)**:
```typescript
// Set workspaces when profile loads
if (profile?.workspaces && !activeWorkspace) {
  setWorkspaces(profile.workspaces);
  setActiveWorkspace(profile.workspaces[0]); // Default to first workspace
}
```

**Fixed Code**:
```typescript
// Set workspaces when profile loads (use useEffect, not render)
useEffect(() => {
  if (profile?.workspaces && profile.workspaces.length > 0) {
    setWorkspaces(profile.workspaces);
    
    // Only set active workspace if not already set
    if (!activeWorkspace) {
      setActiveWorkspace(profile.workspaces[0]);
    }
  }
}, [profile?.workspaces, activeWorkspace, setWorkspaces, setActiveWorkspace]);
```

**Also add import**:
```typescript
import { useEffect } from 'react';
```

---

## Testing Checklist

### Instant Summary
- [ ] Enter domain on instant summary page
- [ ] See initial response (may show zeros)
- [ ] See "Collecting data..." message
- [ ] Data updates automatically within 30-60 seconds
- [ ] GEO Score, engines, citations populate correctly

### Post-Auth Workspace
- [ ] Sign in via Clerk
- [ ] Redirected to dashboard
- [ ] Workspace is automatically selected (no "No Workspace Selected" message)
- [ ] Dashboard loads with workspace context

---

## Backend Status

✅ **Backend is working correctly**:
- Workspace auto-creation: ✅ Fixed (using raw SQL)
- Instant summary job queuing: ✅ Working (30 jobs queued successfully)
- Job execution: ✅ Working (jobs completing in logs)

**No backend changes needed** - these are frontend-only fixes.

---

## Priority

🔴 **CRITICAL** - Both issues block core user flows:
1. Instant summary is the main conversion funnel
2. Post-auth workspace selection blocks all authenticated features

**Fix immediately before any other frontend work.**


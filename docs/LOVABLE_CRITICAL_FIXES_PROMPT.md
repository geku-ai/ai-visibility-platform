# 🚨 CRITICAL FIXES FOR LOVABLE - URGENT

## Two Critical Issues Blocking User Flows

### Issue 1: Instant Summary Shows Zeros (Async Data Collection)
**Problem**: Backend queues jobs correctly, but frontend doesn't wait for data to populate.

### Issue 2: Post-Auth "No Workspace Selected"  
**Problem**: Workspace isn't set in store after sign-in, blocking dashboard access.

---

## FIX 1: Instant Summary Async Data Collection

### File
`/Users/tusharmehrotra/geku/src/pages/InstantSummary.tsx`

### Problem
Backend queues 30 prompt runs asynchronously. The instant summary endpoint returns immediately with zeros because jobs haven't completed yet. Frontend needs to poll for updates.

### Solution
Add polling mechanism after initial fetch to check for data updates.

### Implementation

**Step 1**: Add state for polling
```typescript
const [isCollectingData, setIsCollectingData] = useState(false);
const [pollCount, setPollCount] = useState(0);
```

**Step 2**: Add useEffect to poll after initial fetch
```typescript
useEffect(() => {
  // Only poll if we have a demoRunId and data is still zero
  if (summaryData?.metadata?.demoRunId && 
      (!summaryData.geoScore?.overall || summaryData.geoScore.overall === 0) &&
      !isCollectingData) {
    
    setIsCollectingData(true);
    let currentPoll = 0;
    
    const pollInterval = setInterval(async () => {
      currentPoll++;
      setPollCount(currentPoll);
      
      // Stop after 60 seconds (12 polls × 5s)
      if (currentPoll >= 12) {
        clearInterval(pollInterval);
        setIsCollectingData(false);
        return;
      }
      
      try {
        // Re-fetch to get updated data
        const response = await apiClient.get(`/v1/demo/instant-summary/v2?domain=${domain}`);
        if (response?.ok && response?.data?.data) {
          const newData = response.data.data;
          
          // Check if we have real data now
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
    }, 5000); // Poll every 5 seconds
    
    return () => clearInterval(pollInterval);
  }
}, [summaryData?.metadata?.demoRunId, domain, isCollectingData]);
```

**Step 3**: Add UI indicator for data collection
```typescript
{isCollectingData && (
  <div className="text-center py-4 border-t border-border mt-4">
    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
    <p className="text-sm text-muted-foreground">
      Collecting data from AI engines... ({pollCount * 5}s)
    </p>
    <p className="text-xs text-muted-foreground mt-1">
      This may take 30-60 seconds
    </p>
  </div>
)}
```

**Place this UI indicator**: After the main results cards, before the CTA section.

---

## FIX 2: Post-Auth Workspace Selection

### File
`/Users/tusharmehrotra/geku/src/components/ProtectedRoute.tsx`

### Problem
Workspace is set during render (line 19-22), which doesn't work reliably. Should use `useEffect`.

### Current Code (BROKEN)
```typescript
// Set workspaces when profile loads
if (profile?.workspaces && !activeWorkspace) {
  setWorkspaces(profile.workspaces);
  setActiveWorkspace(profile.workspaces[0]); // Default to first workspace
}
```

### Fixed Code
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

**Also ensure `useEffect` is imported**:
```typescript
import { ReactNode, useEffect } from 'react';
```

---

## Testing

### Test Fix 1 (Instant Summary)
1. Go to `/instant-summary?domain=elevenlabs.io`
2. Click "Analyze"
3. Should see initial response (may show zeros)
4. Should see "Collecting data..." message
5. Data should update automatically within 30-60 seconds
6. GEO Score, engines, citations should populate

### Test Fix 2 (Workspace Selection)
1. Sign in via Clerk
2. Should be redirected to `/app/dashboard`
3. Should NOT see "No Workspace Selected" message
4. Dashboard should load with workspace context

---

## Priority

🔴 **CRITICAL** - Both issues block core user flows. Fix immediately.

---

## Backend Status

✅ Backend is working correctly:
- Workspace auto-creation: ✅ Fixed
- Instant summary job queuing: ✅ Working (30 jobs queued)
- Job execution: ✅ Working (jobs completing)

**No backend changes needed** - these are frontend-only fixes.


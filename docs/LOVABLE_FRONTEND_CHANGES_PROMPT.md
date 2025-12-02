# Frontend Changes Prompt for Lovable

## CRITICAL: Post-Auth Dashboard Data Integration

### Context
The backend has been updated to provide comprehensive intelligence data after authentication. The Dashboard component currently shows mock/placeholder data. It needs to fetch and display real data from the GEO Intelligence API endpoint.

---

## CHANGE 1: Update Dashboard to Fetch Real Intelligence Data

### File Path
`/Users/tusharmehrotra/geku/src/pages/app/Dashboard.tsx`

### Current Problem
- Dashboard shows hardcoded mock data (lines 14-42)
- No API calls to fetch real intelligence data
- No integration with workspace context

### Required Changes

#### Step 1.1: Import Required Dependencies
Add these imports at the top of `Dashboard.tsx` (after existing imports):

```typescript
import { useEffect, useState } from 'react';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { apiClient } from '@/lib/apiClient';
import { useOnboardingState } from '@/hooks/useOnboardingState';
```

#### Step 1.2: Add State Management
Replace the current `Dashboard` component function (starting at line 70) with:

```typescript
export default function Dashboard() {
  const { activeWorkspace } = useWorkspaceStore();
  const { data: onboardingState } = useOnboardingState(activeWorkspace?.id);
  const { data: credits } = useCredits();
  
  // State for intelligence data
  const [intelligenceData, setIntelligenceData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [mentionsModalOpen, setMentionsModalOpen] = useState(false);
  const [coverageModalOpen, setCoverageModalOpen] = useState(false);
  const [trustModalOpen, setTrustModalOpen] = useState(false);
  const [sovModalOpen, setSovModalOpen] = useState(false);

  // Fetch intelligence data when workspace is available and onboarding is complete
  useEffect(() => {
    const fetchIntelligenceData = async () => {
      if (!activeWorkspace?.id) {
        setIsLoading(false);
        return;
      }

      // Only fetch if onboarding is completed
      if (onboardingState?.onboardingStatus !== 'completed') {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Call the GEO Intelligence endpoint
        const response = await apiClient.get<any>(
          `/v1/geo/intelligence/${activeWorkspace.id}`,
          { refresh: false }
        );

        // Handle response format
        if (response.error) {
          throw new Error(response.error.message || 'Failed to fetch intelligence data');
        }

        setIntelligenceData(response);
      } catch (err: any) {
        console.error('Failed to fetch intelligence data:', err);
        setError(err.message || 'Failed to load dashboard data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchIntelligenceData();
  }, [activeWorkspace?.id, onboardingState?.onboardingStatus]);
```

#### Step 1.3: Add Data Transformation Helpers
Add these helper functions BEFORE the component (after imports, before the component):

```typescript
// Extract engine visibility from intelligence data
const extractEngineVisibility = (intelligenceData: any) => {
  const engines: Array<{ key: string; visible: boolean; visibilityScore?: number }> = [];
  
  // Try to extract from crossEnginePatterns
  if (intelligenceData?.crossEnginePatterns?.enginesRecognizing) {
    intelligenceData.crossEnginePatterns.enginesRecognizing.forEach((e: any) => {
      engines.push({
        key: e.engine?.toLowerCase() || e.engine,
        visible: true,
        visibilityScore: e.recognitionScore,
      });
    });
  }
  
  // If no engines found, check citations
  if (engines.length === 0 && intelligenceData?.citations) {
    const citations = Array.isArray(intelligenceData.citations)
      ? intelligenceData.citations
      : Object.values(intelligenceData.citations);
    
    const enginesWithData = new Set(
      citations.map((c: any) => c.engine?.toLowerCase()).filter(Boolean)
    );
    
    ['chatgpt', 'claude', 'gemini', 'perplexity'].forEach(key => {
      engines.push({
        key,
        visible: enginesWithData.has(key),
      });
    });
  }
  
  // Fallback: all false
  if (engines.length === 0) {
    ['chatgpt', 'claude', 'gemini', 'perplexity'].forEach(key => {
      engines.push({ key, visible: false });
    });
  }
  
  return engines;
};

// Transform citations to frontend format
const transformCitations = (intelligenceData: any) => {
  let citations = intelligenceData?.citations;
  
  // Handle array format
  if (Array.isArray(citations)) {
    return citations.map((c: any) => ({
      domain: c.domain || c.url?.split('/')[2] || 'unknown',
      references: c.references || c.count || 1,
      sharePercentage: c.sharePercentage || 0,
      engines: c.engines || [],
      lastSeen: c.lastSeen || c.date || new Date().toISOString(),
      competitorOnly: c.competitorOnly || false,
    }));
  }
  
  // Handle object format (grouped by domain)
  if (citations && typeof citations === 'object') {
    return Object.entries(citations).map(([domain, data]: [string, any]) => ({
      domain,
      references: data.references || data.count || 1,
      sharePercentage: data.sharePercentage || 0,
      engines: data.engines || [],
      lastSeen: data.lastSeen || data.date || new Date().toISOString(),
      competitorOnly: data.competitorOnly || false,
    }));
  }
  
  return [];
};
```

#### Step 1.4: Update Data Display
Replace the hardcoded values with data from `intelligenceData`:

**AI Visibility Score (around line 107-108):**
```typescript
// Replace hardcoded "72" with:
{intelligenceData?.geoScore?.overall || 0}
```

**KPI Cards (around line 150+):**
Extract real values from `intelligenceData`:
```typescript
// Calculate from sovAnalysis (share of voice)
const shareOfVoice = intelligenceData?.sovAnalysis || [];
const totalMentions = shareOfVoice.reduce((sum: number, item: any) => 
  sum + (item.mentions || item.count || 0), 0
);

// Engine visibility
const engines = extractEngineVisibility(intelligenceData);
const enginesVisible = engines.filter(e => e.visible).length;

// Citations count
const citations = transformCitations(intelligenceData);
const topCitations = citations.length;
```

**Engine Coverage (around line 24-28):**
Replace `mockEngineData` with:
```typescript
const engines = extractEngineVisibility(intelligenceData);
const engineData = engines.map((engine) => ({
  engine: engine.key.charAt(0).toUpperCase() + engine.key.slice(1),
  coverage: engine.visibilityScore || (engine.visible ? 85 : 0),
}));
```

**Citations Table (around line 38-42):**
Replace `mockCitedDomains` with:
```typescript
const citedDomains = transformCitations(intelligenceData);
```

#### Step 1.5: Add Loading and Error States
Add before the return statement:

```typescript
// Loading state
if (isLoading) {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
        <p className="text-muted-foreground">Loading dashboard data...</p>
      </div>
    </div>
  );
}

// Error state
if (error) {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Card className="p-6 max-w-md">
        <h3 className="text-lg font-semibold mb-2">Failed to Load Dashboard</h3>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </Card>
    </div>
  );
}

// No workspace state
if (!activeWorkspace) {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Card className="p-6 max-w-md">
        <h3 className="text-lg font-semibold mb-2">No Workspace Selected</h3>
        <p className="text-muted-foreground">Please select a workspace to view dashboard data.</p>
      </Card>
    </div>
  );
}
```

---

## CHANGE 2: Verify OnboardingWizard Domain Pre-population

### File Path
`/Users/tusharmehrotra/geku/src/pages/auth/OnboardingWizard.tsx`

### Verification
The code should already have domain pre-population (lines 43-49 and 52). **VERIFY** this code exists:

```typescript
// Check sessionStorage for pre-analyzed domain from instant summary
const getPreAnalyzedDomain = () => {
  if (typeof window !== 'undefined') {
    return sessionStorage.getItem('geku_analyzed_domain') || '';
  }
  return '';
};

const [data, setData] = useState<OnboardingData>({
  domain: getPreAnalyzedDomain(), // Pre-populate from instant summary
  prompts: [],
  competitors: [],
  businessSummary: '',
});
```

**If this code is NOT present**, add it exactly as shown above.

---

## CHANGE 3: Add Intelligence API Client Helper (Optional but Recommended)

### File Path
`/Users/tusharmehrotra/geku/src/lib/apiClient.ts`

### Purpose
Create a dedicated helper function for fetching intelligence data with proper TypeScript types.

### Implementation
Add this function to the `apiClient` object (around line 354):

```typescript
export const apiClient = {
  // ... existing methods ...
  
  /**
   * Get comprehensive GEO intelligence data for a workspace
   * @param workspaceId - The workspace ID
   * @param refresh - Force refresh (bypass cache)
   * @returns GEOIntelligenceResponse with all insights, recommendations, citations, etc.
   */
  getIntelligence: <T = any>(workspaceId: string, refresh: boolean = false) => {
    return request<T>(`/v1/geo/intelligence/${workspaceId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  },
};
```

Then update Dashboard.tsx to use it:
```typescript
const response = await apiClient.getIntelligence(activeWorkspace.id, false);
```

---

## API Endpoint Details

### Endpoint
```
GET /v1/geo/intelligence/:workspaceId
```

### Query Parameters
- `refresh` (optional, boolean): Force recompute vs use cache (default: false)

### Authentication
- **Required**: Yes (JWT Bearer token)
- **Header**: `Authorization: Bearer <token>`
- Token is automatically added by `apiClient` if user is authenticated

### Response Format
```typescript
{
  // Core data
  workspaceId: string;
  brandName: string;
  domain: string;
  
  // Industry classification
  industry: {
    primary: string;
    confidence: number;
  };
  
  // GEO Score
  geoScore: {
    overall: number; // 0-100
    components: {
      visibility: number;
      trust: number;
      citations: number;
      schema: number;
    };
  };
  
  // Share of Voice
  shareOfVoice: Array<{
    entityKey: string;
    entityLabel: string;
    mentions: number;
    positiveMentions: number;
    neutralMentions: number;
    negativeMentions: number;
    sharePercentage: number;
  }>;
  
  // Citations
  citations: Array<{
    domain: string;
    references: number;
    sharePercentage: number;
    engines: string[];
    lastSeen: string;
  }>;
  
  // Engine visibility
  engines: Array<{
    key: string;
    visible: boolean;
    visibilityScore?: number;
  }>;
  
  // Insights
  insights: Array<{
    type: string;
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  
  // Recommendations
  recommendations: Array<{
    id: string;
    title: string;
    description: string;
    category: string;
    priority: 'high' | 'medium' | 'low';
    steps: string[];
  }>;
  
  // Metadata
  metadata: {
    generatedAt: string;
    confidence: number;
    warnings?: Array<{ source: string; message: string }>;
  };
}
```

### Error Response
If there's an error:
```typescript
{
  error: {
    code: string;
    message: string;
    details?: any;
  }
}
```

---

## Testing Checklist

After implementing changes, verify:

1. ✅ Dashboard loads when user is authenticated
2. ✅ Dashboard shows loading state while fetching data
3. ✅ Dashboard displays real data from API (not mock data)
4. ✅ Error handling works if API call fails
5. ✅ OnboardingWizard pre-populates domain from sessionStorage
6. ✅ Dashboard only loads when onboarding is completed
7. ✅ All KPI cards show real values
8. ✅ Engine coverage shows real engine visibility
9. ✅ Citations table shows real citation data
10. ✅ Share of voice data is displayed correctly

---

## Important Notes

1. **Authentication**: The endpoint requires JWT authentication. The `apiClient` automatically adds the token if the user is authenticated via Clerk.

2. **Onboarding Guard**: Only fetch intelligence data if `onboardingStatus === 'completed'`. If not completed, show appropriate message or redirect to onboarding.

3. **Error Handling**: Always handle API errors gracefully. Show user-friendly error messages.

4. **Loading States**: Show loading indicators while data is being fetched.

5. **Data Format**: The API response may have nested structures. Use optional chaining (`?.`) to safely access properties.

6. **Caching**: The API caches responses for 5 minutes. Use `refresh: true` to force a fresh fetch if needed.

---

## Files to Modify

1. **Primary**: `/Users/tusharmehrotra/geku/src/pages/app/Dashboard.tsx`
   - Add state management for intelligence data
   - Add useEffect to fetch data
   - Replace mock data with real API data
   - Add loading and error states

2. **Verification**: `/Users/tusharmehrotra/geku/src/pages/auth/OnboardingWizard.tsx`
   - Verify domain pre-population code exists (should already be there)

3. **Optional**: `/Users/tusharmehrotra/geku/src/lib/apiClient.ts`
   - Add `getIntelligence` helper method

---

## Expected Behavior After Changes

1. User signs in → Redirected to dashboard
2. Dashboard checks onboarding status
3. If onboarding complete → Fetches intelligence data from `/v1/geo/intelligence/:workspaceId`
4. Dashboard displays:
   - Real GEO score
   - Real share of voice data
   - Real citations
   - Real engine visibility
   - Real insights and recommendations
5. If onboarding not complete → Shows message or redirects to onboarding
6. If API error → Shows error message with retry option

---

## Questions or Issues?

If you encounter any issues:
1. Check browser console for API errors
2. Verify JWT token is being sent in Authorization header
3. Verify workspaceId is correct
4. Check network tab for API response format
5. Verify onboarding status is 'completed' before fetching


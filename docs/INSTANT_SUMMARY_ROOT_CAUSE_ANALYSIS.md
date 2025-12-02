# Instant Summary Root Cause Analysis

## 🔴 THE REAL PROBLEM

The backend is returning a **completely different data structure** than what the frontend expects. This is why:
1. Instant summary shows zeros (frontend can't parse the data correctly)
2. Polling doesn't work (frontend checks for fields that don't exist)
3. Data never appears (structure mismatch)

---

## Backend Response Structure

**Backend returns** (from `demo.service.ts` `getInstantSummaryV2`):
```typescript
{
  domain: string,
  industry: { primary: string, confidence: number },
  summary: { 
    whatYouDo: string, 
    whereYouOperate: string, 
    whoYouServe: string,
    whyYouStandOut?: string 
  },
  geoScore: { 
    overall: number,
    components: { visibility, trust, citations, schema },
    explanation: string 
  },
  visibilitySnapshot: { 
    engines: Array<{ key, visible, confidence, samplePrompt?, evidenceSnippet? }> 
  },
  topInsights: string[],
  ctaHints: { shouldSignUpForCopilot: boolean, reasons: string[] },
  metadata: { generatedAt, serviceVersion, confidence, warnings? }
}
```

**Then wrapped in controller** (from `demo.controller.ts`):
```typescript
{
  ok: true,
  data: {
    data: summaryData,  // <-- The structure above
    evidence: [],
    confidence: ...,
    warnings: ...,
    explanation: ...,
    metadata: ...
  }
}
```

---

## Frontend Expected Structure

**Frontend expects** (from `PremiumInstantSummaryData` type):
```typescript
{
  demoRunId: string,
  workspaceId: string,
  domain: string,
  brand: string,
  industry: PremiumIndustry,  // Different structure!
  summary: PremiumBusinessSummary,  // Different structure!
  prompts: PremiumPrompt[],  // MISSING in backend!
  competitors: PremiumCompetitor[],  // MISSING in backend!
  shareOfVoice: PremiumShareOfVoice[],  // MISSING in backend!
  citations: PremiumCitation[],  // MISSING in backend!
  geoScore: PremiumGEOScore | null,  // Different structure!
  eeatScore: PremiumEEATScore | null,  // MISSING in backend!
  engines: Array<{ key: string; visible: boolean }>,  // Different location!
  status: string,  // MISSING in backend!
  progress: number,  // MISSING in backend!
  totalJobs: number,  // MISSING in backend!
  completedJobs: number,  // MISSING in backend!
}
```

---

## Frontend Code Issues

**Line 53-58** - Polling check:
```typescript
const geoScore = typeof data.geoScore === 'object' 
  ? (data.geoScore as PremiumGEOScore).total || 0  // ❌ Backend has geoScore.overall, not .total
  : data.geoScore || 0;

const hasRealData = geoScore > 0 || 
  (data.prompts && data.prompts.length > 0 && data.prompts.some(p => p.evidence?.hasBeenTested));
  // ❌ data.prompts doesn't exist in backend response!
```

**Line 147-149** - Score calculation:
```typescript
const businessScore = typeof data?.geoScore === 'object' 
  ? (data.geoScore as PremiumGEOScore).total || 0  // ❌ Backend has .overall, not .total
  : data?.geoScore || 0;
```

**Line 160-163** - Prompts access:
```typescript
const prompts = Array.isArray(data?.prompts) ? data.prompts : [];
// ❌ data.prompts doesn't exist in backend response!
const businessAppearances = prompts.filter(p => 
  p.evidence?.hasBeenTested
).length || 0;
```

**Line 185-189** - Summary access:
```typescript
const summaryText = typeof data?.summary === 'object' && data.summary 
  ? (data.summary as PremiumBusinessSummary).summary || 'No summary available'
  // ❌ Backend has data.summary.whatYouDo, not data.summary.summary
  : typeof data?.summary === 'string' 
  ? data.summary 
  : 'No summary available';
```

---

## Why Data Shows as Zero

1. **geoScore.total doesn't exist** - Backend returns `geoScore.overall`
2. **data.prompts doesn't exist** - Backend doesn't return prompts array
3. **data.summary.summary doesn't exist** - Backend returns `data.summary.whatYouDo`
4. **Polling never detects data** - Because it checks for fields that don't exist

---

## The Fix

**Option 1: Change Backend to Match Frontend** (Recommended)
- Return `geoScore.total` instead of `geoScore.overall`
- Include `prompts` array with evidence
- Include `competitors`, `shareOfVoice`, `citations` arrays
- Include `demoRunId`, `workspaceId`, `brand`, `status`, `progress`, `totalJobs`, `completedJobs`
- Change `summary` structure to match `PremiumBusinessSummary`
- Change `industry` structure to match `PremiumIndustry`

**Option 2: Change Frontend to Match Backend** (Not recommended - frontend is more complete)
- Update types to match backend
- Update all data access code
- Update polling logic

---

## Recommended Solution

**Backend should return the full `PremiumInstantSummaryData` structure** that the frontend expects, even if some fields are empty initially. This allows:
1. Frontend to parse data correctly
2. Polling to work (can check for `prompts` with `evidence.hasBeenTested`)
3. All UI components to render properly

The backend already has access to all this data - it just needs to be structured correctly in the response.


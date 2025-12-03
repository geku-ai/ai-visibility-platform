# Mention Extraction and Brand Matching Fixes

## Problem
The instant summary page was showing:
- No competitor data
- No SOV (Share of Voice) data
- No citations
- Terrible/inaccurate GEO scores
- Missing or incomplete mentions in LLM responses

## Root Causes Identified

1. **Brand Name Case Preservation Issue**: The `extractMentions` function was converting all brands to lowercase for matching but not preserving the original case when storing mentions. This could cause issues with brand name matching in aggregation queries.

2. **Limited Brand Variation Matching**: The mention extraction only looked for exact matches or very similar fuzzy matches, missing common variations like:
   - Domain without TLD (e.g., "booking" from "booking.com")
   - Different case variations (e.g., "Booking" vs "booking")
   - Domain extensions (e.g., "booking.com" vs "booking")

3. **Insufficient Diagnostic Logging**: When mentions weren't found, there wasn't enough logging to understand why (e.g., whether the brand name appeared in the text but wasn't extracted, or whether it didn't appear at all).

## Solutions Implemented

### 1. Fixed Brand Name Case Preservation (`packages/parser/src/mentions.ts`)

**Before:**
- Brands were converted to lowercase for matching
- `getOriginalBrandName()` just returned the lowercase brand as-is
- Mentions were stored with lowercase brand names

**After:**
- Created a `brandMap` that maps lowercase brands to their original case
- Passed this map to `findBrandMentions()` to preserve original brand names
- Mentions are now stored with the original brand name case from the input array

**Code Changes:**
```typescript
// Create mapping from lowercase brand to original brand (preserve first occurrence as canonical)
const brandMap = new Map<string, string>();
for (const brand of brands) {
  const key = caseSensitive ? brand : brand.toLowerCase();
  if (!brandMap.has(key)) {
    brandMap.set(key, brand);
  }
}
```

### 2. Enhanced Brand Variation Matching (`packages/parser/src/mentions.ts`)

**Added:**
- Automatic generation of brand variations:
  - Domain without extension (e.g., "booking" from "booking.com")
  - Domain without common TLDs (e.g., "booking" from "booking.com", "booking.net", etc.)
  - All variations map back to the original brand name

**Code Changes:**
```typescript
// Also create variations of brands (e.g., "booking.com" -> "booking", "Booking.com" -> "booking")
const brandVariations = new Set<string>();
const variationToOriginal = new Map<string, string>();

for (const brand of filteredBrands) {
  brandVariations.add(brand);
  const original = brandMap.get(brand) || brand;
  variationToOriginal.set(brand, original);
  
  // Add domain without extension
  const domainMatch = brand.match(/^([^.]+)\./);
  if (domainMatch) {
    const baseDomain = domainMatch[1].toLowerCase();
    if (baseDomain !== brand && baseDomain.length > 2) {
      brandVariations.add(baseDomain);
      variationToOriginal.set(baseDomain, original);
    }
  }
  
  // Add brand without common TLDs
  const withoutTld = brand.replace(/\.(com|net|org|io|co|ai|app)$/, '').toLowerCase();
  if (withoutTld !== brand && withoutTld.length > 2) {
    brandVariations.add(withoutTld);
    variationToOriginal.set(withoutTld, original);
  }
}
```

### 3. Enhanced Diagnostic Logging (`apps/jobs/src/workers/run-prompt-worker.ts`)

**Added:**
- Logging of which brands were actually found in mentions (not just count)
- Logging of confidence scores for each mention
- Detection of brand names that appear in text but weren't extracted (suggests confidence threshold issue)
- Warning when brand names don't appear in text at all (suggests LLM didn't mention the brand)
- Extended response sample from 200 to 500 characters for better debugging

**Code Changes:**
```typescript
if (mentions.length > 0) {
  const foundBrands = [...new Set(mentions.map(m => m.brand))];
  console.log(`[RunPromptWorker] Found ${mentions.length} mention(s) for brands: ${brandsToSearch.join(', ')}`);
  console.log(`[RunPromptWorker] Mentioned brands in response: ${foundBrands.join(', ')}`);
  console.log(`[RunPromptWorker] Brand confidence scores: ${mentions.map(m => `${m.brand}:${m.confidence.toFixed(2)}`).join(', ')}`);
} else if (brandsToSearch.length > 0) {
  // ... existing logging ...
  // Also check if any brand name appears in the response (case-insensitive)
  const responseLower = result.answerText.toLowerCase();
  const foundInText = brandsToSearch.filter(brand => responseLower.includes(brand.toLowerCase()));
  if (foundInText.length > 0) {
    console.warn(`[RunPromptWorker] Brand names found in text (but not extracted as mentions): ${foundInText.join(', ')}`);
    console.warn(`[RunPromptWorker] This suggests the confidence threshold (0.4) might be too high or the matching logic needs improvement`);
  } else {
    console.warn(`[RunPromptWorker] None of the brand names appear in the response text at all`);
  }
}
```

## Expected Impact

1. **More Mentions Found**: Brand variations will catch mentions that were previously missed (e.g., "booking" mentioned when searching for "booking.com")

2. **Correct Brand Names**: Mentions will be stored with the original brand name case, ensuring proper matching in aggregation queries

3. **Better Debugging**: Enhanced logging will help identify:
   - When brands appear in text but aren't extracted (confidence threshold issue)
   - When brands don't appear in text at all (LLM response issue)
   - Which brands are actually being mentioned vs. searched for

4. **Improved Competitor/SOV Data**: With more mentions being found and stored correctly, the aggregation queries should return more complete competitor and SOV data

## Testing Recommendations

1. **Check Jobs Service Logs**: Look for the new diagnostic messages to see:
   - Which brands are being searched
   - Which brands are found in mentions
   - Whether brands appear in text but aren't extracted
   - Confidence scores for mentions

2. **Verify Database**: Check the `mentions` table to ensure:
   - Brand names are stored with correct case
   - More mentions are being created
   - Brand names match what's expected

3. **Test Instant Summary**: Run an instant summary and verify:
   - Competitor data appears
   - SOV data is populated
   - Citations are found
   - GEO score is more accurate

## Files Modified

1. `packages/parser/src/mentions.ts` - Fixed brand name preservation and added variation matching
2. `apps/jobs/src/workers/run-prompt-worker.ts` - Enhanced diagnostic logging

## Related Fixes

These fixes complement the previous fixes for:
- Workspace brand/domain retrieval (retry logic)
- Lower confidence threshold (0.4 instead of 0.6)
- SQL aggregation query fixes (correct table joins)

All of these work together to ensure mentions are found, stored correctly, and aggregated properly for the instant summary.


# GEO Score and Brand Extraction Improvements

## Problems Identified

1. **GEO Score Contradiction**: The instant summary showed a GEO score of 25/100, but the detailed explanation said "AI Visibility score of 0/100 based on average coverage across 3 engines. 0 engines show visibility, with an average of 0% prompt coverage." This contradiction confused users.

2. **Low Mention Counts**: Only 2-3 mentions were being detected for major brands like Airbnb, which seems very low for such a prominent brand.

3. **Generic Competitor Names**: Competitor extraction was finding generic terms like "Vacation Rentals" (a category) instead of actual brand names like "Vrbo", "Booking.com", "Expedia".

## Root Causes

### Issue 1: GEO Score Contradiction
- The AI visibility score calculation was using exact brand name matching (`LOWER(m."brand") = LOWER($4)`)
- When searching for "Airbnb", it wasn't finding mentions stored as "airbnb.com" or other variations
- This caused 0% coverage and 0 engines showing visibility, even though mentions existed
- The total GEO score (25/100) was calculated from other factors (EEAT, citations, competitor comparison, schema), not just AI visibility
- The explanation text was showing the AI visibility breakdown (0/100) which contradicted the total score

### Issue 2: Low Mention Counts
- Same issue as above - brand matching was too strict, missing variations
- This caused fewer mentions to be counted, resulting in lower scores

### Issue 3: Generic Competitor Names
- The `extractAllBrandMentions` function was extracting capitalized words/phrases without filtering out generic business terms
- Terms like "Vacation Rentals", "Hotels", "Booking" (as a verb) were being treated as brand names

## Solutions Implemented

### Fix 1: Flexible Brand Matching in AI Visibility Calculation
- **Updated `premium-geo-score.service.ts`**:
  - Added `normalizeBrandForMatching` function to normalize brand names (remove TLD, protocol, www)
  - Modified SQL queries to use flexible brand matching:
    - Exact match: `LOWER(m."brand") = LOWER($4)` (original brand name)
    - Normalized match: `LOWER(m."brand") = LOWER($5)` (normalized brand)
    - Domain match: `LOWER(REPLACE(...)) = LOWER($5)` (domain without protocol/www)
    - Base domain match: `LOWER(SPLIT_PART(..., '.', 1)) = LOWER($6)` (base domain without TLD)
  - This ensures mentions stored as "airbnb.com" are found when searching for "Airbnb"

### Fix 2: Improved Explanation Text
- **Updated explanation generation**:
  - Only show detailed explanation if we have engine data
  - If no engines show visibility and score is 0, show a more helpful message
  - Avoid showing contradictory information (0 engines when total score is > 0)
  - Better handling of edge cases (no engine data, incomplete data collection)

### Fix 3: Filter Generic Terms from Brand Extraction
- **Updated `extractAllBrandMentions` in `mentions.ts`**:
  - Added `genericTerms` set with common business/category terms:
    - "vacation rentals", "hotel", "booking", "travel", "accommodation", etc.
    - "service", "platform", "website", "company", "business", etc.
    - "solution", "product", "application", "software", "system", etc.
  - Filter out these generic terms before adding them as brand mentions
  - This prevents generic categories from appearing as competitors

## Code Changes

### `packages/geo/src/scoring/premium-geo-score.service.ts`
- Added `normalizeBrandForMatching` function
- Updated both AI visibility queries (per-engine and per-prompt) to use flexible brand matching
- Improved explanation text generation with better edge case handling

### `packages/parser/src/mentions.ts`
- Added `genericTerms` set to filter out generic business/category terms
- Updated brand extraction logic to skip generic terms

## Expected Results

1. **GEO Score Consistency**: The AI visibility explanation should now match the total GEO score, or at least not contradict it. If mentions exist, they should be found and counted correctly.

2. **Higher Mention Counts**: More mentions should be detected because brand matching is now flexible enough to catch variations like "airbnb.com" when searching for "Airbnb".

3. **Better Competitor Names**: Generic terms like "Vacation Rentals" should be filtered out, leaving only actual brand names like "Vrbo", "Booking.com", "Expedia" as competitors.

## Testing

After deployment, verify:
1. GEO score explanation matches or doesn't contradict the total score
2. Mention counts are higher (more mentions detected)
3. Competitor list shows actual brand names, not generic categories
4. AI visibility score calculation finds mentions correctly


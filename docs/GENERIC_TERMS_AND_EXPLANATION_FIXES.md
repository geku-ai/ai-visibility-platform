# Generic Terms Filter and Explanation Text Fixes

## Problems Identified

1. **Generic Competitor Names**: Terms like "Best Online Travel Agencies" and "Source" were appearing as competitors instead of actual brand names.

2. **GEO Score Explanation Contradiction**: The explanation showed "AI Visibility score of 0/100" even when the total GEO score was 28/100, creating confusion.

## Root Causes

### Issue 1: Generic Terms Not Filtered
- The `extractAllBrandMentions` function was extracting capitalized phrases without checking if they contained generic business terms
- Phrases like "Best Online Travel Agencies" matched the brand name pattern but weren't filtered out
- Single words like "Source" (capitalized) were being treated as brand names

### Issue 2: Explanation Text Confusion
- The frontend displays `geoScore.breakdown.aiVisibility.explanation` which shows the AI visibility component score
- When AI visibility is 0/100 but total GEO score is 28/100 (from other components), it creates a contradiction
- The explanation didn't clarify that it's just one component, not the total score

## Solutions Implemented

### Fix 1: Enhanced Generic Terms Filter
- **Expanded generic terms list** in `packages/parser/src/mentions.ts`:
  - Added travel-specific terms: "best online travel agencies", "online travel agencies", "ota", "travel agency"
  - Added generic content terms: "source", "sources", "reference", "article", "blog", "guide"
  - Added category terms: "category", "type", "option", "choice", "alternative"
  
- **Added pattern matching**:
  - Skip phrases starting with generic qualifiers: "Best X", "Top X", "Leading X", etc.
  - Skip phrases ending with generic business terms: "X Agencies", "X Services", "X Platforms", etc.
  - Check individual words in multi-word phrases
  - Skip single-word generic terms

### Fix 2: Clarified Explanation Text
- **Updated explanation in `premium-geo-score.service.ts`**:
  - Changed from "AI Visibility score of 0/100" to "Mention-based visibility: 0/100"
  - Added note: "Note: Your total GEO score includes other factors (EEAT, citations, schema) beyond mentions."
  - Clarifies that this is just one component, not the total score
  - Prevents confusion when total score is higher than AI visibility component

## Code Changes

### `packages/parser/src/mentions.ts`
- Expanded `genericTerms` set with more travel and business terms
- Added pattern matching for generic phrase patterns
- Added check for phrases ending with generic business terms
- Added check for single-word generic terms

### `packages/geo/src/scoring/premium-geo-score.service.ts`
- Updated explanation text to use "Mention-based visibility" instead of "AI Visibility score"
- Added clarifying note about total GEO score including other factors
- Improved explanation to show actual prompt counts when available

## Expected Results

1. **Better Competitor Names**: Generic terms like "Best Online Travel Agencies" and "Source" should be filtered out, leaving only actual brand names.

2. **Clearer Explanation**: The explanation should clarify that "Mention-based visibility: 0/100" is just one component, and the total GEO score includes other factors, preventing confusion.

3. **More Accurate Data**: Competitor lists should show real brands like "Expedia", "Vrbo", "Lastminute.com" instead of generic categories.

## Testing

After deployment, verify:
1. Competitor list shows actual brand names, not generic terms
2. Explanation text clarifies it's "Mention-based visibility" not total score
3. No more "Best Online Travel Agencies" or "Source" in competitor lists


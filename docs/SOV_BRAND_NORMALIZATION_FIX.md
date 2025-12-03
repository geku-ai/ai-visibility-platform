# Share of Voice Brand Normalization Fix

## Problem

The instant summary was showing:
- **0 mentions** for "Your Business" in Appearance Frequency
- **0.0%** Share of Voice for "Your Business"
- **No competitor data available**

This was happening even though mentions were being stored in the database.

## Root Cause

The Share of Voice and competitor detection queries were grouping mentions by the exact brand name as stored in the database. However, mentions were being stored with different variations:
- "Booking" (from `deriveBrandFromHost`)
- "booking.com" (from domain)
- "Booking.com" (capitalized domain)

These were being treated as **separate brands**, so:
1. Mentions were split across multiple brand entries
2. The frontend couldn't find "Booking" because mentions were stored as "booking.com"
3. Share of Voice percentages were calculated incorrectly
4. Competitor detection was also affected

## Solution

### Normalized Brand Grouping in SQL Queries

Updated both the **Share of Voice** and **competitor detection** queries to:
1. Normalize brand names by removing protocol, www, and TLD
2. Group by base domain name (e.g., "booking" from "booking.com")
3. Use the first occurrence as the canonical brand name for display
4. Ensure the main brand uses the derived brand name ("Booking") for consistency with frontend expectations

### Code Changes

**Share of Voice Query (`demo.service.ts`):**
- Changed from `GROUP BY m."brand"` to using a CTE that normalizes brands first
- Groups by `base_brand` (domain without TLD)
- Returns `canonicalBrand` (first occurrence) for display
- Maps main brand to use derived name ("Booking") for frontend matching

**Competitor Detection Query:**
- Same normalization approach
- Groups brand variations together
- Filters out main brand using normalized comparison

## Expected Results

1. **Mentions should be grouped correctly**: All variations of "Booking" (Booking, booking.com, Booking.com) will be counted together
2. **"Your Business" should show correct counts**: The main brand will appear in Share of Voice with the correct name and mention count
3. **Share of Voice percentages should be accurate**: Total mentions will include all brand variations
4. **Competitors should be detected**: Competitor detection will also benefit from normalized grouping

## Testing

After deployment, verify:
1. "Your Business" shows non-zero mentions in Appearance Frequency
2. Share of Voice shows correct percentage for main brand
3. Competitor data appears correctly
4. All brand variations are grouped together


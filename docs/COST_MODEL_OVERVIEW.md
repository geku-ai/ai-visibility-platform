# Cost Model Overview

**Last Updated:** 2025-11-28  
**Purpose:** Founder-friendly overview of variable costs for GEO Copilot intelligence pipeline.

---

## Executive Summary

This document provides clear, actionable cost estimates for different usage scenarios in GEO Copilot. All costs are **variable costs** (external API calls) and do not include infrastructure (database, Redis, hosting).

**Key Takeaway:** Costs scale with usage. Caching significantly reduces costs for repeat analyses.

---

## Per-Run Cost Estimates

### 1. Instant Summary V2 (Free Funnel)

**What it is:** Lightweight 5-step analysis for public/free users.

**Estimated Cost:** **$0.05 - $0.15 per run**

**Breakdown:**
- LLM calls: 3 calls (~8,000 tokens)
- Search API calls: ~40 calls (10 prompts × 4 engines)
- **LLM cost:** ~$0.03 - $0.08 (depending on model)
- **Search cost:** ~$0.02 - $0.08 (depending on provider)

**Monthly Example:**
- 1,000 Instant Summaries per month = **$50 - $150/month**
- 10,000 Instant Summaries per month = **$500 - $1,500/month**

**Optimization:** Can be reduced by using cheaper LLM models (Gemini Flash) and optimizing prompt counts.

---

### 2. Full GEO Intelligence Run (Paid)

**What it is:** Complete 15-step intelligence orchestration for paying clients.

**Estimated Cost:** **$0.50 - $2.00 per run**

**Breakdown:**
- LLM calls: 15-30 calls (~30,000-60,000 tokens)
- Search API calls: 80-200 calls (20-50 prompts × 4 engines)
- **LLM cost:** ~$0.30 - $1.50 (depending on model and complexity)
- **Search cost:** ~$0.20 - $0.50 (depending on provider)

**Monthly Example:**
- 20 Full Intelligence runs per month = **$10 - $40/month per client**
- 100 Full Intelligence runs per month = **$50 - $200/month per client**

**Optimization:** 
- Caching prompt runs reduces search API calls to 0 for subsequent runs
- Using cheaper models for non-critical steps can reduce LLM costs by 30-50%

---

### 3. Opportunities Only (Cached Intelligence)

**What it is:** Generating visibility opportunities from already-cached intelligence data.

**Estimated Cost:** **$0.20 - $0.80 per run** (if cached) or **$0.50 - $2.00** (if not cached)

**Breakdown:**
- LLM calls: 20-100 calls (~20,000-100,000 tokens)
- Search API calls: 0 (if cached) or 80-200 (if not cached)
- **LLM cost:** ~$0.20 - $0.80
- **Search cost:** $0 (cached) or ~$0.20 - $0.50 (not cached)

**Monthly Example:**
- 50 Opportunities runs per month (cached) = **$10 - $40/month**
- 50 Opportunities runs per month (not cached) = **$25 - $100/month**

**Key Insight:** Caching saves ~$0.30 - $0.50 per run.

---

### 4. Recommendations Only (Cached Intelligence)

**What it is:** Generating actionable recommendations from already-cached intelligence data.

**Estimated Cost:** **$0.10 - $0.40 per run** (if cached) or **$0.50 - $2.00** (if not cached)

**Breakdown:**
- LLM calls: 10-20 calls (~10,000-20,000 tokens)
- Search API calls: 0 (cached)
- **LLM cost:** ~$0.10 - $0.40
- **Search cost:** $0 (cached)

**Monthly Example:**
- 100 Recommendations runs per month (cached) = **$10 - $40/month**

---

### 5. Copilot Automation (Weekly/Monthly)

**What it is:** Automated weekly/monthly intelligence runs + content generation + review responses.

#### Low Automation
- 1 full intelligence run per week
- 5 pages optimized per week
- 10 review responses per week

**Weekly Cost:** ~$1.00 - $3.00  
**Monthly Cost:** ~$4.30 - $13.00

#### Medium Automation
- 2 full intelligence runs per week
- 10 pages optimized per week
- 20 review responses per week

**Weekly Cost:** ~$2.00 - $6.00  
**Monthly Cost:** ~$8.60 - $26.00

#### High Automation
- 4 full intelligence runs per week
- 20 pages optimized per week
- 40 review responses per week

**Weekly Cost:** ~$4.00 - $12.00  
**Monthly Cost:** ~$17.30 - $52.00

---

## Cost Scaling Examples

### Scenario A: Free Funnel (1,000 Instant Summaries/month)
- **Variable Cost:** $50 - $150/month
- **Per User:** ~$0.05 - $0.15 per summary
- **Break-even:** Need to convert ~1-3% to paid to cover costs

### Scenario B: Paying Client (20 Full Intelligence runs/month)
- **Variable Cost:** $10 - $40/month per client
- **Per Run:** ~$0.50 - $2.00
- **Break-even:** Need subscription price > $10-40/month to cover variable costs

### Scenario C: Enterprise Client (100 Full Intelligence runs/month + Copilot High)
- **Variable Cost:** $50 - $200/month (intelligence) + $17 - $52/month (Copilot) = **$67 - $252/month**
- **Per Client:** ~$67 - $252/month
- **Break-even:** Need subscription price > $67-252/month to cover variable costs

---

## Cost Optimization Strategies

### 1. **Caching**
- **Impact:** Reduces search API calls to 0 for cached prompt runs
- **Savings:** ~$0.30 - $0.50 per Full Intelligence run
- **Implementation:** Already implemented in pipeline

### 2. **Model Selection**
- **Cheaper Models:** Use Gemini Flash or Claude Haiku for non-critical steps
- **Savings:** 30-50% reduction in LLM costs
- **Trade-off:** Slightly lower quality for non-critical analyses

### 3. **Prompt Optimization**
- **Reduce Prompt Count:** Limit to essential prompts for Instant Summary
- **Savings:** ~$0.01 - $0.02 per prompt reduction
- **Trade-off:** Less comprehensive analysis

### 4. **Provider Selection**
- **Use Cheaper Search APIs:** SerpAPI is cheapest ($0.00005/request)
- **Savings:** ~50-80% reduction in search API costs
- **Trade-off:** May have rate limits or lower quality

### 5. **Batch Processing**
- **Group Similar Requests:** Process multiple clients in batch
- **Savings:** Reduced overhead, better provider rate limits
- **Trade-off:** Slightly longer processing time

---

## Pricing Recommendations

### Free Tier
- **Limit:** 10 Instant Summaries per month
- **Cost:** ~$0.50 - $1.50 per user/month
- **Strategy:** Use cheapest models, strict rate limiting

### Starter Tier ($29/month)
- **Limit:** 5 Full Intelligence runs/month
- **Variable Cost:** ~$2.50 - $10/month
- **Margin:** ~$19 - $26.50/month (66-91% margin)

### Pro Tier ($99/month)
- **Limit:** 20 Full Intelligence runs/month + 10 Opportunities runs
- **Variable Cost:** ~$15 - $60/month
- **Margin:** ~$39 - $84/month (39-85% margin)

### Enterprise Tier ($299/month)
- **Limit:** 100 Full Intelligence runs/month + Copilot High automation
- **Variable Cost:** ~$67 - $252/month
- **Margin:** ~$47 - $232/month (16-78% margin)

---

## Monitoring & Alerts

### Cost Thresholds
- **Warning:** > $500/month variable costs
- **Critical:** > $1,000/month variable costs
- **Action:** Review usage patterns, implement caching, optimize models

### Key Metrics to Track
1. **Cost per Instant Summary:** Should be < $0.15
2. **Cost per Full Intelligence:** Should be < $2.00
3. **Cost per Copilot Client:** Should be < $50/month
4. **Cache Hit Rate:** Should be > 70% for paying clients

---

## Next Steps

1. **Update Pricing Config:** Replace placeholder prices in `packages/geo/src/cost/cost.config.ts` with actual provider pricing
2. **Monitor Real Costs:** Track actual API usage and compare to estimates
3. **Optimize Models:** Test cheaper models for non-critical steps
4. **Implement Caching:** Ensure prompt runs are cached effectively
5. **Set Up Alerts:** Monitor cost thresholds and usage patterns

---

## Questions?

For technical details, see:
- `docs/COST_DRIVERS.md` - Detailed provider and usage analysis
- `packages/geo/src/cost/cost.config.ts` - Pricing configuration
- `packages/geo/src/cost/cost-estimator.service.ts` - Estimation logic

For API usage, see:
- `GET /v1/cost/estimate/instant-summary?domain=...`
- `GET /v1/cost/estimate/intelligence/:workspaceId`
- `GET /v1/cost/estimate/copilot/:workspaceId?automationLevel=medium`



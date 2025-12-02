# Step-by-Step Testing Guide

Follow these steps **one by one** and share feedback after each step.

---

## STEP 1: Check Prerequisites

### 1.1 Check Node.js Version
```bash
node --version
```
**Expected**: v18.12 or higher  
**If lower**: Update Node.js or use `nvm`:
```bash
nvm install 20
nvm use 20
```

**Share result**: ✅ Node version is: `____`

---

### 1.2 Check if Docker is Running
```bash
docker ps
```
**Expected**: Docker daemon running

**Share result**: ✅ Docker is running / ❌ Docker is not running

---

### 1.3 Check if .env file exists
```bash
ls -la .env
```
**If it doesn't exist**, create it:
```bash
cp .env.example .env
```

**Share result**: ✅ .env exists / ❌ Created new .env

---

## STEP 2: Start Infrastructure (PostgreSQL & Redis)

### 2.1 Start Docker containers
```bash
cd /Users/tusharmehrotra/ai-visibility-platform
docker compose -f infra/docker-compose.yml up -d
```

**Wait 5 seconds**, then check status:
```bash
docker compose -f infra/docker-compose.yml ps
```

**Expected**: PostgreSQL and Redis containers showing as "Up"

**Share result**: ✅ Containers running / ❌ Containers failed / ⚠️ Need help

---

## STEP 3: Run Database Migration (REQUIRED)

### 3.1 Navigate to db package
```bash
cd /Users/tusharmehrotra/ai-visibility-platform/packages/db
```

### 3.2 Run migration for EEATScore table
```bash
pnpm prisma migrate dev --name add_eeat_score_model
```

**What to expect**: 
- It will ask: "Do you want to create and apply it?" → Type `Y` and press Enter
- Should create migration file and apply it

**Share result**: ✅ Migration successful / ❌ Error (paste the error)

---

## STEP 4: Configure Environment for Testing

### 4.1 Open .env file
```bash
cd /Users/tusharmehrotra/ai-visibility-platform
# Open .env in your editor, or use:
cat .env | grep -E "DEBUG_JWT_MODE|DATABASE_URL|NODE_ENV"
```

### 4.2 Ensure these lines exist in .env:
```env
DEBUG_JWT_MODE=true
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_visibility?schema=public
```

**Note**: Adjust DATABASE_URL if your PostgreSQL credentials are different.

**Share result**: ✅ Config looks good / ❌ Need to add/update values

---

## STEP 5: Get a Workspace ID

### 5.1 Option A: Use Prisma Studio (Easiest)
```bash
cd /Users/tusharmehrotra/ai-visibility-platform/packages/db
pnpm prisma studio
```

This opens a browser. Look at:
- **Workspace** table → copy any `id`
- **WorkspaceProfile** table → verify that workspace has a profile

### 5.2 Option B: Query via SQL
```bash
# If you have psql installed
psql $DATABASE_URL -c "SELECT id FROM \"Workspace\" LIMIT 1;"
```

### 5.3 Option C: Create Test Workspace
If you have no workspaces, we'll create one in the next step.

**Share result**: ✅ Found workspace ID: `____` / ❌ No workspace found, need to create

---

## STEP 6: Start the API Server

### 6.1 Navigate to project root
```bash
cd /Users/tusharmehrotra/ai-visibility-platform
```

### 6.2 Start API server
```bash
pnpm --filter @apps/api dev
```

**What to expect**:
- Server starts on port 8080 (or 3000 - check console output)
- Should see: "🚀 AI Visibility API running on port..."
- Should see: "📚 Swagger docs available at..."

**Keep this terminal running!**

**Share result**: ✅ API started on port `____` / ❌ Error starting (paste error)

---

## STEP 7: Test Health Endpoint

### 7.1 Open new terminal (keep API running)

### 7.2 Test health
```bash
curl http://localhost:8080/healthz
```

**Expected**: `{"status":"ok","timestamp":"..."}`

**Share result**: ✅ Health check passed / ❌ Failed

---

## STEP 8: Test E-E-A-T Endpoint

### 8.1 Get your workspace ID from Step 5

### 8.2 Test E-E-A-T endpoint
```bash
curl "http://localhost:8080/v1/geo/eeat?workspaceId=YOUR_WORKSPACE_ID"
```

**Replace `YOUR_WORKSPACE_ID`** with the ID from Step 5.

**Expected Response**:
```json
{
  "ok": true,
  "data": {
    "experience": 65,
    "expertise": 72,
    "authoritativeness": 58,
    "trustworthiness": 70,
    "overallScore": 66,
    "level": "high",
    ...
  }
}
```

**OR if no WorkspaceProfile exists**:
```json
{
  "ok": false,
  "data": null
}
```

**Share result**: 
- ✅ Got response: `____` 
- ❌ Error: `____`
- ⚠️ Got `ok: false` - need to create WorkspaceProfile

---

## STEP 9: Test Fact Consensus Endpoint

### 9.1 Test consensus endpoint
```bash
curl "http://localhost:8080/v1/geo/evidence/consensus?workspaceId=YOUR_WORKSPACE_ID"
```

**Expected**: 
- If you have citations/evidence: Array of fact consensus scores
- If no evidence: Empty array `{"ok":true,"data":[]}`

**Share result**: ✅ Response: `____` / ❌ Error

---

## STEP 10: Test Dashboard Overview

### 10.1 Test dashboard
```bash
curl "http://localhost:8080/v1/geo/dashboard/overview?workspaceId=YOUR_WORKSPACE_ID"
```

**Expected**: Large JSON with maturity, recommendations, engine comparison, etc.

**Share result**: ✅ Got dashboard data / ❌ Error

---

## STEP 11: Use Swagger UI (Recommended for Detailed Testing)

### 11.1 Open browser
Go to: `http://localhost:8080/v1/docs`

### 11.2 Find the new endpoints
Look for:
- **GEO E-E-A-T** → `GET /v1/geo/eeat`
- **GEO Evidence** → `GET /v1/geo/evidence/consensus`
- **GEO Dashboard** → All dashboard endpoints

### 11.3 Click "Try it out"
1. Enter your workspace ID
2. Click "Execute"
3. See the response

**Share result**: ✅ Swagger works / ❌ Can't access / ⚠️ Need help navigating

---

## Troubleshooting Common Issues

### Issue: "No workspace profile found"
**Solution**: Create a WorkspaceProfile via Prisma Studio or SQL:
```sql
INSERT INTO "WorkspaceProfile" (id, "workspaceId", "businessName", "verified")
VALUES ('test-profile-123', 'YOUR_WORKSPACE_ID', 'Test Business', false);
```

### Issue: "Table 'eeat_scores' doesn't exist"
**Solution**: Go back to Step 3 and run the migration again

### Issue: "401 Unauthorized"
**Solution**: Make sure `DEBUG_JWT_MODE=true` in `.env` and restart API

### Issue: "Cannot connect to database"
**Solution**: Check Docker containers are running (Step 2) and DATABASE_URL in .env

---

## Quick Reference: All Endpoints to Test

Once everything is working, test these:

1. ✅ `GET /v1/geo/eeat?workspaceId=XXX`
2. ✅ `GET /v1/geo/evidence/consensus?workspaceId=XXX`
3. ✅ `GET /v1/geo/dashboard/overview?workspaceId=XXX`
4. ✅ `GET /v1/geo/dashboard/maturity?workspaceId=XXX`
5. ✅ `GET /v1/geo/dashboard/recommendations?workspaceId=XXX`
6. ✅ `GET /v1/geo/dashboard/engines/comparison?workspaceId=XXX`
7. ✅ `GET /v1/geo/dashboard/progress?workspaceId=XXX&days=30`
8. ✅ `GET /v1/geo/maturity/history?workspaceId=XXX&timeRange=30d`

---

## Ready to Start?

**Begin with STEP 1** and share your result after each step. I'll help you troubleshoot as we go!

**Copy this command to start:**
```bash
node --version
```













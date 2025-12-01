# 🚀 START HERE - Step-by-Step Testing Guide

Follow these steps **sequentially**. Share feedback after each step.

---

## ⚠️ FIRST: Fix Prerequisites

### STEP 1: Update Node.js

Your current Node.js version is v14.19.0, but you need v18.12+.

**Option A: Using nvm (Recommended)**
```bash
# Check if nvm is installed
nvm --version

# If nvm exists, install Node 20
nvm install 20
nvm use 20

# Verify
node --version
```
**Expected**: v20.x.x or at least v18.12.0

**Option B: Using Homebrew**
```bash
brew install node@20
```

**Option C: Download from nodejs.org**
Go to https://nodejs.org and download Node.js 20 LTS

**Share result**: ✅ Node version is now: `____` / ❌ Need help installing

---

### STEP 2: Start Docker

Docker daemon is not running.

**2.1 Start Docker Desktop**
- Open Docker Desktop application on your Mac
- Wait until it shows "Docker is running" (whale icon in menu bar)

**2.2 Verify Docker is running**
```bash
docker ps
```

**Expected**: Should show container list (may be empty, that's fine)

**Share result**: ✅ Docker is running / ❌ Docker won't start

---

## ✅ STEP 3: Check Environment Variables

### 3.1 Check .env file
```bash
cat .env | grep -E "DEBUG_JWT_MODE|DATABASE_URL|NODE_ENV"
```

### 3.2 If DEBUG_JWT_MODE is missing or false, add/update:
```bash
# Add this line to .env file
echo "DEBUG_JWT_MODE=true" >> .env
echo "NODE_ENV=development" >> .env
```

**Share result**: ✅ .env configured / ❌ Need to update

---

## 🗄️ STEP 4: Start Infrastructure

### 4.1 Start PostgreSQL and Redis
```bash
cd /Users/tusharmehrotra/ai-visibility-platform
docker compose -f infra/docker-compose.yml up -d
```

**4.2 Wait 5 seconds, then check:**
```bash
docker compose -f infra/docker-compose.yml ps
```

**Expected**: 
- `postgres` container status: "Up"
- `redis` container status: "Up"

**Share result**: ✅ Both containers running / ❌ Containers failed

---

## 📊 STEP 5: Run Database Migration (CRITICAL)

### 5.1 Navigate to db package
```bash
cd /Users/tusharmehrotra/ai-visibility-platform/packages/db
```

### 5.2 Create migration for EEATScore
```bash
pnpm prisma migrate dev --name add_eeat_score_model
```

**What happens**:
- It will detect the new `EEATScore` model
- Ask: "Do you want to create and apply it?" → Type **`Y`** and press Enter
- Creates migration file and applies to database

**Expected output**: "✔ Applied migration..."

**Share result**: ✅ Migration created and applied / ❌ Error (paste full error)

---

## 🆔 STEP 6: Get or Create Workspace ID

### 6.1 Open Prisma Studio
```bash
cd /Users/tusharmehrotra/ai-visibility-platform/packages/db
pnpm prisma studio
```

This opens browser at `http://localhost:5555`

### 6.2 Find Workspace ID
- Click on **"Workspace"** table
- Copy any `id` value (e.g., `clx123abc...`)

**OR if no workspaces exist**, create one:
1. Click "Add record"
2. Fill `name`: "Test Workspace"
3. Click "Save 1 change"
4. Copy the `id`

### 6.3 Verify WorkspaceProfile exists
- Click on **"WorkspaceProfile"** table
- Check if there's a profile with your workspace ID
- **If missing**: Create one:
  1. Click "Add record"
  2. Fill `workspaceId`: (paste your workspace ID)
  3. Fill `businessName`: "Test Business"
  4. Click "Save 1 change"

**Share result**: ✅ Workspace ID: `____` / ❌ Need help creating workspace

---

## 🚀 STEP 7: Start API Server

### 7.1 Navigate to project root
```bash
cd /Users/tusharmehrotra/ai-visibility-platform
```

### 7.2 Start API (in one terminal - keep it running)
```bash
pnpm --filter @apps/api dev
```

**What to expect**:
- Compiles TypeScript
- Shows: "🚀 AI Visibility API running on port 8080"
- Shows: "📚 Swagger docs available at http://localhost:8080/v1/docs"

**Keep this terminal open!**

**Share result**: ✅ API started on port `____` / ❌ Error (paste error)

---

## 🧪 STEP 8: Test First Endpoint (Health Check)

### 8.1 Open NEW terminal (keep API terminal running)

### 8.2 Test health
```bash
curl http://localhost:8080/healthz
```

**Expected**: `{"status":"ok","timestamp":"2025-01-27T..."}`

**Share result**: ✅ Health check: `____` / ❌ Failed

---

## 🎯 STEP 9: Test E-E-A-T Endpoint

### 9.1 Replace `YOUR_WORKSPACE_ID` with ID from Step 6
```bash
curl "http://localhost:8080/v1/geo/eeat?workspaceId=YOUR_WORKSPACE_ID"
```

**Example** (replace with your actual ID):
```bash
curl "http://localhost:8080/v1/geo/eeat?workspaceId=clx123abc456def"
```

**Expected responses**:

**✅ Success:**
```json
{
  "ok": true,
  "data": {
    "experience": 65,
    "expertise": 72,
    "authoritativeness": 58,
    "trustworthiness": 70,
    "overallScore": 66,
    "level": "high"
  }
}
```

**⚠️ No WorkspaceProfile:**
```json
{
  "ok": false,
  "data": null
}
```

**Share result**: 
- ✅ Got E-E-A-T scores: `____`
- ❌ Error: `____`
- ⚠️ Got `ok: false` - need WorkspaceProfile

---

## 🔍 STEP 10: Test Fact Consensus

### 10.1 Test consensus endpoint
```bash
curl "http://localhost:8080/v1/geo/evidence/consensus?workspaceId=YOUR_WORKSPACE_ID"
```

**Expected**: 
- If you have citations: Array of fact types with consensus scores
- If no citations: `{"ok":true,"data":[]}` (empty but working)

**Share result**: ✅ Response: `____` / ❌ Error

---

## 📊 STEP 11: Test Dashboard Overview

### 11.1 Test dashboard
```bash
curl "http://localhost:8080/v1/geo/dashboard/overview?workspaceId=YOUR_WORKSPACE_ID" | jq
```

**Note**: `jq` formats JSON nicely. If you don't have it, remove `| jq`.

**Expected**: Large JSON with:
- `maturityScore`
- `recommendations` array
- `engineComparison` array
- `progress` array

**Share result**: ✅ Got dashboard data / ❌ Error

---

## 🌐 STEP 12: Use Swagger UI (Best Way to Test)

### 12.1 Open browser
Go to: **http://localhost:8080/v1/docs**

### 12.2 Find new endpoints:
- Scroll to **"GEO E-E-A-T"** section
- Find `GET /v1/geo/eeat`
- Click "Try it out"
- Enter workspace ID
- Click "Execute"

Do the same for:
- `GET /v1/geo/evidence/consensus`
- `GET /v1/geo/dashboard/overview`
- Other dashboard endpoints

**Share result**: ✅ Swagger works, tested endpoints / ❌ Can't access

---

## 📝 Quick Commands Reference

Once everything works, test all endpoints:

```bash
# Set your workspace ID
export WS_ID="your-workspace-id-here"

# Test all endpoints
curl "http://localhost:8080/v1/geo/eeat?workspaceId=${WS_ID}"
curl "http://localhost:8080/v1/geo/evidence/consensus?workspaceId=${WS_ID}"
curl "http://localhost:8080/v1/geo/dashboard/overview?workspaceId=${WS_ID}"
curl "http://localhost:8080/v1/geo/dashboard/maturity?workspaceId=${WS_ID}"
curl "http://localhost:8080/v1/geo/dashboard/recommendations?workspaceId=${WS_ID}"
curl "http://localhost:8080/v1/geo/dashboard/engines/comparison?workspaceId=${WS_ID}"
curl "http://localhost:8080/v1/geo/dashboard/progress?workspaceId=${WS_ID}&days=30"
```

---

## 🎯 Ready?

**Start with STEP 1** (Update Node.js) and share your result!











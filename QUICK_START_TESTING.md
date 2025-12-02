# Quick Start - Testing GEO Features

## Step 1: Run Database Migration (REQUIRED)

The new `EEATScore` table needs to be created:

```bash
cd packages/db
pnpm prisma migrate dev --name add_eeat_score_model
```

Or if you prefer to push without migration history:

```bash
cd packages/db
pnpm prisma db push
```

## Step 2: Start Infrastructure

```bash
# Start PostgreSQL and Redis
docker compose -f infra/docker-compose.yml up -d
```

## Step 3: Start API Server

```bash
# From project root
pnpm --filter @apps/api dev
```

The API will start on `http://localhost:8080` (or check console output for actual port).

## Step 4: Enable Debug Mode (Optional but Recommended)

Add to your `.env` file:
```env
DEBUG_JWT_MODE=true
NODE_ENV=development
```

This allows testing without JWT tokens.

## Step 5: Get a Workspace ID

You need a workspace ID to test. Options:

### Option A: Check Existing Workspaces
```bash
# Using Prisma Studio (easiest)
cd packages/db
pnpm prisma studio
```

Then look for a workspace ID in the Workspace table.

### Option B: Query Database Directly
```bash
# If you have psql
psql $DATABASE_URL -c "SELECT id FROM \"Workspace\" LIMIT 1;"
```

### Option C: Create Test Workspace
You can create one via SQL:
```sql
INSERT INTO "Workspace" (id, name) 
VALUES ('test-ws-123', 'Test Workspace')
RETURNING id;
```

Also create a WorkspaceProfile:
```sql
INSERT INTO "WorkspaceProfile" (id, "workspaceId", "businessName", "verified")
VALUES ('test-profile-123', 'test-ws-123', 'Test Business', false)
RETURNING "workspaceId";
```

## Step 6: Test the Endpoints

### Using the Test Script

```bash
# Make script executable (if not already)
chmod +x test-geo-features.sh
chmod +x test-geo-features.js

# Run test script
./test-geo-features.sh YOUR_WORKSPACE_ID

# Or using Node.js version
node test-geo-features.js YOUR_WORKSPACE_ID
```

### Using Swagger UI (Easiest)

1. Open browser: `http://localhost:8080/v1/docs`
2. Click "Authorize" button
3. If `DEBUG_JWT_MODE=true`, you can skip authorization
4. Find endpoints under:
   - **GEO E-E-A-T** → `GET /v1/geo/eeat`
   - **GEO Evidence** → `GET /v1/geo/evidence/consensus`
   - **GEO Dashboard** → All dashboard endpoints

### Using cURL

```bash
# Set your workspace ID
export WORKSPACE_ID="your-workspace-id"

# Test E-E-A-T
curl "http://localhost:8080/v1/geo/eeat?workspaceId=${WORKSPACE_ID}"

# Test Fact Consensus
curl "http://localhost:8080/v1/geo/evidence/consensus?workspaceId=${WORKSPACE_ID}"

# Test Dashboard Overview
curl "http://localhost:8080/v1/geo/dashboard/overview?workspaceId=${WORKSPACE_ID}"
```

## Expected Responses

### E-E-A-T Response
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
    "breakdown": { ... }
  }
}
```

### Fact Consensus Response
```json
{
  "ok": true,
  "data": [
    {
      "factType": "address",
      "consensus": 85,
      "agreementCount": 17,
      "contradictionCount": 2,
      "independentSources": 5
    }
  ]
}
```

### Dashboard Overview Response
```json
{
  "ok": true,
  "data": {
    "maturityScore": { ... },
    "eeatScore": { ... },
    "recommendations": [ ... ],
    "engineComparison": [ ... ],
    "progress": [ ... ]
  }
}
```

## Troubleshooting

### "No workspace profile found"
Create a WorkspaceProfile:
```sql
INSERT INTO "WorkspaceProfile" (id, "workspaceId", "businessName")
VALUES ('test-profile-id', 'YOUR_WORKSPACE_ID', 'Test Business');
```

### "Table 'eeat_scores' doesn't exist"
Run the migration:
```bash
cd packages/db
pnpm prisma migrate dev
```

### "Cannot connect to API"
Check if API is running:
```bash
curl http://localhost:8080/healthz
```

### Empty responses
The endpoints will work but may return low/default scores if:
- No citations/mentions data exists
- No evidence has been collected
- Workspace is new

This is expected - the endpoints are working, they just need data!

## Next Steps

Once basic testing works:
1. Add real citation data to see fact extraction in action
2. Run some prompt runs to generate citations/mentions
3. Check progress tracking over multiple days
4. Verify cross-engine comparison with real engine data













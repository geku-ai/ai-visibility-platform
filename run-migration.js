/**
 * Quick migration script to add onboarding fields to workspaces table
 * Run with: node run-migration.js
 */

const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  console.error('💡 Get it from Railway dashboard: Database → Variables → DATABASE_URL');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const migrationSQL = `
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "onboardingStatus" TEXT NOT NULL DEFAULT 'not_started';
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "onboardingEntryType" TEXT;
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "primaryDomain" TEXT;
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "brandName" TEXT;
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "businessType" TEXT;
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "location" JSONB;
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "userRole" TEXT;
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "competitors" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "businessSize" TEXT;
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "goals" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "copilotPreferences" JSONB;
`;

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('🔄 Running migration...');
    await client.query(migrationSQL);
    console.log('✅ Migration completed successfully!');
    console.log('✅ Onboarding fields added to workspaces table');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();



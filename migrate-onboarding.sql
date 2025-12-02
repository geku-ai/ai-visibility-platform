-- Migration to add onboarding fields to workspaces table
-- Run this SQL directly in your database

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


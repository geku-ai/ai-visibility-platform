/**
 * Onboarding DTOs
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, IsArray, ValidateNested, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed';
export type OnboardingEntryType = 'instant_summary' | 'self_serve' | 'invited' | 'enterprise';
export type NextScreen = 'instant-summary' | 'onboarding' | 'dashboard';

export class LocationDto {
  @ApiPropertyOptional({ description: 'City name' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Country name' })
  @IsOptional()
  @IsString()
  country?: string;
}

export class CopilotPreferencesDto {
  @ApiPropertyOptional({ description: 'Enable weekly intelligence reports', default: false })
  @IsOptional()
  weeklyIntelligence?: boolean;

  @ApiPropertyOptional({ description: 'Enable page optimization', default: false })
  @IsOptional()
  pageOptimization?: boolean;

  @ApiPropertyOptional({ description: 'Enable review automation', default: false })
  @IsOptional()
  reviewAutomation?: boolean;
}

export class OnboardingDataDto {
  @ApiProperty({ description: 'Primary domain (e.g., example.com)' })
  @IsString()
  primaryDomain: string;

  @ApiProperty({ description: 'Brand/business name' })
  @IsString()
  brandName: string;

  @ApiProperty({ description: 'Business type', enum: ['travel', 'SaaS', 'ecommerce', 'local_services', 'healthcare', 'education', 'finance', 'real_estate', 'other'] })
  @IsEnum(['travel', 'SaaS', 'ecommerce', 'local_services', 'healthcare', 'education', 'finance', 'real_estate', 'other'])
  businessType: string;

  @ApiPropertyOptional({ description: 'Location information', type: LocationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;

  @ApiPropertyOptional({ description: 'User role', enum: ['owner', 'marketer', 'agency', 'enterprise_admin'] })
  @IsOptional()
  @IsEnum(['owner', 'marketer', 'agency', 'enterprise_admin'])
  userRole?: string;

  @ApiPropertyOptional({ description: 'Competitor domains', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  competitors?: string[];

  @ApiPropertyOptional({ description: 'Business size', enum: ['solo', '1-10', '11-50', '50+'] })
  @IsOptional()
  @IsEnum(['solo', '1-10', '11-50', '50+'])
  businessSize?: string;

  @ApiPropertyOptional({ description: 'Business goals', type: [String], enum: ['visibility', 'trust', 'design', 'content', 'citations', 'schema'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  goals?: string[];

  @ApiPropertyOptional({ description: 'Copilot preferences', type: CopilotPreferencesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CopilotPreferencesDto)
  copilotPreferences?: CopilotPreferencesDto;
}

export class OnboardingStateDto {
  @ApiProperty({ description: 'Workspace ID' })
  workspaceId: string;

  @ApiProperty({ description: 'Workspace tier', enum: ['free', 'insights', 'copilot', 'enterprise'] })
  tier: 'free' | 'insights' | 'copilot' | 'enterprise';

  @ApiProperty({ description: 'Onboarding status', enum: ['not_started', 'in_progress', 'completed'] })
  onboardingStatus: OnboardingStatus;

  @ApiPropertyOptional({ description: 'How the user entered onboarding', enum: ['instant_summary', 'self_serve', 'invited', 'enterprise'] })
  onboardingEntryType: OnboardingEntryType | null;

  @ApiProperty({ description: 'Suggested screen to show', enum: ['instant-summary', 'onboarding', 'dashboard'] })
  nextScreen: NextScreen;

  @ApiPropertyOptional({ description: 'Pending checklist items', type: [String] })
  pendingItems?: string[];

  @ApiPropertyOptional({ description: 'Onboarding data collected so far', type: OnboardingDataDto })
  onboardingData?: {
    primaryDomain?: string;
    brandName?: string;
    businessType?: string;
    location?: LocationDto;
    competitors?: string[];
    goals?: string[];
    businessSize?: string;
    userRole?: string;
    copilotPreferences?: CopilotPreferencesDto;
  };
}

export class CompleteOnboardingRequestDto {
  @ApiProperty({ description: 'Workspace ID' })
  @IsString()
  workspaceId: string;
}

export class StartOnboardingRequestDto {
  @ApiProperty({ description: 'Workspace ID' })
  @IsString()
  workspaceId: string;

  @ApiPropertyOptional({ description: 'Entry type (optional, ignored if provided)' })
  @IsOptional()
  @IsString()
  entryType?: string;

  @ApiPropertyOptional({ description: 'Demo run ID (optional, ignored if provided)' })
  @IsOptional()
  @IsString()
  demoRunId?: string;
}

export class SaveOnboardingDataRequestDto {
  @ApiProperty({ description: 'Workspace ID' })
  @IsString()
  workspaceId: string;

  @ApiProperty({ description: 'Onboarding data', type: OnboardingDataDto })
  @ValidateNested()
  @Type(() => OnboardingDataDto)
  data: OnboardingDataDto;
}



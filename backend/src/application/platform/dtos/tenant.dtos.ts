import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { TenantStatus } from '@application/tenants/domain/entities/tenant.props';

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

export class QueryTenantsDto {
  @ApiPropertyOptional({ description: 'Matches name, slug or contact email.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: TenantStatus })
  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

/**
 * Creating a tenant from the console also creates its first admin — a workspace
 * nobody can sign into is not a workspace, so the two are one operation.
 */
export class CreateTenantDto {
  @ApiProperty({ example: 'Acme Product Team' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: 'acme' })
  @IsOptional()
  @IsString()
  @Matches(SLUG, { message: 'slug may only contain lowercase letters, numbers and dashes' })
  @MaxLength(60)
  slug?: string;

  @ApiPropertyOptional({ example: 'billing@acme.co' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiProperty({ example: 'Alice', description: "The first admin's display name." })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  adminName: string;

  @ApiProperty({ example: 'alice@acme.co' })
  @IsEmail()
  adminEmail: string;

  @ApiProperty({ example: 'secret123', minLength: 6 })
  @IsString()
  @MinLength(6)
  adminPassword: string;

  @ApiPropertyOptional({ example: 'pro', description: 'Plan to put the new tenant on.' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  planCode?: string;
}

export class UpdateTenantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  slug?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactEmail?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

/**
 * One row of the tenants table. Flat by house style: the plan and usage numbers
 * a reader needs are on the row, not behind a nested object.
 */
export class TenantResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true, type: String })
  slug: string | null;

  @ApiProperty({ enum: TenantStatus })
  status: TenantStatus;

  @ApiProperty({ nullable: true, type: String })
  contactEmail: string | null;

  @ApiProperty({ nullable: true, type: String })
  notes: string | null;

  // ── Subscription, flattened ──
  @ApiProperty({ nullable: true, type: String })
  planCode: string | null;

  @ApiProperty({ nullable: true, type: String })
  planName: string | null;

  @ApiProperty({ nullable: true, type: String, description: 'trial | active | past_due | canceled' })
  subscriptionStatus: string | null;

  @ApiProperty({ nullable: true, type: String })
  billingCycle: string | null;

  @ApiProperty({ nullable: true, type: String })
  currentPeriodEnd: string | null;

  // ── Usage, flattened ──
  @ApiProperty()
  userCount: number;

  @ApiProperty()
  projectCount: number;

  @ApiProperty()
  issueCount: number;

  @ApiProperty()
  docCount: number;

  @ApiProperty()
  teamCount: number;

  @ApiProperty()
  roadmapCount: number;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}

export class TenantListResponseDto {
  @ApiProperty({ type: [TenantResponseDto] })
  data: TenantResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}

/** One metered feature for a tenant: what they're allowed and what they've used. */
export class TenantUsageLineDto {
  @ApiProperty()
  key: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true, type: String })
  unit: string | null;

  @ApiProperty()
  used: number;

  @ApiProperty({ description: '-1 means unlimited.' })
  limit: number;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Percent of limit used; null when unlimited.',
  })
  percent: number | null;

  @ApiProperty({ description: 'True once usage is at or past the limit.' })
  overLimit: boolean;
}

/** The tenant detail panel: identity, plan, entitlements and live usage. */
export class TenantDetailResponseDto extends TenantResponseDto {
  @ApiProperty({ type: [TenantUsageLineDto] })
  usage: TenantUsageLineDto[];

  @ApiProperty({
    description: 'Every effective entitlement (plan chain + subscription overrides).',
  })
  entitlements: Record<string, { enabled?: boolean; limit?: number }>;

  @ApiProperty({ type: [String], description: 'Admin emails inside this workspace.' })
  adminEmails: string[];
}

export class PlatformOverviewDto {
  @ApiProperty()
  tenantCount: number;

  @ApiProperty()
  activeTenantCount: number;

  @ApiProperty()
  suspendedTenantCount: number;

  @ApiProperty()
  userCount: number;

  @ApiProperty()
  subscribedTenantCount: number;

  @ApiProperty()
  trialTenantCount: number;

  @ApiProperty()
  pastDueTenantCount: number;

  @ApiProperty({ description: 'Tenants with no subscription row at all.' })
  unassignedTenantCount: number;

  @ApiProperty({ description: 'Sum of monthly-equivalent price across active subscriptions.' })
  mrr: number;

  @ApiProperty()
  currency: string;

  @ApiProperty({ description: 'Tenants at or over any metered limit.' })
  overLimitTenantCount: number;
}

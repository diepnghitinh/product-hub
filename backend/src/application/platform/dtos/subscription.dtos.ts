import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { FeatureMap } from '../domain/features';
import { BillingCycle, SubscriptionStatus } from '../domain/entities/subscription.props';

/**
 * Assigning a plan is an upsert, not a create: a tenant has exactly one
 * subscription, so "put this tenant on Pro" is the same call whether or not they
 * were already on something.
 */
export class UpsertSubscriptionDto {
  @ApiProperty({ example: 'pro' })
  @IsString()
  @MaxLength(60)
  planCode: string;

  @ApiPropertyOptional({ enum: SubscriptionStatus, default: SubscriptionStatus.ACTIVE })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @ApiPropertyOptional({ enum: BillingCycle, default: BillingCycle.MONTHLY })
  @IsOptional()
  @IsEnum(BillingCycle)
  billingCycle?: BillingCycle;

  @ApiPropertyOptional({ example: '2026-12-31T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  currentPeriodEnd?: string | null;

  @ApiPropertyOptional({ example: '2026-12-31T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  cancelAt?: string | null;

  @ApiPropertyOptional({
    description: 'Per-tenant deviations layered on top of the plan.',
    example: { users: { limit: 75 } },
  })
  @IsOptional()
  @IsObject()
  featureOverrides?: FeatureMap;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

/** A subscription row, flattened with the tenant and plan names a table needs. */
export class SubscriptionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  tenantName: string;

  @ApiProperty({ nullable: true, type: String })
  tenantSlug: string | null;

  @ApiProperty({ description: 'active | suspended' })
  tenantStatus: string;

  @ApiProperty()
  planCode: string;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Null when the plan behind this subscription no longer exists.',
  })
  planName: string | null;

  @ApiProperty()
  priceMonthly: number;

  @ApiProperty()
  priceYearly: number;

  @ApiProperty()
  currency: string;

  @ApiProperty({ enum: SubscriptionStatus })
  status: SubscriptionStatus;

  @ApiProperty({ enum: BillingCycle })
  billingCycle: BillingCycle;

  @ApiProperty({ description: 'Price for the chosen cycle, normalised to a month.' })
  monthlyEquivalent: number;

  @ApiProperty({ nullable: true, type: String })
  currentPeriodEnd: string | null;

  @ApiProperty({ nullable: true, type: String })
  cancelAt: string | null;

  @ApiProperty()
  featureOverrides: FeatureMap;

  @ApiProperty({ nullable: true, type: String })
  notes: string | null;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}

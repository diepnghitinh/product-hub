import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { FeatureMap } from '../domain/features';

const CODE = /^[a-z0-9][a-z0-9-]*$/;

export class CreatePlanDto {
  @ApiProperty({ example: 'pro', description: 'Stable identifier; cannot be changed later.' })
  @IsString()
  @Matches(CODE, { message: 'code may only contain lowercase letters, numbers and dashes' })
  @MaxLength(60)
  code: string;

  @ApiProperty({ example: 'Pro' })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: 'For growing product teams' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: 49 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceMonthly?: number;

  @ApiPropertyOptional({ example: 490 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceYearly?: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({
    description: "This plan's own grants, keyed by feature code. Sparse — unset keys inherit.",
    example: { users: { limit: 25 }, audit_log: { enabled: true } },
  })
  @IsOptional()
  @IsObject()
  features?: FeatureMap;

  @ApiPropertyOptional({ example: 'free', description: 'Base plan this one builds on.' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  extendsCode?: string | null;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdatePlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceMonthly?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceYearly?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  features?: FeatureMap;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  extendsCode?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

/** A plan as the console reads it — own grants *and* the resolved inherited set. */
export class PlanResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  code: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true, type: String })
  description: string | null;

  @ApiProperty()
  priceMonthly: number;

  @ApiProperty()
  priceYearly: number;

  @ApiProperty()
  currency: string;

  @ApiProperty({ description: "This plan's own grants only." })
  features: FeatureMap;

  @ApiProperty({ nullable: true, type: String })
  extendsCode: string | null;

  @ApiProperty({ description: 'Own grants merged over the whole inheritance chain.' })
  effectiveFeatures: FeatureMap;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  sortOrder: number;

  /** How many tenants sit on this plan — the console shows it before a delete. */
  @ApiProperty()
  subscriberCount: number;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}

/** The feature catalog, so the console can render an editor without hardcoding it. */
export class FeatureCatalogItemDto {
  @ApiProperty()
  key: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: ['flag', 'metered'] })
  type: 'flag' | 'metered';

  @ApiProperty({ nullable: true, type: String })
  unit: string | null;

  @ApiProperty({ enum: ['limits', 'capabilities'] })
  group: 'limits' | 'capabilities';

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Set when this feature meters something the platform can count.',
  })
  resourceKey: string | null;
}

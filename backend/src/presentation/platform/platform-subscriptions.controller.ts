import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { EntityNotFoundException, ValidationException } from '@core/exceptions';
import {
  SubscriptionResponseDto,
  UpsertSubscriptionDto,
} from '@application/platform/dtos/subscription.dtos';
import { PlatformAuth } from '@application/platform/services/platform-auth.guard';
import {
  CancelSubscriptionUseCase,
  GetTenantSubscriptionUseCase,
  ListSubscriptionsUseCase,
  RemoveSubscriptionUseCase,
  UpsertSubscriptionUseCase,
} from '@application/platform/use-cases/subscription.use-cases';

@ApiTags('Platform · Subscriptions')
@PlatformAuth()
@Controller('subscriptions')
export class PlatformSubscriptionsController {
  constructor(
    private readonly listUseCase: ListSubscriptionsUseCase,
    private readonly getUseCase: GetTenantSubscriptionUseCase,
    private readonly upsertUseCase: UpsertSubscriptionUseCase,
    private readonly cancelUseCase: CancelSubscriptionUseCase,
    private readonly removeUseCase: RemoveSubscriptionUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Every tenant subscription' })
  async list(): Promise<SubscriptionResponseDto[]> {
    const result = await this.listUseCase.execute();
    return result.getValue();
  }

  /**
   * Keyed by tenant, not by subscription id: a tenant has exactly one, so the
   * tenant is the address the console always has to hand.
   */
  @Get(':tenantId')
  @ApiOperation({ summary: "A tenant's subscription (null when they have none)" })
  async get(
    @Param('tenantId') tenantId: string,
  ): Promise<SubscriptionResponseDto | null> {
    const result = await this.getUseCase.execute({ tenantId });
    return result.getValue();
  }

  @Put(':tenantId')
  @ApiOperation({ summary: 'Put a tenant on a plan (create or change)' })
  async upsert(
    @Param('tenantId') tenantId: string,
    @Body() dto: UpsertSubscriptionDto,
  ): Promise<SubscriptionResponseDto> {
    const result = await this.upsertUseCase.execute({ tenantId, dto });
    if (result.isFailure) throw new ValidationException(result.error as string);
    return result.getValue();
  }

  @Post(':tenantId/cancel')
  @ApiOperation({ summary: 'Cancel a subscription, keeping the record' })
  async cancel(
    @Param('tenantId') tenantId: string,
  ): Promise<SubscriptionResponseDto> {
    const result = await this.cancelUseCase.execute({ tenantId });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return result.getValue();
  }

  @Delete(':tenantId')
  @ApiOperation({ summary: 'Take a tenant off plans entirely' })
  async remove(@Param('tenantId') tenantId: string): Promise<{ success: boolean }> {
    await this.removeUseCase.execute({ tenantId });
    return { success: true };
  }
}

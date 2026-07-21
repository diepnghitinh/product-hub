import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '@core/decorators';
import { JwtPayload } from '@core/interfaces';
import { EntityNotFoundException } from '@core/exceptions';
import {
  CreateIssueLinkUseCase,
  DeleteIssueLinkUseCase,
  GetIssueLinksUseCase,
} from '@application/issue-links/use-cases';
import { CreateIssueLinkDto } from '@application/issue-links/dtos/create-issue-link.dto';
import { GetIssueLinksQueryDto } from '@application/issue-links/dtos/get-issue-links.query.dto';
import { IssueLinkResponseDto } from '@application/issue-links/dtos/issue-link.response.dto';

@ApiTags('Issue links')
@ApiBearerAuth('JWT-auth')
@Controller('issue-links')
export class IssueLinksController {
  constructor(
    private readonly getLinks: GetIssueLinksUseCase,
    private readonly createLink: CreateIssueLinkUseCase,
    private readonly deleteLink: DeleteIssueLinkUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: "An issue's relationships, resolved to the linked issue" })
  async list(
    @AuthUser() auth: JwtPayload,
    @Query() query: GetIssueLinksQueryDto,
  ): Promise<IssueLinkResponseDto[]> {
    const result = await this.getLinks.execute({
      tenantId: auth.tenantId,
      issueType: query.issueType,
      issueId: query.issueId,
    });
    return result.getValue();
  }

  @Post()
  @ApiOperation({ summary: "Link two same-type issues; returns the source issue's relations" })
  async create(
    @AuthUser() auth: JwtPayload,
    @Body() dto: CreateIssueLinkDto,
  ): Promise<IssueLinkResponseDto[]> {
    const result = await this.createLink.execute({
      tenantId: auth.tenantId,
      createdBy: auth.userId,
      issueType: dto.issueType,
      sourceId: dto.sourceId,
      targetId: dto.targetId,
      relationType: dto.relationType,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    const list = await this.getLinks.execute({
      tenantId: auth.tenantId,
      issueType: dto.issueType,
      issueId: dto.sourceId,
    });
    return list.getValue();
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a relationship' })
  async remove(@AuthUser() auth: JwtPayload, @Param('id') id: string): Promise<void> {
    const result = await this.deleteLink.execute({ tenantId: auth.tenantId, id });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
  }
}

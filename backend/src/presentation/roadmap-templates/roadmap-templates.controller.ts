import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, Roles } from '@core/decorators';
import { JwtPayload, Role } from '@core/interfaces';
import { EntityNotFoundException } from '@core/exceptions';
import {
  GetRoadmapTemplatesUseCase,
  ReplaceRoadmapTemplatesUseCase,
} from '@application/roadmaps/use-cases/roadmap-template.use-cases';
import { ReplaceRoadmapTemplatesDto } from '@application/roadmaps/dtos/roadmap.dtos';
import { RoadmapColumnTemplateDto } from '@application/roadmaps/dtos/roadmap.response.dto';

/**
 * Workspace-wide roadmap column templates.
 *
 * Its own path rather than a route under `/roadmaps`, for two reasons: `GET
 * /roadmaps/templates` would sit next to `GET /roadmaps/:id` and depend on
 * declaration order not to be read as a roadmap called "templates", and these
 * are workspace config, not a roadmap.
 *
 * Not under `/settings` either, even though that's where they're stored: that
 * whole controller is admin-only because its response carries credentials, and
 * every board — read by anyone — needs the template list to say which one it's
 * on.
 */
@ApiTags('Roadmaps')
@ApiBearerAuth('JWT-auth')
@Controller('roadmap-templates')
export class RoadmapTemplatesController {
  constructor(
    private readonly getTemplates: GetRoadmapTemplatesUseCase,
    private readonly replaceTemplates: ReplaceRoadmapTemplatesUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List the workspace roadmap column templates' })
  async list(@AuthUser() auth: JwtPayload): Promise<RoadmapColumnTemplateDto[]> {
    const result = await this.getTemplates.execute({ tenantId: auth.tenantId });
    return result.getValue();
  }

  // Same gate as a roadmap's own columns (`PUT /roadmaps/:id/columns`): how a
  // board is organised is a product decision. Wider than it looks — this one
  // moves every roadmap linked to the template at once.
  @Put()
  @Roles(Role.ADMIN, Role.PRODUCT)
  @ApiOperation({ summary: 'Replace the workspace roadmap column templates' })
  async replace(
    @AuthUser() auth: JwtPayload,
    @Body() dto: ReplaceRoadmapTemplatesDto,
  ): Promise<RoadmapColumnTemplateDto[]> {
    const result = await this.replaceTemplates.execute({ tenantId: auth.tenantId, dto });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return result.getValue();
  }
}

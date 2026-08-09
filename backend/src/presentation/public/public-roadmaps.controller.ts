import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@core/decorators';
import { EntityNotFoundException } from '@core/exceptions';
import { GetPublicRoadmapUseCase } from '@application/roadmaps/use-cases/roadmap.use-cases';
import { GetRoadmapTemplatesUseCase } from '@application/roadmaps/use-cases/roadmap-template.use-cases';
import { RoadmapMapper } from '@application/roadmaps/mappers';
import { RoadmapResponseDto } from '@application/roadmaps/dtos/roadmap.response.dto';

interface PublicRoadmapView {
  roadmap: RoadmapResponseDto;
}

/** Public read-only roadmap view (no auth) resolved from a share token. Items +
 * columns are embedded in the roadmap, so the board renders from one payload. */
@ApiTags('Public API')
@Public()
@Controller('public/roadmaps')
export class PublicRoadmapsController {
  constructor(
    private readonly getPublic: GetPublicRoadmapUseCase,
    private readonly getTemplates: GetRoadmapTemplatesUseCase,
  ) {}

  @Get(':token')
  @ApiOperation({ summary: 'Read-only roadmap by share token' })
  async view(@Param('token') token: string): Promise<PublicRoadmapView> {
    const result = await this.getPublic.execute({ token });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    const roadmap = result.getValue();
    // The tenant comes off the roadmap the token resolved to, not from a caller
    // who has no session — a shared board on a template must show the template's
    // columns, or the public page would render the dormant custom set instead.
    const templates = await this.getTemplates.execute({ tenantId: roadmap.tenantId });
    // The public variant — item attachments never leave the workspace.
    return { roadmap: RoadmapMapper.toPublicResponseDto(roadmap, templates.getValue()) };
  }
}

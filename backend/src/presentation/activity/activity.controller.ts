import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, Roles } from '@core/decorators';
import { JwtPayload, Role } from '@core/interfaces';
import { EntityNotFoundException } from '@core/exceptions';
import { GetCommentsUseCase, CreateCommentUseCase } from '@application/activity/use-cases';
import { CreateCommentDto } from '@application/activity/dtos/create-comment.dto';
import { CommentResponseDto } from '@application/activity/dtos/comment.response.dto';
import { CommentMapper } from '@application/activity/mappers';

@ApiTags('Activity')
@ApiBearerAuth('JWT-auth')
@Controller('bugs/:bugId/comments')
export class ActivityController {
  constructor(
    private readonly getComments: GetCommentsUseCase,
    private readonly createComment: CreateCommentUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List a bug’s activity (comments)' })
  async list(
    @AuthUser() auth: JwtPayload,
    @Param('bugId') bugId: string,
  ): Promise<CommentResponseDto[]> {
    const result = await this.getComments.execute({ tenantId: auth.tenantId, bugId });
    return CommentMapper.toResponseDtoArray(result.getValue());
  }

  @Post()
  @Roles(Role.ADMIN, Role.TESTER)
  @ApiOperation({ summary: 'Add a comment (mentions notify the inbox)' })
  async create(
    @AuthUser() auth: JwtPayload,
    @Param('bugId') bugId: string,
    @Body() dto: CreateCommentDto,
  ): Promise<CommentResponseDto> {
    const result = await this.createComment.execute({
      tenantId: auth.tenantId,
      bugId,
      authorId: auth.userId,
      authorName: auth.name,
      dto,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return CommentMapper.toResponseDto(result.getValue());
  }
}

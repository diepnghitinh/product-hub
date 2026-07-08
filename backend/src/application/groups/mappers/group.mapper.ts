import { GroupEntity } from '../domain/entities/group.entity';
import { GroupResponseDto } from '../dtos/group.response.dto';

export class GroupMapper {
  static toResponseDto(group: GroupEntity): GroupResponseDto {
    return {
      id: group.id.toString(),
      tenantId: group.tenantId,
      projectId: group.projectId,
      slug: group.slug,
      title: group.title,
      order: group.order,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }

  static toResponseDtoArray(groups: GroupEntity[]): GroupResponseDto[] {
    return groups.map((g) => this.toResponseDto(g));
  }
}

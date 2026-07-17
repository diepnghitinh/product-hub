import { TeamEntity } from '../domain/entities/team.entity';
import { TeamResponseDto } from '../dtos/team.dtos';

export class TeamMapper {
  static toResponseDto(team: TeamEntity): TeamResponseDto {
    return {
      id: team.id.toString(),
      tenantId: team.tenantId,
      key: team.key,
      name: team.name,
      issueType: team.issueType,
      icon: team.icon,
      statuses: team.statuses,
      archived: team.archived,
      isDefault: team.isDefault,
      order: team.order,
      createdAt: team.createdAt,
      updatedAt: team.updatedAt,
    };
  }

  static toResponseDtoArray(teams: TeamEntity[]): TeamResponseDto[] {
    return teams.map((t) => this.toResponseDto(t));
  }
}

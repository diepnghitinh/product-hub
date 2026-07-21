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
      color: team.color,
      statuses: team.statuses,
      labels: team.labels,
      customFields: team.customFields,
      archived: team.archived,
      isDefault: team.isDefault,
      order: team.order,
      publicEnabled: team.publicEnabled,
      publicToken: team.publicToken,
      createdAt: team.createdAt,
      updatedAt: team.updatedAt,
    };
  }

  static toResponseDtoArray(teams: TeamEntity[]): TeamResponseDto[] {
    return teams.map((t) => this.toResponseDto(t));
  }
}

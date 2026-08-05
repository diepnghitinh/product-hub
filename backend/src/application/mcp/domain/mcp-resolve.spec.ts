import { TeamIssueType } from '@application/teams/domain/enums/team.enums';
import { anyTeamChoices, resolveTeamAnyKind } from './mcp-resolve';

const team = (id: string, name: string, issueType: TeamIssueType, archived = false) =>
  ({ id: { toString: () => id }, name, key: name.toLowerCase(), issueType, archived }) as never;

describe('resolveTeamAnyKind', () => {
  const teams = [
    team('t1', 'Engineering', TeamIssueType.TASK),
    team('t2', 'QC', TeamIssueType.BUG),
    team('t3', 'Old', TeamIssueType.TASK, true),
  ];

  it('tìm được team task', () => {
    expect(resolveTeamAnyKind(teams, 'Engineering')?.name).toBe('Engineering');
  });

  it('tìm được team bug — không cần biết trước loại', () => {
    expect(resolveTeamAnyKind(teams, 'QC')?.name).toBe('QC');
  });

  it('không khớp thì trả null, không rơi về team mặc định', () => {
    expect(resolveTeamAnyKind(teams, 'Marketing')).toBeNull();
  });

  it('ref rỗng trả null — không đoán team mặc định', () => {
    expect(resolveTeamAnyKind(teams, '')).toBeNull();
  });

  it('bỏ qua team đã lưu trữ', () => {
    expect(anyTeamChoices(teams)).toEqual(['Engineering', 'QC']);
  });
});

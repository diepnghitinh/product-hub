import { UniqueEntityID } from '@core/domain';
import { ReactionTargetType } from '../reaction-target-type.enum';

export interface ReactionProps {
  id: UniqueEntityID;
  tenantId: string;
  targetType: ReactionTargetType;
  targetId: string;
  emoji: string;
  userId: string;
  userName: string;
  createdAt: Date;
}

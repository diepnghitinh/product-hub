import { ApiProperty } from '@nestjs/swagger';
import { InboxKind } from '../domain/inbox-kind.enum';

export class InboxItemDto {
  @ApiProperty({ enum: InboxKind })
  kind: InboxKind;

  @ApiProperty({ description: 'Source id (comment id or bug id)' })
  id: string;

  @ApiProperty({ description: 'Bug id to navigate to' })
  refId: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  actorName: string;

  @ApiProperty()
  seen: boolean;

  @ApiProperty()
  createdAt: Date;
}

/** Flat inbox envelope. */
export class InboxResponseDto {
  @ApiProperty({ type: [InboxItemDto] })
  items: InboxItemDto[];

  @ApiProperty()
  unseenCount: number;

  @ApiProperty({ nullable: true })
  seenAt: Date | null;
}

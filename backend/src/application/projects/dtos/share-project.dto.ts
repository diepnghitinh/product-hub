import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ShareProjectDto {
  @ApiProperty({ description: 'Enable or disable the public read-only link' })
  @IsBoolean()
  enabled: boolean;
}

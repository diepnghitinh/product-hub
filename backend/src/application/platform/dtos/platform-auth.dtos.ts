import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class PlatformLoginDto {
  @ApiProperty({ example: 'ops@product-hub.io' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'secret123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;
}

export class PlatformAdminResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ nullable: true, type: String })
  lastLoginAt: string | null;

  @ApiProperty()
  createdAt: string;
}

export class PlatformAuthResponseDto {
  @ApiProperty()
  token: string;

  @ApiProperty({ type: PlatformAdminResponseDto })
  admin: PlatformAdminResponseDto;
}

export class ChangePlatformPasswordDto {
  @ApiProperty({ example: 'current-secret' })
  @IsString()
  currentPassword: string;

  @ApiProperty({ example: 'new-secret-123', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;
}

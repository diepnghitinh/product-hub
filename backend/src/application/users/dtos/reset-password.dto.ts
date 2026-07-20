import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/**
 * Admin sets another user's password directly. There is no `currentPassword`
 * (the admin doesn't know it) — the ADMIN role guard on the route is the
 * authorization. Mirrors `ChangePasswordDto`'s `newPassword` rule.
 */
export class ResetPasswordDto {
  @ApiProperty({ minLength: 6 })
  @IsString()
  @MinLength(6)
  newPassword: string;
}

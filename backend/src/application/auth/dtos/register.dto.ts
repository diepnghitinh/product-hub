import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

/** Self-service signup: creates a new tenant/workspace + its first admin user. */
export class RegisterDto {
  @ApiProperty({ example: 'Acme Product Team' })
  @IsString()
  @MinLength(1)
  tenantName: string;

  @ApiProperty({ example: 'Aaron' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ example: 'aaron@acme.co' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'secret123', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;
}

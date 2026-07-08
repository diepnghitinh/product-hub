import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from '@core/interfaces';

export class CreateUserDto {
  @ApiProperty({ example: 'Jane Tester' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ example: 'jane@acme.co' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'secret123', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({ enum: Role, default: Role.TESTER })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

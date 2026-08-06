import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { GitProvider } from '@application/app-settings/domain/integration.types';

/**
 * Add or edit a connected repo.
 *
 * Note what a client *cannot* send: the URL token and the signing secret. Those
 * are minted server-side, because they are the only thing authenticating an
 * anonymous inbound delivery — see `SaveIntegrationUseCase`.
 */
export class SaveIntegrationDto {
  @ApiProperty({ required: false, description: 'Omit to add; send to edit an existing one.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @ApiProperty({ enum: GitProvider, example: GitProvider.GITHUB })
  @IsEnum(GitProvider)
  provider: GitProvider;

  @ApiProperty({ example: 'acme/web', description: 'What you call the repo. Display only.' })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

/**
 * One connected repo as the settings page sees it.
 *
 * `secret` is included — deliberately, and only here. It has to be pasted into
 * the repo's webhook settings, so unlike a storage credential it is useless if
 * the admin can't read it back. The route is admin-only, and `secretPreview`
 * exists so the UI can show something without painting it on screen by default.
 */
export class IntegrationResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: GitProvider })
  provider: GitProvider;

  @ApiProperty()
  name: string;

  @ApiProperty({ description: 'The full URL to paste into the repo’s webhook settings.' })
  webhookUrl: string;

  @ApiProperty({ description: 'Shared secret to paste alongside it.' })
  secret: string;

  @ApiProperty()
  enabled: boolean;

  @ApiProperty()
  createdAt: string;

  @ApiProperty({ description: '"" until the first delivery lands.' })
  lastEventAt: string;

  @ApiProperty({ example: 'main · passed · 2 issues updated' })
  lastEventSummary: string;
}

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IApiKeyRepository } from '@application/api-keys/repositories/api-key.repository';
import { ApiKeySchema } from './entities/api-key.schema';
import { ApiKeyRepository } from './repositories/api-key.repository';

@Module({
  imports: [MongooseModule.forFeature([{ name: 'ApiKey', schema: ApiKeySchema }])],
  providers: [{ provide: IApiKeyRepository, useClass: ApiKeyRepository }],
  exports: [IApiKeyRepository],
})
export class InfrastructureApiKeysModule {}

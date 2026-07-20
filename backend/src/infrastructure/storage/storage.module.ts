import { Module } from '@nestjs/common';
import { IStorageService } from '@application/storage/storage.port';
import { StorageService } from './storage.service';

@Module({
  providers: [{ provide: IStorageService, useClass: StorageService }],
  exports: [IStorageService],
})
export class InfrastructureStorageModule {}

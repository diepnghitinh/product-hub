import { Module } from '@nestjs/common';
import { ApplicationStorageModule } from '@application/storage/storage.module';
import { UploadsController } from './uploads.controller';

@Module({
  imports: [ApplicationStorageModule],
  controllers: [UploadsController],
})
export class StoragePresentationModule {}

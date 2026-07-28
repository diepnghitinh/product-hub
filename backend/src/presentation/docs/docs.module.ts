import { Module } from '@nestjs/common';
import { ApplicationDocsModule } from '@application/docs/docs.module';
import { DocsController } from './docs.controller';

@Module({
  imports: [ApplicationDocsModule],
  controllers: [DocsController],
})
export class DocsPresentationModule {}

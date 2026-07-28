import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IDocRepository } from '@application/docs/repositories/doc.repository';
import { IDocPageRepository } from '@application/docs/repositories/doc-page.repository';
import { IDocPageVersionRepository } from '@application/docs/repositories/doc-page-version.repository';
import { DocSchema } from './entities/doc.schema';
import { DocPageSchema } from './entities/doc-page.schema';
import { DocPageVersionSchema } from './entities/doc-page-version.schema';
import { DocRepository } from './repositories/doc.repository';
import { DocPageRepository } from './repositories/doc-page.repository';
import { DocPageVersionRepository } from './repositories/doc-page-version.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Doc', schema: DocSchema },
      { name: 'DocPage', schema: DocPageSchema },
      { name: 'DocPageVersion', schema: DocPageVersionSchema },
    ]),
  ],
  providers: [
    { provide: IDocRepository, useClass: DocRepository },
    { provide: IDocPageRepository, useClass: DocPageRepository },
    { provide: IDocPageVersionRepository, useClass: DocPageVersionRepository },
  ],
  exports: [IDocRepository, IDocPageRepository, IDocPageVersionRepository],
})
export class InfrastructureDocsModule {}

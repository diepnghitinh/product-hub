import { Module } from '@nestjs/common';
import { InfrastructureDocsModule } from '@infrastructure/docs/docs.module';
import {
  CreateDocUseCase,
  GetDocsUseCase,
  GetDocUseCase,
  UpdateDocUseCase,
  DeleteDocUseCase,
  SetDocSharingUseCase,
  GetPublicDocUseCase,
} from './use-cases/doc.use-cases';
import {
  CreateDocPageUseCase,
  GetDocPageUseCase,
  UpdateDocPageUseCase,
  DeleteDocPageUseCase,
  ReorderDocPagesUseCase,
  GetLinkedDocPagesUseCase,
} from './use-cases/doc-page.use-cases';
import {
  SaveDocPageVersionUseCase,
  GetDocPageVersionsUseCase,
  GetDocPageVersionUseCase,
  RestoreDocPageVersionUseCase,
} from './use-cases/doc-page-version.use-cases';

const useCases = [
  CreateDocUseCase,
  GetDocsUseCase,
  GetDocUseCase,
  UpdateDocUseCase,
  DeleteDocUseCase,
  SetDocSharingUseCase,
  GetPublicDocUseCase,
  CreateDocPageUseCase,
  GetDocPageUseCase,
  UpdateDocPageUseCase,
  DeleteDocPageUseCase,
  ReorderDocPagesUseCase,
  GetLinkedDocPagesUseCase,
  SaveDocPageVersionUseCase,
  GetDocPageVersionsUseCase,
  GetDocPageVersionUseCase,
  RestoreDocPageVersionUseCase,
];

@Module({
  imports: [InfrastructureDocsModule],
  providers: [...useCases],
  exports: [...useCases],
})
export class ApplicationDocsModule {}

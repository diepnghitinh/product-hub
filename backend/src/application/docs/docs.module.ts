import { Module } from '@nestjs/common';
import { InfrastructureDocsModule } from '@infrastructure/docs/docs.module';
// Deleting a doc / page takes its comment threads with it.
import { InfrastructureActivityModule } from '@infrastructure/activity/activity.module';
import {
  CreateDocUseCase,
  DuplicateDocUseCase,
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
import { ExportDocPagePdfUseCase } from './use-cases/doc-page-pdf.use-case';

const useCases = [
  CreateDocUseCase,
  DuplicateDocUseCase,
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
  ExportDocPagePdfUseCase,
];

@Module({
  imports: [InfrastructureDocsModule, InfrastructureActivityModule],
  providers: [...useCases],
  exports: [...useCases],
})
export class ApplicationDocsModule {}

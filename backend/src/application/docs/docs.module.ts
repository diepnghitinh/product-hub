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
  SetDocPrivacyUseCase,
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
import { DocAccess } from './services/doc-access';
import { DocReadableGuard } from './services/doc-readable.guard';

const useCases = [
  CreateDocUseCase,
  DuplicateDocUseCase,
  GetDocsUseCase,
  GetDocUseCase,
  UpdateDocUseCase,
  DeleteDocUseCase,
  SetDocSharingUseCase,
  SetDocPrivacyUseCase,
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
  // `DocAccess` and its guard are exported too: the comments controller sits in
  // the activity slice but hangs off `docs/:docId`, so it has to ask the same
  // question about who may read the doc underneath.
  providers: [...useCases, DocAccess, DocReadableGuard],
  exports: [...useCases, DocAccess, DocReadableGuard],
})
export class ApplicationDocsModule {}

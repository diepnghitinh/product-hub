import { Global, Module } from '@nestjs/common';
import { PasswordService } from './services/password.service';

/** Cross-cutting stateless services shared by every feature. */
@Global()
@Module({
  providers: [PasswordService],
  exports: [PasswordService],
})
export class SharedModule {}

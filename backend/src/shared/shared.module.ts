import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PasswordService } from './services/password.service';
import { CounterService, CounterSchema } from './services/counter.service';

/** Cross-cutting stateless services shared by every feature. */
@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: 'Counter', schema: CounterSchema }])],
  providers: [PasswordService, CounterService],
  exports: [PasswordService, CounterService],
})
export class SharedModule {}

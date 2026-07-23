import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ICycleRepository } from '@application/cycles/repositories/cycle.repository';
import { CycleSchema } from './entities/cycle.schema';
import { CycleRepository } from './repositories/cycle.repository';

@Module({
  imports: [MongooseModule.forFeature([{ name: 'Cycle', schema: CycleSchema }])],
  providers: [{ provide: ICycleRepository, useClass: CycleRepository }],
  exports: [ICycleRepository],
})
export class InfrastructureCyclesModule {}

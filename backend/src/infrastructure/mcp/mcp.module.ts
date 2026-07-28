import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IMcpEventRepository } from '@application/mcp/repositories/mcp-event.repository';
import { McpEventSchema } from './entities/mcp-event.schema';
import { McpEventRepository } from './repositories/mcp-event.repository';

@Module({
  imports: [MongooseModule.forFeature([{ name: 'McpEvent', schema: McpEventSchema }])],
  providers: [{ provide: IMcpEventRepository, useClass: McpEventRepository }],
  exports: [IMcpEventRepository],
})
export class InfrastructureMcpModule {}

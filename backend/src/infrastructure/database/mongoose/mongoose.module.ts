import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

/**
 * Root database connection. Global so any feature's `MongooseModule.forFeature`
 * resolves the same connection.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>(
          'MONGODB_URI',
          'mongodb://producthub:producthub@localhost:27017/producthub?authSource=admin',
        ),
      }),
      inject: [ConfigService],
    }),
  ],
})
export class MongooseInfrastructureModule {}

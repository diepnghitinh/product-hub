import { Module } from '@nestjs/common';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { InfrastructureUsersModule } from '@infrastructure/users/users.module';
import { InfrastructureTenantsModule } from '@infrastructure/tenants/tenants.module';
import { ApplicationTeamsModule } from '@application/teams/teams.module';
import { jwtConstants } from './constants';
import { JwtStrategy } from './services/jwt.strategy';
import { RegisterUseCase } from './use-cases/register.use-case';
import { LoginUseCase } from './use-cases/login.use-case';
import { GetMeUseCase } from './use-cases/get-me.use-case';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: jwtConstants.secret,
      signOptions: {
        expiresIn: jwtConstants.expiresIn as JwtSignOptions['expiresIn'],
      },
    }),
    InfrastructureUsersModule,
    InfrastructureTenantsModule,
    // Registration seeds the workspace's default teams.
    ApplicationTeamsModule,
  ],
  providers: [JwtStrategy, RegisterUseCase, LoginUseCase, GetMeUseCase],
  exports: [RegisterUseCase, LoginUseCase, GetMeUseCase, JwtModule, PassportModule],
})
export class ApplicationAuthModule {}

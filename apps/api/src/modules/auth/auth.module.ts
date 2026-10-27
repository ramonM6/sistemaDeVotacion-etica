import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { config } from '../../config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: config.jwtSecret,
      signOptions: { expiresIn: `${config.sesionHoras}h` },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: config.loginIntentosPorMinuto }]),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}

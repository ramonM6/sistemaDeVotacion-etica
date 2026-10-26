import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { config } from '../../config';
import { Publico, UsuarioActual, UsuarioSesion } from '../../common/auth.decorators';
import { AuditService } from '../audit/audit.service';
import { AuthService } from './auth.service';
import { LoginDto } from './login.dto';
import { LoginThrottlerGuard } from './login-throttler.guard';

const opcionesCookie = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: false, // solo localhost (HTTP)
  path: '/',
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  @Publico()
  @UseGuards(LoginThrottlerGuard)
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { token, usuario } = await this.auth.login(dto.codigo, dto.password, req.ip);
    res.cookie(config.cookieNombre, token, { ...opcionesCookie, maxAge: config.sesionHoras * 3600 * 1000 });
    return usuario;
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@UsuarioActual() usuario: UsuarioSesion, @Res({ passthrough: true }) res: Response) {
    res.clearCookie(config.cookieNombre, opcionesCookie);
    res.setHeader('Cache-Control', 'no-store');
    await this.audit.registrar('LOGOUT', usuario.id);
  }

  @Get('me')
  me(@UsuarioActual() usuario: UsuarioSesion, @Res({ passthrough: true }) res: Response) {
    // Evita que el navegador reutilice una respuesta en caché del usuario tras cerrar sesión.
    res.setHeader('Cache-Control', 'no-store');
    return this.auth.me(usuario.id);
  }
}
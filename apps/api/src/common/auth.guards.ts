import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Rol } from '@prisma/client';
import { config } from '../config';
import { PrismaService } from '../prisma/prisma.service';
import { ES_PUBLICO, ROLES, UsuarioSesion } from './auth.decorators';

/** Guard global: exige una cookie de sesión con JWT válido salvo en endpoints @Publico(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const esPublico = this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, [ctx.getHandler(), ctx.getClass()]);
    if (esPublico) return true;

    const req = ctx.switchToHttp().getRequest();
    const token = req.cookies?.[config.cookieNombre];
    if (!token) throw new UnauthorizedException('Sesión no iniciada');
    try {
      const payload = this.jwt.verify<{ sub: string; codigo: string; rol: Rol }>(token);
      const usuario = await this.prisma.usuario.findUnique({
        where: { id: payload.sub },
        select: { activo: true, rol: true },
      });
      if (!usuario?.activo || usuario.rol !== payload.rol) throw new UnauthorizedException('Sesión inválida');
      req.usuario = { id: payload.sub, codigo: payload.codigo, rol: payload.rol } satisfies UsuarioSesion;
      return true;
    } catch {
      throw new UnauthorizedException('Sesión expirada o inválida');
    }
  }
}

/** Guard global: verifica @Roles() contra el rol de la sesión. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Rol[]>(ROLES, [ctx.getHandler(), ctx.getClass()]);
    if (!roles?.length) return true;
    const usuario: UsuarioSesion | undefined = ctx.switchToHttp().getRequest().usuario;
    if (!usuario || !roles.includes(usuario.rol)) throw new ForbiddenException('No tienes permiso para esta acción');
    return true;
  }
}

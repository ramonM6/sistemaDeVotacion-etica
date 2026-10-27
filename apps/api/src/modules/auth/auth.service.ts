import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ProcesosService } from '../procesos/procesos.service';

const ERROR_GENERICO = 'Código o contraseña incorrectos';

// Hash con el que se compara cuando el usuario no existe, para no revelar por tiempo de respuesta
// qué códigos están registrados.
const HASH_FICTICIO = bcrypt.hashSync('contraseña-ficticia', 10);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly procesos: ProcesosService,
  ) {}

  async login(codigoIngresado: string, password: string, ip?: string) {
    const codigo = codigoIngresado.trim();
    const usuario = await this.prisma.usuario.findUnique({ where: { codigo } });
    const passwordOk = await bcrypt.compare(password, usuario?.passwordHash ?? HASH_FICTICIO);

    // Basta pertenecer a una votación publicada, abierta o cerrada; los borradores no habilitan acceso.
    let habilitado = !!usuario && passwordOk;
    if (habilitado && usuario!.rol === 'ALUMNO') {
      habilitado = (await this.procesos.listarDelAlumno(usuario!.id)).length > 0;
    }

    if (!habilitado) {
      await this.audit.registrar('LOGIN_FAIL', usuario?.id ?? null, { codigo, ip: ip ?? null });
      throw new UnauthorizedException(ERROR_GENERICO);
    }

    await this.audit.registrar('LOGIN_OK', usuario!.id, { ip: ip ?? null });
    const token = await this.jwt.signAsync({ sub: usuario!.id, codigo: usuario!.codigo, rol: usuario!.rol });
    return { token, usuario: this.aPublico(usuario!) };
  }

  async me(usuarioId: string) {
    const usuario = await this.prisma.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario || (usuario.rol === 'ALUMNO' && !(await this.procesos.listarDelAlumno(usuario.id)).length))
      throw new UnauthorizedException('Sesión inválida');
    return this.aPublico(usuario);
  }

  private aPublico(u: { id: string; codigo: string; nombres: string; apellidos: string; rol: string }) {
    return { id: u.id, codigo: u.codigo, nombres: u.nombres, apellidos: u.apellidos, rol: u.rol };
  }
}

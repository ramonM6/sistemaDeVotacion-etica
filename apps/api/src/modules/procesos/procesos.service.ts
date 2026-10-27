import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EstadoProceso, ProcesoVotacion } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { ResultadosGateway } from '../resultados/resultados.gateway';
import { CambiarEstadoDto, CrearProcesoDto, EditarProcesoDto } from './procesos.dto';
import { ProcesosRepository } from './procesos.repository';

/** Transiciones permitidas: BORRADOR → ABIERTO → CERRADO, y CERRADO → ABIERTO para extender el plazo. */
const TRANSICIONES: Record<EstadoProceso, EstadoProceso[]> = {
  BORRADOR: ['ABIERTO'],
  ABIERTO: ['CERRADO'],
  CERRADO: ['ABIERTO'],
};

const INTERVALO_CIERRE_MS = 30_000;

@Injectable()
export class ProcesosService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProcesosService.name);
  private temporizador?: NodeJS.Timeout;

  constructor(
    private readonly repo: ProcesosRepository,
    private readonly audit: AuditService,
    private readonly gateway: ResultadosGateway,
  ) {}

  onModuleInit() {
    // Además de revisarlo en cada lectura, el cierre automático corre periódicamente
    // para que los dashboards se enteren aunque nadie consulte.
    this.temporizador = setInterval(() => {
      this.sincronizarEstados().catch((e) => this.logger.error(e));
    }, INTERVALO_CIERRE_MS);
    this.temporizador.unref();
  }

  onModuleDestroy() {
    if (this.temporizador) clearInterval(this.temporizador);
  }

  /** Cierra automáticamente los procesos cuya fechaFin ya pasó. */
  async sincronizarEstados(): Promise<void> {
    const cerrados = await this.repo.cerrarVencidos(new Date());
    for (const id of cerrados) {
      await this.audit.registrar('CAMBIO_ESTADO_PROCESO', null, { procesoId: id, estado: 'CERRADO', automatico: true });
      this.gateway.notificar('proceso', id);
    }
  }

  /** Proceso abierto o, si no hay ninguno, el último creado. */
  async obtenerActivo(): Promise<ProcesoVotacion | null> {
    await this.sincronizarEstados();
    return (await this.repo.buscarAbierto()) ?? (await this.repo.buscarUltimo());
  }

  async obtenerActivoOFallar(): Promise<ProcesoVotacion> {
    const proceso = await this.obtenerActivo();
    if (!proceso) throw new NotFoundException('No hay ningún proceso de votación');
    return proceso;
  }

  async obtener(id: string): Promise<ProcesoVotacion> {
    await this.sincronizarEstados();
    const proceso = await this.repo.buscar(id);
    if (!proceso) throw new NotFoundException('Proceso no encontrado');
    return proceso;
  }

  /** Resuelve el proceso indicado o, si no se indica, el activo. */
  resolver(procesoId?: string): Promise<ProcesoVotacion> {
    return procesoId ? this.obtener(procesoId) : this.obtenerActivoOFallar();
  }

  estaEnPadron(procesoId: string, usuarioId: string) {
    return this.repo.estaEnPadron(procesoId, usuarioId);
  }

  async listarDelAlumno(usuarioId: string) {
    await this.sincronizarEstados();
    return this.repo.listarDelAlumno(usuarioId);
  }

  async listar() {
    await this.sincronizarEstados();
    return this.repo.listar();
  }

  async crear(dto: CrearProcesoDto, coordinadorId: string) {
    this.validarFechas(dto.fechaInicio, dto.fechaFin);
    const proceso = await this.repo.crear(
      {
        nombre: dto.nombre.trim(),
        cicloObjetivo: dto.cicloObjetivo,
        cicloActual: dto.cicloActual,
        fechaInicio: dto.fechaInicio,
        fechaFin: dto.fechaFin,
        maxCursos: dto.maxCursos ?? 5,
        maxFranjas: dto.maxFranjas ?? 2,
      },
      dto.reutilizar,
      coordinadorId,
    );
    await this.audit.registrar('CREAR_PROCESO', coordinadorId, {
      procesoId: proceso.id,
      nombre: proceso.nombre,
      reutilizar: dto.reutilizar ? { ...dto.reutilizar } : {},
    });
    return proceso;
  }

  async editar(id: string, dto: EditarProcesoDto, coordinadorId: string) {
    const actual = await this.obtener(id);
    const fechaInicio = dto.fechaInicio ?? actual.fechaInicio;
    const fechaFin = dto.fechaFin ?? actual.fechaFin;
    this.validarFechas(fechaInicio, fechaFin);
    if (actual.estado === 'ABIERTO' && fechaFin <= new Date()) {
      throw new BadRequestException('La fecha de fin de un proceso abierto debe estar en el futuro');
    }
    if (
      actual.primeraApertura &&
      ((dto.cicloActual !== undefined && dto.cicloActual !== actual.cicloActual) ||
        (dto.cicloObjetivo !== undefined && dto.cicloObjetivo !== actual.cicloObjetivo) ||
        (dto.maxCursos !== undefined && dto.maxCursos !== actual.maxCursos) ||
        (dto.maxFranjas !== undefined && dto.maxFranjas !== actual.maxFranjas))
    ) {
      throw new BadRequestException('Los ciclos y límites no se cambian después de la primera apertura');
    }
    const proceso = await this.repo.actualizar(id, { ...dto, nombre: dto.nombre?.trim() });
    await this.audit.registrar('EDITAR_PROCESO', coordinadorId, {
      procesoId: id,
      cambios: JSON.parse(JSON.stringify(dto)),
    });
    this.gateway.notificar('proceso', id);
    return proceso;
  }

  async cambiarEstado(id: string, { estado }: CambiarEstadoDto, coordinadorId: string) {
    const actual = await this.obtener(id);
    if (actual.estado === estado) return actual;
    if (!TRANSICIONES[actual.estado].includes(estado)) {
      throw new BadRequestException(`No se puede pasar de ${actual.estado} a ${estado}`);
    }
    if (estado === 'ABIERTO') {
      const abierto = await this.repo.buscarAbierto();
      if (abierto && abierto.id !== id) {
        throw new ConflictException(`Ya hay un proceso abierto: "${abierto.nombre}". Ciérralo primero.`);
      }
      if (actual.fechaFin <= new Date()) {
        throw new BadRequestException('La fecha de fin ya pasó: extiéndela antes de abrir el proceso');
      }
    }
    if (estado === 'ABIERTO' && actual.estado === 'CERRADO' && (await this.repo.tieneSeguimiento(id))) {
      throw new BadRequestException('No se puede reabrir un proceso con seguimiento del consejo');
    }
    const proceso = estado === 'ABIERTO' ? await this.repo.abrir(id) : await this.repo.actualizar(id, { estado });
    await this.audit.registrar('CAMBIO_ESTADO_PROCESO', coordinadorId, { procesoId: id, de: actual.estado, a: estado });
    this.gateway.notificar('proceso', id);
    return proceso;
  }

  private validarFechas(inicio: Date, fin: Date) {
    if (fin <= inicio) throw new BadRequestException('La fecha de fin debe ser posterior a la de inicio');
  }
}

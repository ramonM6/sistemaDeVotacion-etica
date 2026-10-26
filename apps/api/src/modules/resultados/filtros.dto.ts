import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';
import { Prisma } from '@prisma/client';
export class FiltrosResultadosDto {
  @IsOptional() @IsUUID() procesoId?: string;
  @IsOptional() @IsIn(['CONFIRMADO', 'CONDICIONAL', 'NO_APTO']) aptitud?: string;
  @IsOptional() @IsIn(['si', 'no']) tabla?: string;
  @IsOptional() @IsIn(['si', 'no']) graficos?: string;
  @IsOptional() @IsIn(['si', 'no']) estadisticas?: string;
  @IsOptional() @IsIn(['si', 'no']) agrupaciones?: string;
  @IsOptional() @Matches(/^\d{4}(?:\.[12])?$/) ingreso?: string;
  @IsOptional() @IsIn(['ingreso', 'craest', 'matricula']) grupo?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) craestMin?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) craestMax?: number;
  @IsOptional() @IsIn(['si', 'no']) matriculado?: string;
}
export function filtroPadron(procesoId: string, filtros: FiltrosResultadosDto = {}): Prisma.PadronAlumnoWhereInput {
  return {
    procesoId,
    ...(filtros.ingreso !== undefined ? { ingreso: filtros.ingreso } : {}),
    ...(filtros.matriculado ? { matriculado: filtros.matriculado === 'si' } : {}),
    ...(filtros.craestMin !== undefined || filtros.craestMax !== undefined
      ? { craest: { gte: filtros.craestMin, lte: filtros.craestMax } }
      : {}),
  };
}

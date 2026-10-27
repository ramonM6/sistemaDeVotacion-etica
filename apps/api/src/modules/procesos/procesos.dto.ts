import { EstadoProceso } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  ValidateNested,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ReutilizarArchivosDto {
  @IsOptional() @IsUUID() malla?: string;
  @IsOptional() @IsUUID() cuentas?: string;
  @IsOptional() @IsUUID() historial?: string;
}

export class CrearProcesoDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ReutilizarArchivosDto)
  reutilizar?: ReutilizarArchivosDto;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  nombre: string;

  @IsString()
  @Matches(/^\d{4}-[0-2]$/, { message: 'cicloObjetivo debe tener el formato AAAA-N (ej. 2027-1)' })
  cicloObjetivo: string;

  @IsOptional()
  @Matches(/^\d{4}-[0-2]$/, { message: 'cicloActual debe tener formato AAAA-N' })
  cicloActual?: string;

  @Type(() => Date)
  @IsDate()
  fechaInicio: Date;

  @Type(() => Date)
  @IsDate()
  fechaFin: Date;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  maxCursos?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2)
  maxFranjas?: number;
}

export class EditarProcesoDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-[0-2]$/, { message: 'cicloObjetivo debe tener el formato AAAA-N (ej. 2027-1)' })
  cicloObjetivo?: string;

  @IsOptional()
  @Matches(/^\d{4}-[0-2]$/)
  cicloActual?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fechaInicio?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fechaFin?: Date;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  maxCursos?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2)
  maxFranjas?: number;
}

export class CambiarEstadoDto {
  @IsEnum(EstadoProceso)
  estado: EstadoProceso;
}

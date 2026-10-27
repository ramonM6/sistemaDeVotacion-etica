import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class FiltrosResultadosDto {
  @IsOptional() @IsUUID() procesoId?: string;
  @IsOptional() @IsIn(['CONFIRMADO', 'CONDICIONAL']) aptitud?: string;
}

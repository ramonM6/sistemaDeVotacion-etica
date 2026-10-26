import { Franja } from '@prisma/client';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsEnum, IsString, Matches } from 'class-validator';

export class EmitirVotoDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(/^[0-9A-Z]{6}$/, { message: 'cursoCodigo inválido' })
  cursoCodigo: string;

  @IsArray({ message: 'Debes elegir al menos una franja' })
  @ArrayMinSize(1, { message: 'Debes elegir al menos una franja' })
  @ArrayMaxSize(2)
  @ArrayUnique({ message: 'Las franjas no pueden repetirse' })
  @IsEnum(Franja, { each: true, message: 'Franja inválida' })
  franjas: Franja[];
}

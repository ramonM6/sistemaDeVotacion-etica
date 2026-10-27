import { BadRequestException } from '@nestjs/common';

export const RECURSOS = {
  plantillas: {
    malla: 'plantilla_malla_curricular.xlsx',
    cuentas: 'plantilla_cuentas_alumnos.xlsx',
    historial: 'plantilla_historial_academico.xlsx',
  },
  ejemplos: {
    malla: '01_malla.csv',
    cuentas: '02_alumnos.csv',
    historial: '03_historial.csv',
  },
} as const;
export type ClaseRecurso = keyof typeof RECURSOS;

export function recurso(clase: ClaseRecurso, tipo: string) {
  const normalizado = tipo === 'catalogo' && clase === 'plantillas' ? 'malla' : tipo;
  if (!['malla', 'cuentas', 'historial'].includes(normalizado))
    throw new BadRequestException('No hay recurso para ese tipo');
  const nombre = RECURSOS[clase][normalizado as keyof typeof RECURSOS.plantillas];
  return { nombre, ruta: `sistema-votacion/recursos/v1/${clase}/${nombre}` };
}

import type { SeguimientoCurso } from './api';

export const ETAPAS = ['seleccion', 'consejo', 'dictado'] as const;
export type Etapa = (typeof ETAPAS)[number];
export const configuracion = {
  seleccion: {
    titulo: 'Selección de cursos',
    descripcion: '«Seleccionado para revisión» pasa al consejo. «No seleccionado» queda fuera.',
    campo: 'seleccion',
    opciones: ['SELECCIONADO_PARA_REVISION', 'NO_SELECCIONADO'],
    vacio: 'No hay electivos cargados en esta votación.',
  },
  consejo: {
    titulo: 'Resultados del consejo',
    descripcion: '«Aprobado» pasa a decidir su dictado, sin confirmarlo aún. «No aprobado» no avanza.',
    campo: 'consejo',
    opciones: ['APROBADO', 'NO_APROBADO'],
    vacio: 'Todavía no hay cursos seleccionados para revisión. Vuelve a Selección de cursos para elegirlos.',
  },
  dictado: {
    titulo: 'Decisión de dictado',
    descripcion:
      'Según la disponibilidad de un profesor para dictarlo, se determina si el curso queda «Confirmado» o «No se dictará».',
    campo: 'dictado',
    opciones: ['CONFIRMADO', 'NO_SE_DICTARA'],
    vacio: 'Todavía no hay cursos aprobados por el consejo. Revisa la etapa anterior.',
  },
} as const;
export const elegibles = (cursos: SeguimientoCurso[], etapa: Etapa) =>
  cursos.filter(
    (c) =>
      etapa === 'seleccion' ||
      (c.seleccion === 'SELECCIONADO_PARA_REVISION' && (etapa === 'consejo' || c.consejo === 'APROBADO')),
  );

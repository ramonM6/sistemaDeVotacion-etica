import { NOTA_APROBATORIA, NOTA_MIN_CURSADO, SIMULTANEO_PERMISIVO } from './constantes';
import {
  Aptitud,
  ContextoAlumno,
  EstadoCurso,
  EvaluacionRequisito,
  OpcionesEvaluacion,
  ResultadoElegibilidad,
  TerminoRequisito,
} from './tipos';

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ''));

/** ¿La nota real cumple el término? (sin contar el "en curso") */
function cumpleConNota(tipo: TerminoRequisito['tipo'], estado: EstadoCurso | undefined): boolean {
  const nota = estado?.notaMax ?? null;
  if (nota === null) return false;
  switch (tipo) {
    case 'APROBADO':
    case 'APROBADO_O_SIMULTANEO':
      return nota >= NOTA_APROBATORIA;
    case 'CURSADO_NOTA_MIN_8':
      return nota >= NOTA_MIN_CURSADO;
    case 'CURSADO_O_SIMULTANEO':
      return true; // cualquier nota, aunque sea desaprobatoria
    default:
      return false;
  }
}

function describirNoCumple(tipo: TerminoRequisito['tipo'], codigo: string, estado?: EstadoCurso): string {
  if (!estado || estado.notaMax === null)
    return `Debes ${tipo === 'CURSADO_NOTA_MIN_8' ? 'cursar con nota mínima de 8' : tipo === 'CURSADO_O_SIMULTANEO' ? 'cursar' : 'aprobar'} ${codigo}; no tienes una nota registrada.`;
  const nota = estado.notaMax;
  if (tipo === 'CURSADO_NOTA_MIN_8') return `${codigo} con nota máxima ${nota} (se requiere 08 o más)`;
  return `${codigo} con nota máxima ${nota} (no aprobado)`;
}

function describirCumple(tipo: TerminoRequisito['tipo'], codigo: string, nota: number): string {
  if (tipo === 'CURSADO_O_SIMULTANEO') return `Cursó ${codigo} (nota ${nota})`;
  if (tipo === 'CURSADO_NOTA_MIN_8') return `Cursó ${codigo} con ${nota}`;
  return `Aprobó ${codigo} con ${nota}`;
}

function evaluarTermino(
  termino: TerminoRequisito,
  ctx: ContextoAlumno,
  simultaneoPermisivo: boolean,
): EvaluacionRequisito {
  if (termino.tipo === 'CREDITOS_MIN') {
    const minimo = termino.creditosMinimos ?? 0;
    const { aprobados, enCurso } = ctx.creditos;
    if (aprobados >= minimo) {
      return {
        termino: termino.texto,
        cumple: true,
        dependeDeEnCurso: false,
        detalle: `${fmt(aprobados)} créditos aprobados (mínimo ${minimo})`,
      };
    }
    const total = Math.round((aprobados + enCurso) * 100) / 100;
    if (total >= minimo) {
      return {
        termino: termino.texto,
        cumple: true,
        dependeDeEnCurso: true,
        detalle: `Se exigen ${fmt(minimo)} créditos aprobados. Tienes ${fmt(aprobados)}; te faltan ${fmt(Math.round((minimo - aprobados) * 100) / 100)}. Estás llevando ${fmt(enCurso)} créditos: debes aprobar al menos los que te faltan.`,
      };
    }
    return {
      termino: termino.texto,
      cumple: false,
      dependeDeEnCurso: false,
      detalle: `Se exigen ${fmt(minimo)} créditos aprobados. Tienes ${fmt(aprobados)} y llevas ${fmt(enCurso)}. Aun aprobándolos todos, llegarías a ${fmt(total)}: te faltarían ${fmt(Math.round((minimo - total) * 100) / 100)} créditos.`,
    };
  }

  const codigo = termino.cursoRequerido!;
  const estado = ctx.historial.get(codigo);

  if (cumpleConNota(termino.tipo, estado)) {
    return {
      termino: termino.texto,
      cumple: true,
      dependeDeEnCurso: false,
      detalle: describirCumple(termino.tipo, codigo, estado!.notaMax!),
    };
  }
  if (estado?.enCurso) {
    return {
      termino: termino.texto,
      cumple: true,
      dependeDeEnCurso: true,
      detalle: `Estás llevando ${codigo}; debes ${termino.tipo === 'CURSADO_NOTA_MIN_8' ? 'terminarlo con nota mínima de 8' : termino.tipo === 'CURSADO_O_SIMULTANEO' ? 'terminarlo' : 'aprobarlo'} para cumplir este requisito.`,
    };
  }
  const esSimultaneo = termino.tipo === 'APROBADO_O_SIMULTANEO' || termino.tipo === 'CURSADO_O_SIMULTANEO';
  if (esSimultaneo && simultaneoPermisivo) {
    return {
      termino: termino.texto,
      cumple: true,
      dependeDeEnCurso: false,
      detalle: `Se acepta llevando ${codigo} en simultáneo`,
    };
  }
  return {
    termino: termino.texto,
    cumple: false,
    dependeDeEnCurso: false,
    detalle: describirNoCumple(termino.tipo, codigo, estado),
  };
}

/**
 * Evalúa los requisitos (combinados con AND) de un electivo para un alumno.
 * - CONFIRMADO: cumple todo solo con notas reales (o el electivo no tiene requisitos).
 * - CONDICIONAL: cumple todo, pero algún término depende de cursos o créditos en curso.
 * - NO_APTO: algún término no se cumple ni asumiendo que aprueba lo que está llevando.
 */
export function evaluarElegibilidad(
  terminos: TerminoRequisito[],
  ctx: ContextoAlumno,
  opciones: OpcionesEvaluacion = {},
): ResultadoElegibilidad {
  const permisivo = opciones.simultaneoPermisivo ?? SIMULTANEO_PERMISIVO;
  const requisitos = terminos.map((t) => evaluarTermino(t, ctx, permisivo));

  const cursosEnCursoNecesarios: string[] = [];
  let dependeDeCreditosEnCurso = false;
  terminos.forEach((t, i) => {
    if (!requisitos[i].dependeDeEnCurso) return;
    if (t.tipo === 'CREDITOS_MIN') dependeDeCreditosEnCurso = true;
    else if (t.cursoRequerido && !cursosEnCursoNecesarios.includes(t.cursoRequerido)) {
      cursosEnCursoNecesarios.push(t.cursoRequerido);
    }
  });

  let aptitud: Aptitud = 'CONFIRMADO';
  if (requisitos.some((r) => !r.cumple)) aptitud = 'NO_APTO';
  else if (requisitos.some((r) => r.dependeDeEnCurso)) aptitud = 'CONDICIONAL';

  return {
    aptitud,
    requisitos,
    cursosEnCursoNecesarios: aptitud === 'NO_APTO' ? [] : cursosEnCursoNecesarios,
    dependeDeCreditosEnCurso: aptitud === 'NO_APTO' ? false : dependeDeCreditosEnCurso,
  };
}

import {
  Aptitud,
  ContextoAlumno,
  CursoCatalogo,
  HistorialEntrada,
  calcularCreditos,
  evaluarElegibilidad,
  parsearRequisitos,
  resumirHistorial,
} from './index';

/** Catálogo mínimo para los tests (créditos reales del plan). */
const catalogo = new Map<string, CursoCatalogo>(
  [
    { codigo: '1INF24', creditos: 3.5, tipo: 'OBLIGATORIO' },
    { codigo: '1INF29', creditos: 2.5, tipo: 'OBLIGATORIO' },
    { codigo: '1INF39', creditos: 3.5, tipo: 'OBLIGATORIO' },
    { codigo: '1INF41', creditos: 3.5, tipo: 'OBLIGATORIO' },
    { codigo: 'INF238', creditos: 4, tipo: 'OBLIGATORIO' },
    { codigo: '1QUI02', creditos: 0.75, tipo: 'OBLIGATORIO' },
    { codigo: '1FIS03', creditos: 0.5, tipo: 'OBLIGATORIO' },
    { codigo: 'BLOQUE', creditos: 130, tipo: 'OBLIGATORIO' }, // bloque ficticio para llegar a límites
    { codigo: 'BLOQ10', creditos: 10, tipo: 'OBLIGATORIO' },
    { codigo: '1HUM74', creditos: 3, tipo: 'ELECTIVO_LIBRE' },
    { codigo: '1HUM75', creditos: 3, tipo: 'ELECTIVO_LIBRE' },
    { codigo: '1HUM78', creditos: 3, tipo: 'ELECTIVO_LIBRE' },
    { codigo: '1HUM79', creditos: 3, tipo: 'ELECTIVO_LIBRE' },
    { codigo: 'TEO240', creditos: 3, tipo: 'ELECTIVO_LIBRE' },
    { codigo: '1ING18', creditos: 1, tipo: 'ELECTIVO_LIBRE' },
    { codigo: '1HUM02', creditos: 2, tipo: 'ELECTIVO_GENERALES' },
  ].map((c) => [c.codigo, c as CursoCatalogo]),
);

function contexto(entradas: HistorialEntrada[]): ContextoAlumno {
  const historial = resumirHistorial(entradas);
  return { historial, creditos: calcularCreditos(historial, catalogo) };
}

function aptitudDe(requisitos: string, entradas: HistorialEntrada[]): Aptitud {
  const { terminos, errores } = parsearRequisitos(requisitos);
  expect(errores).toEqual([]);
  return evaluarElegibilidad(terminos, contexto(entradas)).aptitud;
}

describe('parsearRequisitos', () => {
  it('reconoce las cinco notaciones', () => {
    const { terminos, errores } = parsearRequisitos('1INF24, (1INF29), [1INF39], {INF238}, 140 créditos aprobados *');
    expect(errores).toEqual([]);
    expect(terminos).toEqual([
      { texto: '1INF24', tipo: 'APROBADO', cursoRequerido: '1INF24' },
      { texto: '(1INF29)', tipo: 'CURSADO_NOTA_MIN_8', cursoRequerido: '1INF29' },
      { texto: '[1INF39]', tipo: 'APROBADO_O_SIMULTANEO', cursoRequerido: '1INF39' },
      { texto: '{INF238}', tipo: 'CURSADO_O_SIMULTANEO', cursoRequerido: 'INF238' },
      { texto: '140 créditos aprobados *', tipo: 'CREDITOS_MIN', creditosMinimos: 140 },
    ]);
  });

  it('acepta créditos sin tilde, sin asterisco y con espacios extra', () => {
    for (const texto of ['120 creditos aprobados', '120créditos aprobados*', '  120   créditos   aprobados  * ']) {
      const { terminos, errores } = parsearRequisitos(texto);
      expect(errores).toEqual([]);
      expect(terminos[0]).toMatchObject({ tipo: 'CREDITOS_MIN', creditosMinimos: 120 });
    }
  });

  it('normaliza códigos en minúsculas', () => {
    expect(parsearRequisitos('1inf24').terminos[0]).toMatchObject({ cursoRequerido: '1INF24' });
  });

  it('texto vacío, nulo o guion equivale a sin requisitos', () => {
    for (const t of ['', '   ', null, undefined, '—']) {
      expect(parsearRequisitos(t)).toEqual({ terminos: [], errores: [] });
    }
  });

  it('ignora comas sobrantes', () => {
    expect(parsearRequisitos('1INF24,, 1INF41,').terminos).toHaveLength(2);
  });

  it.each([
    ['1INF2'], // código corto
    ['1INF244'], // código largo
    ['(1INF29'], // paréntesis sin cerrar
    ['[1INF39)'], // delimitadores mezclados
    ['1INF24 y 1INF41'], // separador incorrecto
    ['créditos aprobados 140'], // orden invertido
    ['140 créditos'], // falta "aprobados"
    ['<1INF24>'], // notación inexistente
  ])('término mal escrito "%s" genera error de parseo', (texto) => {
    const { terminos, errores } = parsearRequisitos(texto);
    expect(terminos).toEqual([]);
    expect(errores).toHaveLength(1);
    expect(errores[0].termino).toBe(texto);
  });

  it('separa términos válidos de los inválidos', () => {
    const { terminos, errores } = parsearRequisitos('1INF24, 1INF4X1, (1INF29)');
    expect(terminos.map((t) => t.texto)).toEqual(['1INF24', '(1INF29)']);
    expect(errores).toEqual([{ termino: '1INF4X1', mensaje: expect.stringContaining('no reconocido') }]);
  });
});

describe('resumirHistorial', () => {
  it('toma la nota máxima de un curso repetido', () => {
    const r = resumirHistorial([
      { cursoCodigo: '1INF24', nota: 9 },
      { cursoCodigo: '1INF24', nota: 15 },
      { cursoCodigo: '1INF24', nota: 12 },
    ]);
    expect(r.get('1INF24')).toEqual({ notaMax: 15, enCurso: false });
  });

  it('si alguna fila está vacía, el curso está en curso', () => {
    const r = resumirHistorial([
      { cursoCodigo: '1INF24', nota: 7 },
      { cursoCodigo: '1INF24', nota: null },
    ]);
    expect(r.get('1INF24')).toEqual({ notaMax: 7, enCurso: true });
  });
});

describe('evaluarElegibilidad — cada tipo de término con nota 7, 8, 10, 11 y vacía', () => {
  const casos: Array<[string, string, Record<string, Aptitud>]> = [
    ['APROBADO', '1INF24', { 7: 'NO_APTO', 8: 'NO_APTO', 10: 'NO_APTO', 11: 'CONFIRMADO', vacia: 'CONDICIONAL' }],
    [
      'CURSADO_NOTA_MIN_8',
      '(1INF24)',
      { 7: 'NO_APTO', 8: 'CONFIRMADO', 10: 'CONFIRMADO', 11: 'CONFIRMADO', vacia: 'CONDICIONAL' },
    ],
    [
      'APROBADO_O_SIMULTANEO',
      '[1INF24]',
      { 7: 'NO_APTO', 8: 'NO_APTO', 10: 'NO_APTO', 11: 'CONFIRMADO', vacia: 'CONDICIONAL' },
    ],
    [
      'CURSADO_O_SIMULTANEO',
      '{1INF24}',
      { 7: 'CONFIRMADO', 8: 'CONFIRMADO', 10: 'CONFIRMADO', 11: 'CONFIRMADO', vacia: 'CONDICIONAL' },
    ],
  ];

  for (const [tipo, requisito, esperado] of casos) {
    describe(`${tipo} — ${requisito}`, () => {
      it.each([7, 8, 10, 11])('con nota %i', (nota) => {
        expect(aptitudDe(requisito, [{ cursoCodigo: '1INF24', nota }])).toBe(esperado[nota]);
      });

      it('con nota vacía (en curso)', () => {
        const r = evaluarElegibilidad(
          parsearRequisitos(requisito).terminos,
          contexto([{ cursoCodigo: '1INF24', nota: null }]),
        );
        expect(r.aptitud).toBe(esperado.vacia);
        expect(r.requisitos[0]).toMatchObject({ cumple: true, dependeDeEnCurso: true });
        expect(r.cursosEnCursoNecesarios).toEqual(['1INF24']);
      });

      it('sin registro del curso → NO_APTO', () => {
        expect(aptitudDe(requisito, [])).toBe('NO_APTO');
      });
    });
  }

  it('desaprobado con 7 pero llevándolo de nuevo → CONDICIONAL', () => {
    expect(
      aptitudDe('1INF24', [
        { cursoCodigo: '1INF24', nota: 7 },
        { cursoCodigo: '1INF24', nota: null },
      ]),
    ).toBe('CONDICIONAL');
  });

  it('con SIMULTANEO_PERMISIVO, [X] y {X} se aceptan sin registro', () => {
    const ctx = contexto([]);
    for (const req of ['[1INF39]', '{INF238}']) {
      const r = evaluarElegibilidad(parsearRequisitos(req).terminos, ctx, { simultaneoPermisivo: true });
      expect(r.aptitud).toBe('CONFIRMADO');
    }
    // los demás términos no cambian
    const r = evaluarElegibilidad(parsearRequisitos('1INF24').terminos, ctx, { simultaneoPermisivo: true });
    expect(r.aptitud).toBe('NO_APTO');
  });
});

describe('evaluarElegibilidad — casos de la especificación', () => {
  it('curso repetido: 9 y luego 15 → aprobado', () => {
    expect(
      aptitudDe('1INF24', [
        { cursoCodigo: '1INF24', nota: 9 },
        { cursoCodigo: '1INF24', nota: 15 },
      ]),
    ).toBe('CONFIRMADO');
  });

  describe('requisito compuesto (1INF24, 1INF41)', () => {
    it('ambos aprobados → CONFIRMADO', () => {
      expect(
        aptitudDe('1INF24, 1INF41', [
          { cursoCodigo: '1INF24', nota: 14 },
          { cursoCodigo: '1INF41', nota: 11 },
        ]),
      ).toBe('CONFIRMADO');
    });

    it('uno aprobado y otro en curso → CONDICIONAL y lista el en curso', () => {
      const { terminos } = parsearRequisitos('1INF24, 1INF41');
      const r = evaluarElegibilidad(
        terminos,
        contexto([
          { cursoCodigo: '1INF24', nota: 14 },
          { cursoCodigo: '1INF41', nota: null },
        ]),
      );
      expect(r.aptitud).toBe('CONDICIONAL');
      expect(r.cursosEnCursoNecesarios).toEqual(['1INF41']);
    });

    it('uno aprobado y otro desaprobado → NO_APTO (AND)', () => {
      expect(
        aptitudDe('1INF24, 1INF41', [
          { cursoCodigo: '1INF24', nota: 14 },
          { cursoCodigo: '1INF41', nota: 10 },
        ]),
      ).toBe('NO_APTO');
    });

    it('uno en curso y otro faltante → NO_APTO y no lista cursos en curso', () => {
      const r = evaluarElegibilidad(
        parsearRequisitos('1INF24, 1INF41').terminos,
        contexto([{ cursoCodigo: '1INF24', nota: null }]),
      );
      expect(r.aptitud).toBe('NO_APTO');
      expect(r.cursosEnCursoNecesarios).toEqual([]);
    });
  });

  describe('créditos', () => {
    it('justo en el límite (140 de 140) → CONFIRMADO', () => {
      // 130 + 10 = 140
      expect(
        aptitudDe('140 créditos aprobados *', [
          { cursoCodigo: 'BLOQUE', nota: 11 },
          { cursoCodigo: 'BLOQ10', nota: 20 },
        ]),
      ).toBe('CONFIRMADO');
    });

    it('un centésimo debajo del límite no alcanza', () => {
      // 130 + 4 + 3.5 + 2.5 = 140 ; sin INF238 = 136
      const ctx = contexto([
        { cursoCodigo: 'BLOQUE', nota: 11 },
        { cursoCodigo: '1INF24', nota: 11 },
        { cursoCodigo: '1INF29', nota: 11 },
        { cursoCodigo: 'INF238', nota: 10 },
      ]);
      expect(ctx.creditos.aprobados).toBe(136);
      expect(evaluarElegibilidad(parsearRequisitos('140 créditos aprobados *').terminos, ctx).aptitud).toBe('NO_APTO');
    });

    it('suma decimales sin errores de coma flotante', () => {
      const ctx = contexto([
        { cursoCodigo: '1QUI02', nota: 15 }, // 0.75
        { cursoCodigo: '1FIS03', nota: 15 }, // 0.5
        { cursoCodigo: '1INF24', nota: 15 }, // 3.5
      ]);
      expect(ctx.creditos.aprobados).toBe(4.75);
    });

    it('solo alcanza sumando los cursos en curso → CONDICIONAL', () => {
      const { terminos } = parsearRequisitos('140 créditos aprobados *');
      const ctx = contexto([
        { cursoCodigo: 'BLOQUE', nota: 16 }, // 130 aprobados
        { cursoCodigo: 'BLOQ10', nota: null }, // 10 en curso
      ]);
      expect(ctx.creditos).toEqual({ aprobados: 130, enCurso: 10 });
      const r = evaluarElegibilidad(terminos, ctx);
      expect(r.aptitud).toBe('CONDICIONAL');
      expect(r.requisitos[0]).toMatchObject({ cumple: true, dependeDeEnCurso: true });
      expect(r.dependeDeCreditosEnCurso).toBe(true);
      expect(r.cursosEnCursoNecesarios).toEqual([]);
    });

    it('ni sumando los en curso alcanza → NO_APTO', () => {
      expect(
        aptitudDe('140 créditos aprobados *', [
          { cursoCodigo: 'BLOQUE', nota: 16 },
          { cursoCodigo: '1INF24', nota: null },
        ]),
      ).toBe('NO_APTO');
    });

    it('cursos desaprobados no suman créditos', () => {
      const ctx = contexto([{ cursoCodigo: 'BLOQ10', nota: 10 }]);
      expect(ctx.creditos).toEqual({ aprobados: 0, enCurso: 0 });
    });

    it('cursos fuera del catálogo aportan 0 créditos', () => {
      const ctx = contexto([
        { cursoCodigo: 'TEL618', nota: 18 },
        { cursoCodigo: 'XXX999', nota: null },
      ]);
      expect(ctx.creditos).toEqual({ aprobados: 0, enCurso: 0 });
    });

    it('ELECTIVO_GENERALES suma créditos normalmente', () => {
      expect(contexto([{ cursoCodigo: '1HUM02', nota: 13 }]).creditos.aprobados).toBe(2);
    });

    it('ELECTIVO_LIBRE cuenta como máximo 12 créditos aprobados', () => {
      const ctx = contexto(
        ['1HUM74', '1HUM75', '1HUM78', '1HUM79', 'TEO240'].map((c) => ({ cursoCodigo: c, nota: 14 })),
      );
      expect(ctx.creditos.aprobados).toBe(12);
    });

    it('el tope de 12 de ELECTIVO_LIBRE incluye los en curso (primero los aprobados)', () => {
      const ctx = contexto([
        { cursoCodigo: '1HUM74', nota: 14 },
        { cursoCodigo: '1HUM75', nota: 14 },
        { cursoCodigo: '1HUM78', nota: 14 }, // 9 aprobados
        { cursoCodigo: '1HUM79', nota: null },
        { cursoCodigo: 'TEO240', nota: null }, // 6 en curso, pero solo quedan 3
        { cursoCodigo: 'BLOQ10', nota: null }, // obligatorio en curso: no tiene tope
      ]);
      expect(ctx.creditos).toEqual({ aprobados: 9, enCurso: 13 });
    });

    it('un curso aprobado y vuelto a llevar no se cuenta dos veces', () => {
      const ctx = contexto([
        { cursoCodigo: '1INF24', nota: 15 },
        { cursoCodigo: '1INF24', nota: null },
      ]);
      expect(ctx.creditos).toEqual({ aprobados: 3.5, enCurso: 0 });
    });
  });

  it('electivo sin requisitos → CONFIRMADO', () => {
    const r = evaluarElegibilidad(parsearRequisitos('').terminos, contexto([]));
    expect(r).toEqual({
      aptitud: 'CONFIRMADO',
      requisitos: [],
      cursosEnCursoNecesarios: [],
      dependeDeCreditosEnCurso: false,
    });
  });

  it('mezcla de cursos y créditos en curso → CONDICIONAL con ambos indicadores', () => {
    // INF382: 1INF28, 1INF49, 120 créditos aprobados *
    const r = evaluarElegibilidad(
      parsearRequisitos('1INF24, 140 créditos aprobados *').terminos,
      contexto([
        { cursoCodigo: 'BLOQUE', nota: 12 },
        { cursoCodigo: '1INF24', nota: null },
        { cursoCodigo: 'BLOQ10', nota: null },
      ]),
    );
    expect(r.aptitud).toBe('CONDICIONAL');
    expect(r.cursosEnCursoNecesarios).toEqual(['1INF24']);
    expect(r.dependeDeCreditosEnCurso).toBe(true);
  });

  it('explica cuántos créditos faltan cuando se permite un voto condicional', () => {
    const r = evaluarElegibilidad(parsearRequisitos('140 créditos aprobados *').terminos, {
      historial: new Map(),
      creditos: { aprobados: 125.5, enCurso: 20 },
    });
    expect(r.aptitud).toBe('CONDICIONAL');
    expect(r.requisitos[0].detalle).toBe(
      'Se exigen 140 créditos aprobados. Tienes 125.5; te faltan 14.5. Estás llevando 20 créditos: debes aprobar al menos los que te faltan.',
    );
  });

  it('cada requisito trae un detalle legible', () => {
    const r = evaluarElegibilidad(
      parsearRequisitos('1INF24, (1INF29), 140 créditos aprobados *').terminos,
      contexto([
        { cursoCodigo: '1INF24', nota: 9 },
        { cursoCodigo: '1INF29', nota: 8 },
      ]),
    );
    expect(r.requisitos.map((x) => x.detalle)).toEqual([
      '1INF24 con nota máxima 9 (no aprobado)',
      'Cursó 1INF29 con 8',
      'Se exigen 140 créditos aprobados. Tienes 0 y llevas 0. Aun aprobándolos todos, llegarías a 0: te faltarían 140 créditos.', // 1INF29 con 8 no está aprobado: no suma
    ]);
  });
});

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FRANJAS } from '@/lib/formato';
import type { ConteoFranjas, FilaResultado } from '@/lib/tipos';
import { cn } from '@/lib/utils';

// Paleta validada (CVD-safe en pares adyacentes): serie 1 azul, serie 2 naranja; rampa secuencial azul.
export const COLOR_SERIE_1 = '#2a78d6';
export const COLOR_SERIE_2 = '#eb6834';
const RAMPA = [
  '#cde2fb',
  '#b7d3f6',
  '#9ec5f4',
  '#86b6ef',
  '#6da7ec',
  '#5598e7',
  '#3987e5',
  '#2a78d6',
  '#256abf',
  '#1c5cab',
  '#184f95',
  '#104281',
  '#0d366b',
];
const TINTA = '#52514e';
const GRILLA = '#e5e7eb';

const ejeProps = { tick: { fill: TINTA, fontSize: 12 }, axisLine: false, tickLine: false } as const;

function CajaTooltip({
  titulo,
  filas,
}: {
  titulo: string;
  filas: { color?: string; etiqueta: string; valor: number }[];
}) {
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 max-w-[260px] font-semibold text-foreground">{titulo}</p>
      {filas.map((f) => (
        <p key={f.etiqueta} className="flex items-center gap-2 text-muted-foreground">
          {f.color && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: f.color }} />}
          <span>{f.etiqueta}</span>
          <span className="ml-auto pl-3 font-semibold tabular-nums text-foreground">{f.valor}</span>
        </p>
      ))}
    </div>
  );
}

const alturaPara = (n: number) => Math.max(120, n * 34 + 40);

/** Ranking de electivos por votos: barras horizontales de una sola serie. */
export function RankingBarras({
  datos,
  seleccionado,
  alSeleccionar,
}: {
  datos: { codigo: string; nombre: string; total: number }[];
  seleccionado?: string | null;
  alSeleccionar?: (codigo: string) => void;
}) {
  return (
    <ResponsiveContainer width="100%" height={alturaPara(datos.length)}>
      <BarChart data={datos} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 8 }} barCategoryGap={6}>
        <CartesianGrid horizontal={false} stroke={GRILLA} />
        <XAxis type="number" allowDecimals={false} {...ejeProps} />
        <YAxis type="category" dataKey="codigo" width={64} {...ejeProps} />
        <Tooltip
          cursor={{ fill: 'rgba(42,120,214,0.08)' }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <CajaTooltip
                titulo={`${payload[0].payload.codigo} · ${payload[0].payload.nombre}`}
                filas={[{ color: COLOR_SERIE_1, etiqueta: 'Votos', valor: payload[0].payload.total }]}
              />
            ) : null
          }
        />
        <Bar
          dataKey="total"
          name="Votos"
          radius={[0, 4, 4, 0]}
          maxBarSize={22}
          onClick={(d: { codigo?: string }) => d.codigo && alSeleccionar?.(d.codigo)}
          className={alSeleccionar ? 'cursor-pointer' : undefined}
        >
          {datos.map((d) => (
            <Cell
              key={d.codigo}
              fill={COLOR_SERIE_1}
              fillOpacity={!seleccionado || seleccionado === d.codigo ? 1 : 0.35}
            />
          ))}
          <LabelList dataKey="total" position="right" fill={TINTA} fontSize={12} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Ranking del coordinador: barras apiladas confirmados + condicionales. */
export function RankingApilado({
  datos,
  alSeleccionar,
  animar = true,
}: {
  datos: FilaResultado[];
  alSeleccionar?: (codigo: string) => void;
  animar?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={alturaPara(datos.length) + 28}>
      <BarChart data={datos} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 8 }} barCategoryGap={6}>
        <CartesianGrid horizontal={false} stroke={GRILLA} />
        <XAxis type="number" allowDecimals={false} {...ejeProps} />
        <YAxis type="category" dataKey="codigo" width={64} {...ejeProps} />
        <Legend
          verticalAlign="top"
          align="left"
          iconType="square"
          wrapperStyle={{ fontSize: 12, paddingBottom: 8 }}
          formatter={(valor) => <span style={{ color: TINTA }}>{valor}</span>}
        />
        <Tooltip
          cursor={{ fill: 'rgba(42,120,214,0.08)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const f = payload[0].payload as FilaResultado;
            return (
              <CajaTooltip
                titulo={`${f.codigo} · ${f.nombre}`}
                filas={[
                  { color: COLOR_SERIE_1, etiqueta: 'Confirmados', valor: f.confirmados },
                  { color: COLOR_SERIE_2, etiqueta: 'Condicionales', valor: f.condicionales },
                  { etiqueta: 'Total', valor: f.total },
                ]}
              />
            );
          }}
        />
        <Bar
          isAnimationActive={animar}
          dataKey="confirmados"
          name="Confirmados"
          stackId="a"
          fill={COLOR_SERIE_1}
          stroke="#fff"
          strokeWidth={2}
          maxBarSize={22}
          onClick={(d: { codigo?: string }) => d.codigo && alSeleccionar?.(d.codigo)}
          className="cursor-pointer"
        />
        <Bar
          isAnimationActive={animar}
          dataKey="condicionales"
          name="Condicionales"
          stackId="a"
          fill={COLOR_SERIE_2}
          stroke="#fff"
          strokeWidth={2}
          radius={[0, 4, 4, 0]}
          maxBarSize={22}
          onClick={(d: { codigo?: string }) => d.codigo && alSeleccionar?.(d.codigo)}
          className="cursor-pointer"
        >
          <LabelList dataKey="total" position="right" fill={TINTA} fontSize={12} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Distribución de los votos de un curso por franja. */
export function DistribucionFranjas({ franjas }: { franjas: ConteoFranjas }) {
  const datos = FRANJAS.map((f) => ({ ...f, votos: franjas[f.valor] }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={datos} margin={{ top: 20, right: 8, bottom: 4, left: -16 }}>
        <CartesianGrid vertical={false} stroke={GRILLA} />
        <XAxis dataKey="etiqueta" {...ejeProps} interval={0} />
        <YAxis allowDecimals={false} {...ejeProps} />
        <Tooltip
          cursor={{ fill: 'rgba(42,120,214,0.08)' }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <CajaTooltip
                titulo={`${payload[0].payload.etiqueta} (${payload[0].payload.horario})`}
                filas={[{ color: COLOR_SERIE_1, etiqueta: 'Votos', valor: payload[0].payload.votos }]}
              />
            ) : null
          }
        />
        <Bar dataKey="votos" fill={COLOR_SERIE_1} radius={[4, 4, 0, 0]} maxBarSize={48}>
          <LabelList dataKey="votos" position="top" fill={TINTA} fontSize={12} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function colorCelda(valor: number, maximo: number) {
  if (valor === 0 || maximo === 0) return { fondo: 'transparent', tinta: '#94a3b8' };
  const i = Math.min(RAMPA.length - 1, Math.round((valor / maximo) * (RAMPA.length - 1)));
  return { fondo: RAMPA[i], tinta: i >= 6 ? '#ffffff' : '#0b0b0b' };
}

/**
 * Mapa de calor curso × franja: filas = electivos con al menos un voto (ordenados por total),
 * columnas = 5 franjas. La intensidad es la cantidad de votos y cada celda muestra el número.
 */
export function MapaCalor({
  filas,
  alSeleccionar,
}: {
  filas: FilaResultado[];
  alSeleccionar?: (codigo: string) => void;
}) {
  const maximo = Math.max(0, ...filas.flatMap((f) => FRANJAS.map((x) => f.franjas[x.valor])));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-separate border-spacing-[2px] text-sm">
        <thead>
          <tr>
            <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Electivo
            </th>
            {FRANJAS.map((f) => (
              <th key={f.valor} className="px-1 py-2 text-center text-xs font-semibold text-muted-foreground">
                <div>{f.etiqueta}</div>
                <div className="font-normal">{f.horario}</div>
              </th>
            ))}
            <th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr
              key={fila.codigo}
              className={cn('group', alSeleccionar && 'cursor-pointer')}
              onClick={() => alSeleccionar?.(fila.codigo)}
            >
              <td className="max-w-[280px] rounded px-2 py-1.5 group-hover:bg-muted">
                <span className="font-mono text-xs font-semibold">{fila.codigo}</span>{' '}
                <span className="text-muted-foreground">{fila.nombre}</span>
              </td>
              {FRANJAS.map((f) => {
                const valor = fila.franjas[f.valor];
                const { fondo, tinta } = colorCelda(valor, maximo);
                return (
                  <td
                    key={f.valor}
                    className="h-9 rounded text-center font-semibold tabular-nums ring-inset group-hover:ring-1 group-hover:ring-slate-300"
                    style={{ background: fondo, color: tinta }}
                    title={`${fila.codigo} · ${f.etiqueta} (${f.horario}): ${valor} voto${valor === 1 ? '' : 's'}`}
                  >
                    {valor}
                  </td>
                );
              })}
              <td className="text-center font-semibold tabular-nums">{fila.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <span>0</span>
        <div className="flex h-2.5 w-40 overflow-hidden rounded">
          {RAMPA.map((c) => (
            <span key={c} className="flex-1" style={{ background: c }} />
          ))}
        </div>
        <span>{maximo} votos</span>
      </div>
    </div>
  );
}

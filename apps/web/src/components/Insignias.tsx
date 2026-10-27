import { CheckCircle2, CircleDashed, Clock, Lock, Radio } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { ETIQUETA_ESTADO, FRANJAS, etiquetaFranja } from '@/lib/formato';
import type { Aptitud, EstadoProceso, Franja, ResultadoElegibilidad } from '@/lib/tipos';
import { cn } from '@/lib/utils';

/** Texto corto para el badge de aptitud del alumno (sección 11). */
export function textoAptitud(e: ResultadoElegibilidad): string {
  return e.aptitud === 'CONFIRMADO' ? 'Apto' : 'No apto';
}

export function AptitudBadge({ elegibilidad, className }: { elegibilidad: ResultadoElegibilidad; className?: string }) {
  const variante = { CONFIRMADO: 'success', CONDICIONAL: 'warning', NO_APTO: 'muted' } as const;
  const Icono = { CONFIRMADO: CheckCircle2, CONDICIONAL: Clock, NO_APTO: Lock }[elegibilidad.aptitud];
  const etiqueta = (
    <Badge variant={variante[elegibilidad.aptitud]} className={className}>
      <Icono aria-hidden />
      {textoAptitud(elegibilidad)}
    </Badge>
  );
  if (elegibilidad.aptitud === 'CONDICIONAL') {
    const pendientes = [...elegibilidad.cursosEnCursoNecesarios];
    if (elegibilidad.dependeDeCreditosEnCurso) pendientes.push('los créditos de tus cursos en curso');
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex cursor-help">
            {etiqueta}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p>
            Debes aprobar {pendientes.join(' y ') || 'los requisitos que estás cursando'}. Puedes emitir un voto
            condicional.
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }
  return etiqueta;
}

/** Aptitud guardada como snapshot en el voto. */
export function AptitudSnapshot({ aptitud }: { aptitud: Aptitud }) {
  if (aptitud === 'CONFIRMADO')
    return (
      <Badge variant="success">
        <CheckCircle2 aria-hidden /> Confirmado
      </Badge>
    );
  if (aptitud === 'CONDICIONAL')
    return (
      <Badge variant="warning">
        <Clock aria-hidden /> Condicional
      </Badge>
    );
  return <Badge variant="muted">No apto</Badge>;
}

export function EstadoProcesoBadge({ estado }: { estado: EstadoProceso }) {
  const variante = { BORRADOR: 'secondary', ABIERTO: 'success', CERRADO: 'muted' } as const;
  const Icono = { BORRADOR: CircleDashed, ABIERTO: Radio, CERRADO: Lock }[estado];
  return (
    <Badge variant={variante[estado]}>
      <Icono aria-hidden /> {ETIQUETA_ESTADO[estado]}
    </Badge>
  );
}

export function FranjasTexto({ franjas, className }: { franjas: Franja[]; className?: string }) {
  return (
    <span className={cn('inline-flex flex-wrap gap-1', className)}>
      {franjas.map((f) => (
        <Badge key={f} variant="info" title={FRANJAS.find((x) => x.valor === f)?.horario}>
          {etiquetaFranja(f)}
        </Badge>
      ))}
    </span>
  );
}

export function EnVivo({ conectado }: { conectado: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
      <span className={cn('h-2 w-2 rounded-full', conectado ? 'animate-pulse bg-emerald-500' : 'bg-slate-400')} />
      {conectado ? 'En vivo' : 'Sin conexión en vivo'}
    </span>
  );
}

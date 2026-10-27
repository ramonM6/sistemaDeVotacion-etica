import { BadgeCheck, CheckCircle2, CircleDashed, ClipboardCheck, MinusCircle, XCircle, Ban } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const ESTADOS = {
  PENDIENTE: { texto: 'Pendiente', color: 'border-amber-200 bg-amber-50 text-amber-900', icono: CircleDashed },
  SELECCIONADO_PARA_REVISION: {
    texto: 'Seleccionado para revisión',
    color: 'border-blue-200 bg-blue-50 text-blue-800',
    icono: ClipboardCheck,
  },
  NO_SELECCIONADO: {
    texto: 'No seleccionado',
    color: 'border-slate-300 bg-slate-100 text-slate-700',
    icono: MinusCircle,
  },
  APROBADO: { texto: 'Aprobado', color: 'border-emerald-200 bg-emerald-50 text-emerald-800', icono: CheckCircle2 },
  NO_APROBADO: { texto: 'No aprobado', color: 'border-orange-200 bg-orange-50 text-orange-900', icono: XCircle },
  CONFIRMADO: { texto: 'Confirmado', color: 'border-violet-200 bg-violet-50 text-violet-800', icono: BadgeCheck },
  NO_SE_DICTARA: { texto: 'No se dictará', color: 'border-rose-200 bg-rose-50 text-rose-800', icono: Ban },
} as const;

export function EstadoCursoBadge({ estado, texto }: { estado?: string; texto?: string }) {
  const config = ESTADOS[estado as keyof typeof ESTADOS] ?? ESTADOS.PENDIENTE;
  const Icono = config.icono;
  return (
    <Badge variant="outline" className={`${config.color} gap-1.5 py-1`}>
      <Icono aria-hidden className="shrink-0" />
      {texto ?? config.texto}
    </Badge>
  );
}

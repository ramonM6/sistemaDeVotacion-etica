import { Link, useNavigate } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, Loader2, Plus, Users, Vote } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Cargando, ErrorCarga, Titulo, Vacio } from '@/components/Estados';
import { EstadoProcesoBadge } from '@/components/Insignias';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { aInputFecha, formatearFecha } from '@/lib/formato';
import type { Proceso } from '@/lib/tipos';

const esquema = z
  .object({
    nombre: z.string().trim().min(3, 'Mínimo 3 caracteres').max(120),
    cicloActual: z
      .string()
      .regex(/^\d{4}-[0-2]$/, 'Formato AAAA-N')
      .or(z.literal(''))
      .optional(),
    cicloObjetivo: z.string().regex(/^\d{4}-[0-2]$/, 'Formato AAAA-N, por ejemplo 2027-1'),
    fechaInicio: z.string().min(1, 'Requerido'),
    fechaFin: z.string().min(1, 'Requerido'),
    maxCursos: z.coerce.number().int().min(1).max(5),
    maxFranjas: z.coerce.number().int().min(1).max(2),
  })
  .refine((d) => new Date(d.fechaFin) > new Date(d.fechaInicio), {
    path: ['fechaFin'],
    message: 'Debe ser posterior al inicio',
  });
type Datos = z.infer<typeof esquema>;

export function FormularioProceso({
  proceso,
  alTerminar,
  alCancelar,
}: {
  proceso: Proceso | null;
  alTerminar: (proceso: Proceso) => void;
  alCancelar: () => void;
}) {
  const queryClient = useQueryClient();
  const ahora = new Date();
  const { register, handleSubmit, formState } = useForm<Datos>({
    resolver: zodResolver(esquema),
    defaultValues: proceso
      ? {
          nombre: proceso.nombre,
          cicloObjetivo: proceso.cicloObjetivo,
          cicloActual: proceso.cicloActual ?? '',
          fechaInicio: aInputFecha(proceso.fechaInicio),
          fechaFin: aInputFecha(proceso.fechaFin),
          maxCursos: proceso.maxCursos,
          maxFranjas: proceso.maxFranjas,
        }
      : {
          nombre: '',
          cicloObjetivo: '',
          cicloActual: '',
          fechaInicio: aInputFecha(ahora),
          fechaFin: aInputFecha(new Date(ahora.getTime() + 7 * 86_400_000)),
          maxCursos: 5,
          maxFranjas: 2,
        },
  });

  const guardar = useMutation({
    mutationFn: (d: Datos) => {
      const datos = {
        ...d,
        cicloActual: d.cicloActual || undefined,
        fechaInicio:
          proceso && proceso.estado !== 'BORRADOR' ? proceso.fechaInicio : new Date(d.fechaInicio).toISOString(),
        fechaFin: new Date(d.fechaFin).toISOString(),
      };
      return proceso ? api.editarProceso(proceso.id, datos) : api.crearProceso(datos);
    },
    onSuccess: (guardado) => {
      toast.success(proceso ? 'Proceso actualizado' : 'Proceso creado en borrador');
      queryClient.invalidateQueries({ queryKey: ['coord'] });
      alTerminar(guardado);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const campo = (id: keyof Datos, etiqueta: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{etiqueta}</Label>
      <Input id={id} {...props} {...register(id)} />
      {formState.errors[id] && <p className="text-xs text-destructive">{formState.errors[id]?.message}</p>}
    </div>
  );

  return (
    <form onSubmit={handleSubmit((d) => guardar.mutate(d))} className="space-y-4" noValidate>
      {campo('nombre', 'Nombre', { placeholder: 'Electivos 2027-1' })}
      {campo('cicloActual', 'Ciclo actual', {
        placeholder: '2026-2',
        readOnly: !!proceso && proceso.estado !== 'BORRADOR',
      })}
      {campo('cicloObjetivo', 'Ciclo objetivo', {
        placeholder: '2027-1',
        readOnly: !!proceso && proceso.estado !== 'BORRADOR',
      })}
      <div className="grid gap-4 sm:grid-cols-2">
        {campo('fechaInicio', 'Inicio', { type: 'datetime-local' })}
        {campo('fechaFin', 'Fin (cierre automático)', { type: 'datetime-local' })}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {campo('maxCursos', 'Máximo de cursos por alumno', {
          type: 'number',
          min: 1,
          max: 5,
          readOnly: !!proceso && proceso.estado !== 'BORRADOR',
        })}
        {campo('maxFranjas', 'Máximo de franjas por voto', {
          type: 'number',
          min: 1,
          max: 2,
          readOnly: !!proceso && proceso.estado !== 'BORRADOR',
        })}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={alCancelar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={guardar.isPending}>
          {guardar.isPending && <Loader2 className="animate-spin" />}
          Guardar
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function Procesos() {
  const navigate = useNavigate();
  const procesos = useQuery({ queryKey: ['coord', 'procesos'], queryFn: api.procesos, refetchInterval: 30_000 });
  const [creando, setCreando] = useState(false);
  if (procesos.isLoading) return <Cargando />;
  if (procesos.error) return <ErrorCarga error={procesos.error} />;
  return (
    <div className="space-y-6">
      <Titulo
        titulo="Votaciones"
        descripcion="Elige una votación para revisar sus resultados, administrar sus datos y decidir los estados de sus cursos."
        acciones={
          <Button onClick={() => setCreando(true)}>
            <Plus /> Nueva votación
          </Button>
        }
      />
      {!procesos.data!.length ? (
        <Vacio>Aún no hay votaciones. Crea la primera para empezar.</Vacio>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {procesos.data!.map((p) => (
            <Link
              key={p.id}
              to={`/coord/votaciones/${p.id}`}
              className="group overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div
                className={`relative flex h-32 items-end justify-between overflow-hidden p-5 ${p.estado === 'ABIERTO' ? 'bg-blue-700' : p.estado === 'CERRADO' ? 'bg-slate-700' : 'bg-teal-700'}`}
              >
                <div className="absolute -right-5 -top-9 h-40 w-40 rounded-full border-[22px] border-white/10" />
                <div className="relative">
                  <p className="text-xs font-semibold uppercase tracking-wider text-white/75">Votación de electivos</p>
                  <p className="mt-1 text-3xl font-bold text-white">{p.cicloObjetivo}</p>
                </div>
                <Vote className="relative h-9 w-9 text-white/80" />
              </div>
              <div className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold leading-snug group-hover:text-primary">{p.nombre}</h2>
                  <EstadoProcesoBadge estado={p.estado} />
                </div>
                <p className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {formatearFecha(p.fechaInicio)}
                    <br />
                    hasta {formatearFecha(p.fechaFin)}
                  </span>
                </p>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Users className="h-4 w-4" />
                    {p._count?.padron ?? 0} alumnos
                  </span>
                  <span>{p._count?.votos ?? 0} votos</span>
                </div>
                <div className="flex items-center justify-between border-t pt-4 text-sm font-semibold text-primary">
                  <span>Entrar a la votación</span>
                  <ArrowRight className="h-4 w-4" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      <Dialog open={creando} onOpenChange={setCreando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva votación</DialogTitle>
            <DialogDescription>Se creará en borrador para preparar sus datos antes de abrirla.</DialogDescription>
          </DialogHeader>
          <FormularioProceso
            proceso={null}
            alCancelar={() => setCreando(false)}
            alTerminar={(p) => {
              setCreando(false);
              navigate(`/coord/votaciones/${p.id}`);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

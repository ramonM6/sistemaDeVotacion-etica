import { Link } from 'react-router-dom';
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
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { aInputFecha, formatearFecha } from '@/lib/formato';
import type { Proceso, TipoImportacion } from '@/lib/tipos';

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
  alTerminar: (proceso: Proceso, archivos?: Partial<Record<TipoImportacion, File>>) => void;
  alCancelar: () => void;
}) {
  const [archivos, setArchivos] = useState<Partial<Record<TipoImportacion, File>>>({});
  const [fuentes, setFuentes] = useState<{ malla?: string; cuentas?: string; historial?: string }>({});
  const anteriores = useQuery({ queryKey: ['coord', 'procesos'], queryFn: api.procesos, enabled: !proceso });
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
        ...(!proceso ? { reutilizar: fuentes } : {}),
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
      alTerminar(guardado, archivos);
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
      {!proceso && (
        <fieldset className="space-y-3 rounded-lg border p-4">
          <legend className="px-1 text-sm font-semibold">Archivos de la votación</legend>
          <p className="text-xs text-muted-foreground">
            Sube un CSV o Excel (.xlsx), máximo 5 MB, o reutiliza los datos y el archivo disponible de una votación
            anterior. Al guardar podrás revisar y confirmar cada importación: malla, cuentas y luego historial.
          </p>
          {(
            [
              ['malla', 'Malla curricular del ciclo actual'],
              ['cuentas', 'Cuentas y datos de los estudiantes'],
              ['historial', 'Información académica de los estudiantes'],
            ] as const
          ).map(([tipo, titulo]) => (
            <div key={tipo} className="space-y-1">
              <Label htmlFor={`nuevo-${tipo}`}>{titulo}</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={fuentes[tipo] === undefined ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFuentes((prev) => ({ ...prev, [tipo]: undefined }))}
                >
                  Subir archivo nuevo
                </Button>
                <Button
                  type="button"
                  variant={fuentes[tipo] !== undefined ? 'default' : 'outline'}
                  size="sm"
                  disabled={anteriores.isLoading}
                  onClick={() => {
                    setArchivos((prev) => ({ ...prev, [tipo]: undefined }));
                    setFuentes((prev) => ({ ...prev, [tipo]: '' }));
                  }}
                >
                  Reutilizar {tipo === 'malla' ? 'malla' : tipo === 'cuentas' ? 'cuentas' : 'historial'}
                </Button>
              </div>
              {fuentes[tipo] !== undefined ? (
                <>
                  <Select
                    id={`nuevo-${tipo}`}
                    aria-label={`Votación de origen para ${tipo}`}
                    value={fuentes[tipo]}
                    onChange={(event) => setFuentes((prev) => ({ ...prev, [tipo]: event.target.value }))}
                  >
                    <option value="">Selecciona una votación anterior</option>
                    {anteriores.data
                      ?.filter((p) =>
                        tipo === 'malla'
                          ? !!p.catalogo?.length
                          : tipo === 'cuentas'
                            ? (p._count?.padron ?? 0) > 0
                            : (p._count?.historial ?? 0) > 0,
                      )
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre} · {p.cicloObjetivo}
                        </option>
                      ))}
                  </Select>
                  {anteriores.error && (
                    <p className="text-xs text-destructive">No se pudieron cargar las votaciones anteriores.</p>
                  )}
                  {tipo === 'historial' && (
                    <p className="text-xs text-muted-foreground">
                      El historial necesita las cuentas de todos sus alumnos. Reutiliza un padrón compatible; si subirás
                      cuentas nuevas, importa el historial después.
                    </p>
                  )}
                </>
              ) : (
                <Input
                  key={`archivo-${tipo}`}
                  id={`nuevo-${tipo}`}
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={(event) => {
                    const archivo = event.target.files?.[0];
                    if (archivo && (!/\.(xlsx|csv)$/i.test(archivo.name) || archivo.size > 5 * 1024 * 1024)) {
                      event.target.value = '';
                      toast.error('Usa un archivo CSV o Excel (.xlsx) de máximo 5 MB');
                      return;
                    }
                    setArchivos((prev) => ({ ...prev, [tipo]: archivo }));
                  }}
                />
              )}
            </div>
          ))}
        </fieldset>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={alCancelar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={guardar.isPending || Object.values(fuentes).some((valor) => valor === '')}>
          {guardar.isPending && <Loader2 className="animate-spin" />}
          Guardar
        </Button>
      </div>
    </form>
  );
}

export default function Procesos() {
  const procesos = useQuery({ queryKey: ['coord', 'procesos'], queryFn: api.procesos, refetchInterval: 30_000 });
  if (procesos.isLoading) return <Cargando />;
  if (procesos.error) return <ErrorCarga error={procesos.error} />;
  return (
    <div className="space-y-6">
      <Titulo
        titulo="Votaciones"
        descripcion="Elige una votación para revisar sus resultados, administrar sus datos y decidir los estados de sus cursos."
        acciones={
          <Button asChild>
            <Link to="/coord/nueva-votacion">
              <Plus /> Nueva votación
            </Link>
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
    </div>
  );
}

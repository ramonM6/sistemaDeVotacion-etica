import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Cargando, ErrorCarga } from '@/components/Estados';
import { AptitudBadge, AptitudSnapshot, FranjasTexto } from '@/components/Insignias';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { FRANJAS, etiquetaFranja, formatearCreditos, formatearFecha, textoCreditos } from '@/lib/formato';
import type { Franja } from '@/lib/tipos';
import { cn } from '@/lib/utils';
import { EtiquetaPropia } from './Catalogo';
import { useEstadoAlumno, useVotacionAlumno } from './LayoutAlumno';

export default function DetalleElectivo() {
  const { procesoId, rutaProceso } = useVotacionAlumno();
  const { codigo = '' } = useParams();
  const queryClient = useQueryClient();
  const estado = useEstadoAlumno();
  const consulta = useQuery({
    queryKey: ['alumno', procesoId, 'electivo', codigo],
    queryFn: () => api.electivo(codigo, procesoId),
  });
  const [franjas, setFranjas] = useState<Franja[]>([]);
  const [confirmando, setConfirmando] = useState(false);

  const votar = useMutation({
    mutationFn: () => api.votar(codigo, franjas, procesoId),
    onSuccess: (v) => {
      toast.success(`Voto registrado: ${v.cursoCodigo} (${v.franjas.map(etiquetaFranja).join(', ')})`);
      setConfirmando(false);
      setFranjas([]);
      queryClient.invalidateQueries({ queryKey: ['alumno'] });
    },
    onError: (e: Error) => {
      setConfirmando(false);
      toast.error(e.message);
      queryClient.invalidateQueries({ queryKey: ['alumno'] });
    },
  });

  if (consulta.isLoading || estado.isLoading) return <Cargando />;
  if (consulta.error) return <ErrorCarga error={consulta.error} />;
  const el = consulta.data!;
  const e = estado.data;
  const maxFranjas = e?.maxFranjas ?? 2;
  const noApto = el.elegibilidad.aptitud === 'NO_APTO';
  const sinVotos = !!e && e.votosUsados >= e.maxCursos;
  const puedeVotar = !!e?.puedeVotar && !noApto && !el.voto;

  const alternar = (f: Franja) =>
    setFranjas((actual) =>
      actual.includes(f) ? actual.filter((x) => x !== f) : actual.length < maxFranjas ? [...actual, f] : actual,
    );

  let motivo: string | null = null;
  if (el.voto) motivo = null;
  else if (!e?.abierto) motivo = 'La votación no está abierta.';
  else if (!e.terminos.aceptados) motivo = 'Debes aceptar los términos de participación.';
  else if (sinVotos) motivo = `Ya usaste tus ${e.maxCursos} votos.`;
  else if (noApto) motivo = 'No cumples los requisitos de este electivo.';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-3">
        <Link to={`${rutaProceso}/catalogo`}>
          <ArrowLeft /> Volver al catálogo
        </Link>
      </Button>

      <div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="font-mono font-semibold text-foreground">{el.codigo}</span>
          <span>· {textoCreditos(el.creditos)}</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{el.nombre}</h1>
        {!!el.dependencias?.length && (
          <p className="mt-2 text-sm">
            Se añadirán también los electivos requeridos en simultáneo que no hayas elegido:{' '}
            {el.dependencias.join(', ')}. Cuentan dentro del máximo de 5 y tendrán las mismas franjas iniciales.
          </p>
        )}
        {el.avisos?.map((a) => (
          <p key={a} className="mt-2 text-sm text-amber-700">
            {a}
          </p>
        ))}
        <div className="mt-3 flex flex-wrap gap-2">
          <AptitudBadge elegibilidad={el.elegibilidad} />
          {el.voto && <Badge>Votado</Badge>}
          <EtiquetaPropia estado={el.estadoPropio} />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-5">
        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Descripción</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line text-sm leading-relaxed">
              {el.descripcion || (
                <span className="italic text-muted-foreground">La coordinación aún no ha añadido una descripción.</span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Requisitos</CardTitle>
            <CardDescription>{el.requisitosTexto || 'Sin requisitos'}</CardDescription>
          </CardHeader>
          <CardContent>
            {el.elegibilidad.requisitos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Este electivo no tiene requisitos.</p>
            ) : (
              <ul className="space-y-3">
                {el.elegibilidad.requisitos.map((r) => {
                  const Icono = !r.cumple ? XCircle : r.dependeDeEnCurso ? Clock : CheckCircle2;
                  return (
                    <li key={r.termino} className="flex gap-2 text-sm">
                      <Icono
                        className={cn(
                          'mt-0.5 h-4 w-4 shrink-0',
                          !r.cumple ? 'text-red-600' : r.dependeDeEnCurso ? 'text-amber-600' : 'text-emerald-600',
                        )}
                        aria-label={!r.cumple ? 'No cumple' : r.dependeDeEnCurso ? 'En curso' : 'Cumple'}
                      />
                      <div>
                        <div className="font-mono text-xs font-semibold">
                          {r.termino}
                          {r.dependeDeEnCurso && (
                            <span className="ml-2 font-sans font-normal text-amber-700">en curso</span>
                          )}
                        </div>
                        <div className="text-muted-foreground">{r.detalle}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
              Tus créditos: {formatearCreditos(el.creditosAlumno.aprobados)} aprobados ·{' '}
              {formatearCreditos(el.creditosAlumno.enCurso)} en curso
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{el.voto ? 'Tu voto' : 'Votar por este electivo'}</CardTitle>
          {!el.voto && (
            <CardDescription>
              Elige de 1 a {maxFranjas} franjas horarias preferidas. La franja aplica a todas las sesiones semanales del
              curso.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {el.voto ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <FranjasTexto franjas={el.voto.franjas} />
              <AptitudSnapshot aptitud={el.voto.aptitud} />
              <span className="text-muted-foreground">Registrado el {formatearFecha(el.voto.createdAt)}</span>
              {e?.abierto && (
                <Link className="text-primary underline" to={`${rutaProceso}/votos`}>
                  Editar o retirar en Mis votos
                </Link>
              )}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Franjas horarias">
                {FRANJAS.map((f) => {
                  const activa = franjas.includes(f.valor);
                  const bloqueada = !activa && franjas.length >= maxFranjas;
                  return (
                    <button
                      key={f.valor}
                      type="button"
                      onClick={() => alternar(f.valor)}
                      disabled={!puedeVotar || bloqueada}
                      aria-pressed={activa}
                      className={cn(
                        'flex min-w-[130px] flex-col items-start rounded-lg border px-4 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                        activa
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'bg-background hover:border-primary/50 hover:bg-accent',
                      )}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-semibold">
                        {activa && <Check className="h-3.5 w-3.5" aria-hidden />}
                        {f.etiqueta}
                      </span>
                      <span className={cn('text-xs', activa ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                        {f.horario}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button disabled={!puedeVotar || franjas.length === 0} onClick={() => setConfirmando(true)}>
                  Votar
                </Button>
                <span className="text-sm text-muted-foreground">
                  {motivo ?? `${franjas.length} de ${maxFranjas} franjas elegidas`}
                </span>
              </div>
              {el.elegibilidad.aptitud === 'CONDICIONAL' && puedeVotar && (
                <Alert variant="warning" className="mt-4">
                  <AlertDescription>
                    Tu aptitud es condicional: al votar te comprometes a aprobar los cursos que estás llevando y que son
                    requisito.
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmando} onOpenChange={(v) => !votar.isPending && setConfirmando(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden /> Confirmar voto
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="font-medium text-foreground">
                  Podrás modificar o retirar tu voto mientras la votación esté abierta. Si requiere otros electivos en
                  simultáneo, también se añadirán y contarán dentro del máximo de 5.
                </p>
                <p>
                  <span className="font-mono">{el.codigo}</span> · {el.nombre}
                </p>
                <p>
                  Franjas: <FranjasTexto franjas={franjas} />
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={votar.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={votar.isPending}
              onClick={(ev) => {
                ev.preventDefault();
                votar.mutate();
              }}
            >
              {votar.isPending && <Loader2 className="animate-spin" />}
              Confirmar voto
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

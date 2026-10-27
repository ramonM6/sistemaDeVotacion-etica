import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Cargando, ErrorCarga } from '@/components/Estados';
import { AptitudBadge, AptitudSnapshot, FranjasTexto } from '@/components/Insignias';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { ETIQUETA_TIPO, formatearCreditos } from '@/lib/formato';
import { cn } from '@/lib/utils';
import { useProcesoSeleccionado } from './LayoutCoord';

/** Historial, créditos y aptitud por electivo: sirve para verificar el motor de requisitos. */
export default function DetalleAlumno() {
  const { codigo = '' } = useParams();
  const { procesoId, rutaProceso } = useProcesoSeleccionado();
  const consulta = useQuery({
    queryKey: ['coord', 'padron', procesoId, codigo],
    queryFn: () => api.detalleAlumno(codigo, procesoId),
  });

  if (consulta.isLoading) return <Cargando />;
  if (consulta.error) return <ErrorCarga error={consulta.error} />;
  const d = consulta.data!;
  const conteo = { CONFIRMADO: 0, CONDICIONAL: 0, NO_APTO: 0 };
  for (const e of d.electivos) conteo[e.elegibilidad.aptitud]++;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-3">
        <Link to={`${rutaProceso}/padron`}>
          <ArrowLeft /> Volver al padrón
        </Link>
      </Button>
      <div>
        <p className="font-mono text-sm text-muted-foreground">{d.alumno.codigo}</p>
        <h1 className="text-2xl font-bold tracking-tight">
          {d.alumno.nombres} {d.alumno.apellidos}
        </h1>
        <p className="text-sm text-muted-foreground">
          {d.alumno.correo ?? 'Sin correo'} · {d.proceso.nombre}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Créditos aprobados', formatearCreditos(d.creditos.aprobados)],
          ['Créditos en curso', formatearCreditos(d.creditos.enCurso)],
          ['Electivos aptos', `${conteo.CONFIRMADO} + ${conteo.CONDICIONAL} cond.`],
          ['Electivos no aptos', conteo.NO_APTO],
        ].map(([t, v]) => (
          <Card key={t}>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{t}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{v}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aptitud por electivo</CardTitle>
            <CardDescription>Calculada al vuelo con el historial actual.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Electivo</TableHead>
                  <TableHead>Aptitud</TableHead>
                  <TableHead>Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.electivos.map((e) => (
                  <TableRow
                    key={e.codigo}
                    className={cn(e.elegibilidad.aptitud === 'NO_APTO' && 'text-muted-foreground')}
                  >
                    <TableCell>
                      <span className="font-mono text-xs font-semibold">{e.codigo}</span>
                      <div className="text-xs">{e.nombre}</div>
                    </TableCell>
                    <TableCell className="space-y-1">
                      <AptitudBadge elegibilidad={e.elegibilidad} />
                      {e.voto && (
                        <div className="flex flex-wrap items-center gap-1 text-xs">
                          Votó: <AptitudSnapshot aptitud={e.voto.aptitud} /> <FranjasTexto franjas={e.voto.franjas} />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {e.elegibilidad.requisitos.length === 0
                        ? 'Sin requisitos'
                        : e.elegibilidad.requisitos.map((r) => (
                            <p
                              key={r.termino}
                              className={cn(!r.cumple ? 'text-red-700' : r.dependeDeEnCurso ? 'text-amber-800' : '')}
                            >
                              <span className="font-mono">{r.termino}</span>: {r.detalle}
                            </p>
                          ))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="xl:self-start">
          <CardHeader>
            <CardTitle className="text-base">Historial académico</CardTitle>
            <CardDescription>Nota máxima por curso; vacía = en curso.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Curso</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead>Créditos</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.historial.map((h) => (
                  <TableRow key={h.cursoCodigo}>
                    <TableCell>
                      <span className="font-mono text-xs font-semibold">{h.cursoCodigo}</span>
                      <div className="text-xs text-muted-foreground">
                        {h.cursoNombre ?? 'Fuera del catálogo'}
                        {h.tipo && h.tipo !== 'OBLIGATORIO' && ` · ${ETIQUETA_TIPO[h.tipo]}`}
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {h.notas.map((n) => (n === null ? 'en curso' : n)).join(' → ')}
                    </TableCell>
                    <TableCell className="tabular-nums">{h.enCatalogo ? formatearCreditos(h.creditos) : '0'}</TableCell>
                    <TableCell>
                      {h.aprobado ? (
                        <Badge variant="success">Aprobado</Badge>
                      ) : h.enCurso ? (
                        <Badge variant="info">En curso</Badge>
                      ) : (
                        <Badge variant="destructive">Desaprobado</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {d.historial.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                      Sin historial cargado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

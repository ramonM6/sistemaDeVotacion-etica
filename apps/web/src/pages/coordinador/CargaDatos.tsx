import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, XCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Titulo } from '@/components/Estados';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { PreviewImportacion, TipoImportacion } from '@/lib/tipos';
import { cn } from '@/lib/utils';
import { useProcesoSeleccionado } from './LayoutCoord';

const TARJETAS: { tipo: TipoImportacion; titulo: string; descripcion: string }[] = [
  {
    tipo: 'catalogo',
    titulo: 'Catálogo de cursos',
    descripcion: 'Hoja "cursos". Global: reemplaza el catálogo y conserva las descripciones editadas.',
  },
  {
    tipo: 'cuentas',
    titulo: 'Cuentas de alumnos',
    descripcion: 'Hoja "alumnos". Reemplaza el padrón del proceso: solo estos alumnos podrán entrar.',
  },
  {
    tipo: 'historial',
    titulo: 'Historial académico',
    descripcion: 'Hoja "historial". Reemplaza el historial del proceso. Nota vacía = en curso.',
  },
];

const MAX_BYTES = 5 * 1024 * 1024;

function valorCelda(v: unknown) {
  if (v === null || v === undefined || v === '') return <span className="text-muted-foreground">—</span>;
  return String(v);
}

function TablaPreview({ preview }: { preview: PreviewImportacion }) {
  const [soloProblemas, setSoloProblemas] = useState(preview.resumen.conErrores + preview.resumen.conAdvertencias > 0);
  const filas = soloProblemas ? preview.filas.filter((f) => f.errores.length || f.advertencias.length) : preview.filas;
  // Las claves de `datos` vienen normalizadas por el backend (p. ej. codigoAlumno).
  const claves = preview.filas[0] ? Object.keys(preview.filas[0].datos) : [];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Checkbox
          id={`solo-${preview.tipo}`}
          checked={soloProblemas}
          onCheckedChange={(v) => setSoloProblemas(v === true)}
        />
        <Label htmlFor={`solo-${preview.tipo}`} className="font-normal">
          Mostrar solo filas con errores o advertencias
        </Label>
      </div>
      <div className="max-h-[420px] overflow-auto rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 bg-white">
            <TableRow>
              <TableHead>Fila</TableHead>
              {claves.map((c) => (
                <TableHead key={c}>{c}</TableHead>
              ))}
              <TableHead>Observaciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((f) => (
              <TableRow
                key={f.fila}
                className={cn(
                  f.errores.length
                    ? 'bg-red-50 hover:bg-red-100'
                    : f.advertencias.length
                      ? 'bg-amber-50 hover:bg-amber-100'
                      : '',
                )}
              >
                <TableCell className="tabular-nums text-muted-foreground">{f.fila}</TableCell>
                {claves.map((c) => (
                  <TableCell key={c} className="max-w-[220px] truncate" title={String(f.datos[c] ?? '')}>
                    {valorCelda(f.datos[c])}
                  </TableCell>
                ))}
                <TableCell className="min-w-[240px] text-xs">
                  {f.errores.map((e) => (
                    <p key={e} className="flex gap-1 text-red-700">
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-label="Error" /> {e}
                    </p>
                  ))}
                  {f.advertencias.map((a) => (
                    <p key={a} className="flex gap-1 text-amber-800">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-label="Advertencia" /> {a}
                    </p>
                  ))}
                </TableCell>
              </TableRow>
            ))}
            {filas.length === 0 && (
              <TableRow>
                <TableCell colSpan={claves.length + 2} className="py-6 text-center text-muted-foreground">
                  No hay filas con observaciones.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function TarjetaImportacion({ tipo, titulo, descripcion }: (typeof TARJETAS)[number]) {
  const queryClient = useQueryClient();
  const { procesoId } = useProcesoSeleccionado();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<PreviewImportacion | null>(null);
  const [archivo, setArchivo] = useState<string | null>(null);

  const subir = useMutation({
    mutationFn: (f: File) => api.previewImportacion(tipo, f, procesoId),
    onSuccess: setPreview,
    onError: (e: Error) => {
      setPreview(null);
      toast.error(e.message);
    },
  });

  const confirmar = useMutation({
    mutationFn: () => api.confirmarImportacion(tipo, preview!.token!),
    onSuccess: () => {
      toast.success(`${titulo}: importación aplicada`);
      setPreview(null);
      setArchivo(null);
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const elegir = (f: File | undefined) => {
    if (!f) return;
    if (!/\.(xlsx|csv)$/i.test(f.name)) return toast.error('Solo se aceptan archivos .xlsx o .csv');
    if (f.size > MAX_BYTES) return toast.error('El archivo supera el máximo de 5 MB');
    setArchivo(f.name);
    subir.mutate(f);
  };

  const r = preview?.resumen;
  const hayErrores = !!preview && (preview.erroresGenerales.length > 0 || preview.resumen.conErrores > 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-5 w-5 text-emerald-700" aria-hidden /> {titulo}
            </CardTitle>
            <CardDescription>{descripcion}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={api.urlPlantilla(tipo)} download>
                <Download /> Plantilla
              </a>
            </Button>
            <Button size="sm" onClick={() => input.current?.click()} disabled={subir.isPending}>
              {subir.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
              Subir .xlsx o .csv
            </Button>
            <input
              ref={input}
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="hidden"
              onChange={(e) => {
                elegir(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
        </div>
      </CardHeader>
      {preview && r && (
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              <span className="font-medium">{archivo}</span>
              {preview.proceso && <span className="text-muted-foreground"> · proceso {preview.proceso.nombre}</span>}
              <br />
              <span className={cn('font-semibold', hayErrores ? 'text-red-700' : 'text-emerald-700')}>
                {r.validas} filas válidas, {r.conErrores} {r.conErrores === 1 ? 'error' : 'errores'}
              </span>
              {r.conAdvertencias > 0 && <span className="text-amber-800">, {r.conAdvertencias} con advertencias</span>}
              <span className="text-muted-foreground"> (de {r.total})</span>
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPreview(null)}>
                Descartar
              </Button>
              <Button disabled={hayErrores || !preview.token || confirmar.isPending} onClick={() => confirmar.mutate()}>
                {confirmar.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                Confirmar
              </Button>
            </div>
          </div>
          {preview.erroresGenerales.map((e) => (
            <Alert key={e} variant="destructive" className="py-2">
              <AlertDescription>{e}</AlertDescription>
            </Alert>
          ))}
          {preview.advertenciasGenerales.map((a) => (
            <Alert key={a} variant="warning" className="py-2">
              <AlertDescription>{a}</AlertDescription>
            </Alert>
          ))}
          {hayErrores && (
            <p className="text-xs text-muted-foreground">
              Corrige los errores en el Excel y vuelve a subirlo. No se guardó nada.
            </p>
          )}
          {preview.filas.length > 0 && <TablaPreview preview={preview} />}
        </CardContent>
      )}
    </Card>
  );
}

export default function CargaDatos() {
  const { procesoId } = useProcesoSeleccionado();
  const archivos = useQuery({ queryKey: ['coord', 'archivos', procesoId], queryFn: () => api.archivos(procesoId) });
  return (
    <div className="space-y-4">
      <Titulo
        titulo="Carga de datos"
        descripcion="Sube un Excel o CSV, revisa la vista previa y confirma. Padrón e historial solo se cargan antes de la primera apertura."
      />
      <p className="text-sm text-muted-foreground">
        Las cuentas admiten columnas opcionales ingreso (AAAA o AAAA.1/AAAA.2), craest (0–100) y matriculado (si/no). El
        catálogo cargado se reutiliza al abrir un nuevo proceso; cada proceso conserva una copia desde su primera
        apertura.
      </p>
      {TARJETAS.map((t) => (
        <TarjetaImportacion key={`${procesoId}-${t.tipo}`} {...t} />
      ))}
      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">Archivos importados</h2>
        {archivos.error && <p className="text-sm text-destructive">No se pudo cargar el historial de archivos.</p>}
        {archivos.data?.map((a) => (
          <div key={a.id} className="border-t pt-2 text-sm">
            <a className="text-primary underline" href={api.urlArchivo(a.id)} download>
              {a.nombre}
            </a>{' '}
            · {a.tipo} · {a.filas} filas · {new Date(a.createdAt).toLocaleString('es-PE', { timeZone: 'America/Lima' })}
            <p className="break-all font-mono text-xs text-muted-foreground">SHA-256: {a.sha256}</p>
          </div>
        ))}
        {archivos.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">Todavía no hay archivos confirmados.</p>
        )}
      </Card>
    </div>
  );
}

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Download, FileSpreadsheet, Loader2, Upload, XCircle, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Cargando, ErrorCarga, Titulo } from '@/components/Estados';
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

const TARJETAS: { tipo: 'malla' | 'cuentas' | 'historial'; titulo: string; descripcion: string }[] = [
  {
    tipo: 'malla',
    titulo: 'Malla curricular del ciclo actual',
    descripcion: 'Hoja "cursos" o CSV. Cursos, créditos y requisitos conservados para esta votación.',
  },
  {
    tipo: 'cuentas',
    titulo: 'Cuentas de alumnos',
    descripcion: 'Hoja "alumnos". Reemplaza el padrón del proceso: solo estos alumnos podrán entrar.',
  },
  {
    tipo: 'historial',
    titulo: 'Información académica de los estudiantes',
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

type TipoArchivo = (typeof TARJETAS)[number]['tipo'];
type EstadoCarga = { nombre: string; mensaje?: string; preview?: PreviewImportacion; advertencias?: string[] };

export default function CargaDatos() {
  const { procesoId } = useProcesoSeleccionado();
  return <DatosVotacion key={procesoId} />;
}

function DatosVotacion() {
  const { procesoId, rutaProceso, proceso, enPreparacion, cargandoProceso } = useProcesoSeleccionado();
  const ubicacion = useLocation();
  const navigate = useNavigate();
  const cliente = useQueryClient();
  const pendientes = useRef<Partial<Record<TipoImportacion, File>>>(
    (ubicacion.state as { archivosPreparacion?: Partial<Record<TipoImportacion, File>> } | null)?.archivosPreparacion ??
      {},
  );
  const iniciada = useRef(false);
  const operando = useRef(false);
  const [arrastrando, setArrastrando] = useState<TipoArchivo | null>(null);
  const [ocupado, setOcupado] = useState<TipoArchivo | null>(null);
  const [estados, setEstados] = useState<Partial<Record<TipoArchivo, EstadoCarga>>>({});
  const archivos = useQuery({ queryKey: ['coord', 'archivos', procesoId], queryFn: () => api.archivos(procesoId) });
  const procesar = useCallback(
    async (tipo: TipoArchivo, archivo: File) => {
      if (!procesoId || operando.current) return false;
      const error = !/\.(xlsx|csv)$/i.test(archivo.name)
        ? 'Solo se aceptan archivos CSV o Excel (.xlsx).'
        : archivo.size > MAX_BYTES
          ? 'El archivo supera el máximo de 5 MB.'
          : !archivo.size
            ? 'El archivo está vacío.'
            : null;
      if (error) {
        setEstados((prev) => ({ ...prev, [tipo]: { nombre: archivo.name, mensaje: error } }));
        return false;
      }
      operando.current = true;
      setOcupado(tipo);
      setEstados((prev) => ({ ...prev, [tipo]: { nombre: archivo.name } }));
      try {
        const preview = await api.previewImportacion(tipo, archivo, procesoId);
        if (!preview.token || preview.erroresGenerales.length || preview.resumen.conErrores) {
          setEstados((prev) => ({
            ...prev,
            [tipo]: {
              nombre: archivo.name,
              preview,
              mensaje: 'El archivo tiene errores de formato o datos. Corrígelos y vuelve a subirlo; no se guardó.',
            },
          }));
          return false;
        }
        await api.confirmarImportacion(tipo, preview.token);
        delete pendientes.current[tipo];
        setEstados((prev) => ({
          ...prev,
          [tipo]: {
            nombre: archivo.name,
            advertencias: [...preview.advertenciasGenerales, ...new Set(preview.filas.flatMap((f) => f.advertencias))],
          },
        }));
        await cliente.invalidateQueries({ queryKey: ['coord'] });
        toast.success('Archivo validado y guardado');
        return true;
      } catch (error) {
        setEstados((prev) => ({ ...prev, [tipo]: { nombre: archivo.name, mensaje: (error as Error).message } }));
        return false;
      } finally {
        operando.current = false;
        setOcupado(null);
      }
    },
    [procesoId, cliente],
  );
  useEffect(() => {
    if (!proceso || !enPreparacion || iniciada.current) return;
    iniciada.current = true;
    const lista = TARJETAS.filter((t) => pendientes.current[t.tipo]);
    if (!lista.length) return;
    // Se consumen una sola vez los adjuntos elegidos al crear el borrador.
    navigate(ubicacion.pathname, { replace: true, state: null });
    void (async () => {
      for (let i = 0; i < lista.length; i++) {
        const tipo = lista[i].tipo;
        if (!(await procesar(tipo, pendientes.current[tipo]!))) {
          for (const siguiente of lista.slice(i + 1))
            setEstados((prev) => ({
              ...prev,
              [siguiente.tipo]: {
                nombre: pendientes.current[siguiente.tipo]!.name,
                mensaje: 'Carga pendiente: corrige primero el archivo anterior y luego pulsa Reintentar.',
              },
            }));
          break;
        }
      }
    })();
  }, [proceso, enPreparacion, navigate, ubicacion.pathname, procesar]);
  const eliminar = async (tipo: TipoArchivo, conDatos: boolean) => {
    if (operando.current || !procesoId) return;
    if (!conDatos) {
      delete pendientes.current[tipo];
      setEstados((prev) => ({ ...prev, [tipo]: undefined }));
      return;
    }
    const mensaje =
      tipo === 'cuentas'
        ? '¿Eliminar las cuentas y el historial académico de esta votación? Luego podrás subir nuevos archivos.'
        : '¿Eliminar este archivo y sus datos de la votación para subir otro?';
    if (!window.confirm(mensaje)) return;
    operando.current = true;
    setOcupado(tipo);
    try {
      const resultado = await api.eliminarImportacion(tipo, procesoId);
      for (const t of resultado.tipos as TipoArchivo[]) {
        delete pendientes.current[t];
        setEstados((prev) => ({ ...prev, [t]: undefined }));
      }
      await cliente.invalidateQueries({ queryKey: ['coord'] });
      resultado.advertencias.forEach((a) => toast.warning(a));
      toast.success('Archivo retirado. Ya puedes subir otro.');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      operando.current = false;
      setOcupado(null);
    }
  };
  if (!proceso)
    return cargandoProceso ? (
      <Cargando />
    ) : (
      <ErrorCarga error={new Error('No se pudo cargar la votación. Vuelve al tablero.')} />
    );
  const electivos = proceso.catalogo?.filter((c) => c.tipo === 'ELECTIVO').length ?? 0;
  return (
    <div className="space-y-5">
      <Titulo
        titulo="Datos y archivos de la votación"
        descripcion={
          enPreparacion
            ? 'Sube tus archivos: se validan y guardan automáticamente. Puedes eliminarlos con × para subir otros.'
            : 'Consulta los archivos de esta votación. Las cargas se bloquean desde la primera apertura.'
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Malla de la votación</p>
          <p className="mt-2 text-2xl font-bold">
            {electivos} {electivos === 1 ? 'electivo' : 'electivos'}
          </p>
          <Link to={`${rutaProceso}/cursos/seleccion`} className="mt-2 inline-block text-sm text-primary underline">
            Consultar cursos
          </Link>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Alumnos en el padrón</p>
          <p className="mt-2 text-2xl font-bold">{proceso._count?.padron ?? 0}</p>
          <Link to={`${rutaProceso}/padron`} className="mt-2 inline-block text-sm text-primary underline">
            Consultar padrón
          </Link>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Historial académico</p>
          <p className="mt-2 text-2xl font-bold">{proceso._count?.historial ?? 0} registros</p>
        </Card>
      </div>
      {enPreparacion && (
        <p className="text-sm text-muted-foreground">
          CSV UTF-8 o Excel .xlsx, hasta 5 MB. Carga primero la malla, luego las cuentas y finalmente el historial. Se
          comprueban encabezados, tipos de datos y referencias de alumnos.
        </p>
      )}
      {archivos.isLoading ? (
        <Cargando />
      ) : archivos.error ? (
        <ErrorCarga error={archivos.error} />
      ) : (
        TARJETAS.map((t) => {
          const archivo = archivos.data?.find((a) => a.tipo === t.tipo);
          const datos =
            t.tipo === 'malla'
              ? (proceso.catalogo?.length ?? 0) > 0
              : t.tipo === 'cuentas'
                ? (proceso._count?.padron ?? 0) > 0
                : (proceso._count?.historial ?? 0) > 0;
          const presente = !!archivo || datos;
          const estado = estados[t.tipo];
          return (
            <Card
              key={t.tipo}
              className={cn(arrastrando === t.tipo && 'border-primary bg-primary/5 ring-2 ring-primary/20')}
              onDragOver={(ev) => {
                if (!ev.dataTransfer.types.includes('Files')) return;
                ev.preventDefault();
                ev.dataTransfer.dropEffect = enPreparacion && !presente && !ocupado ? 'copy' : 'none';
                if (enPreparacion && !presente && !ocupado) setArrastrando(t.tipo);
              }}
              onDragLeave={(ev) => {
                if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setArrastrando(null);
              }}
              onDrop={(ev) => {
                ev.preventDefault();
                setArrastrando(null);
                if (!enPreparacion || presente || operando.current) return;
                if (ev.dataTransfer.files.length !== 1) {
                  toast.error('Arrastra un solo archivo para esta sección.');
                  return;
                }
                void procesar(t.tipo, ev.dataTransfer.files[0]);
              }}
            >
              <CardHeader className="px-4 pb-1 pt-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <FileSpreadsheet className="h-4 w-4 text-emerald-700" aria-hidden />
                      {t.titulo}
                    </CardTitle>
                    {!presente && <CardDescription className="text-xs">{t.descripcion}</CardDescription>}
                  </div>
                  {enPreparacion && !presente && (
                    <Button asChild variant="outline" size="sm">
                      <a href={api.urlPlantilla(t.tipo)} download>
                        <Download /> Plantilla
                      </a>
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2 px-4 pb-3 pt-0">
                <div className="flex items-center justify-between gap-3 py-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    {archivo ? (
                      <>
                        <a
                          href={api.urlArchivo(archivo.id)}
                          download
                          className="break-all font-medium text-primary underline"
                        >
                          {archivo.nombre}
                        </a>
                        <p className="text-xs text-muted-foreground">
                          {archivo.filas} filas ·{' '}
                          {new Date(archivo.createdAt).toLocaleString('es-PE', { timeZone: 'America/Lima' })}
                        </p>
                      </>
                    ) : (
                      <p className="break-all">
                        {estado?.nombre ??
                          (datos ? 'Datos cargados sin archivo original disponible.' : 'Sin archivo cargado.')}
                      </p>
                    )}
                    {ocupado === t.tipo && (
                      <p role="status" className="mt-1 flex items-center gap-2 text-xs">
                        <Loader2 className="h-3 w-3 animate-spin" /> Validando y guardando…
                      </p>
                    )}
                  </div>
                  {enPreparacion && (presente || estado) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Eliminar ${t.titulo}`}
                      disabled={!!ocupado}
                      onClick={() => void eliminar(t.tipo, presente)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {enPreparacion && !presente && (
                  <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed p-3">
                    <label
                      className={cn(
                        'inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground',
                        ocupado && 'pointer-events-none opacity-50',
                      )}
                    >
                      <Upload className="h-4 w-4" />
                      Subir .xlsx o .csv
                      <input
                        type="file"
                        aria-label={`Subir ${t.titulo}`}
                        className="sr-only"
                        accept=".xlsx,.csv"
                        disabled={!!ocupado}
                        onChange={(ev) => {
                          const file = ev.target.files?.[0];
                          ev.target.value = '';
                          if (file) void procesar(t.tipo, file);
                        }}
                      />
                    </label>
                    <span className="text-xs text-muted-foreground">o arrastra aquí tu archivo CSV o Excel</span>
                    {pendientes.current[t.tipo] && estado?.mensaje && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!!ocupado}
                        onClick={() => void procesar(t.tipo, pendientes.current[t.tipo]!)}
                      >
                        Reintentar
                      </Button>
                    )}
                  </div>
                )}
                {estado?.mensaje && (
                  <Alert variant="destructive">
                    <AlertDescription>{estado.mensaje}</AlertDescription>
                  </Alert>
                )}
                {estado?.preview && (
                  <div className="space-y-3">
                    {estado.preview.erroresGenerales.map((error, i) => (
                      <p key={i} className="text-sm text-destructive">
                        {error}
                      </p>
                    ))}
                    {estado.preview.filas.length > 0 && <TablaPreview preview={estado.preview} />}
                  </div>
                )}
                {!!estado?.advertencias?.length && (
                  <details className="text-sm text-amber-800">
                    <summary>Archivo guardado con advertencias</summary>
                    <ul className="mt-2 list-disc pl-5">
                      {estado.advertencias.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}

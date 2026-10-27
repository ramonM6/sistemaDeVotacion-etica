import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Cargando, ErrorCarga, Titulo, Vacio } from '@/components/Estados';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { PreviewImportacion } from '@/lib/tipos';
import { cn } from '@/lib/utils';
import { TablaPreview } from './CargaDatos';

export default function Alumnos() {
  const cliente = useQueryClient();
  const consulta = useQuery({ queryKey: ['coord', 'alumnos'], queryFn: api.alumnos });
  const archivos = useQuery({ queryKey: ['coord', 'archivos-globales'], queryFn: () => api.archivos() });
  const [ocupado, setOcupado] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<PreviewImportacion | null>(null);
  const [advertencias, setAdvertencias] = useState<string[]>([]);
  async function subir(archivo: File) {
    if (ocupado) return;
    setError('');
    setPreview(null);
    setAdvertencias([]);
    if (!/\.(csv|xlsx)$/i.test(archivo.name)) {
      setError('Solo se aceptan archivos CSV o Excel (.xlsx).');
      return;
    }
    if (!archivo.size || archivo.size > 5 * 1024 * 1024) {
      setError('El archivo debe tener contenido y no superar 5 MB.');
      return;
    }
    setOcupado(true);
    try {
      const p = await api.previewImportacion('cuentas', archivo);
      if (!p.token || p.erroresGenerales.length || p.resumen.conErrores) {
        setPreview(p);
        setError('El archivo tiene errores. Corrígelo y vuelve a subirlo; no se guardó.');
        return;
      }
      await api.confirmarImportacion('cuentas', p.token);
      setAdvertencias([...p.advertenciasGenerales, ...new Set(p.filas.flatMap((f) => f.advertencias))]);
      await cliente.invalidateQueries({ queryKey: ['coord'] });
      toast.success('Cuentas de alumnos guardadas');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }
  const original = archivos.data?.find((a) => a.tipo === 'cuentas' && !a.procesoId);
  const q = busqueda.trim().toLowerCase();
  const alumnos =
    consulta.data?.filter((a) => !q || `${a.codigo} ${a.nombres} ${a.apellidos}`.toLowerCase().includes(q)) ?? [];
  return (
    <div className="space-y-6">
      <Titulo
        titulo="Alumnos"
        descripcion="Crea las cuentas de acceso desde un CSV o Excel. El historial de cada votación determina quién puede participar en ella."
      />
      <Card
        className={cn('space-y-3 border-dashed p-5', arrastrando && 'border-primary bg-primary/5')}
        onDragOver={(ev) => {
          ev.preventDefault();
          if (!ocupado) setArrastrando(true);
        }}
        onDragLeave={(ev) => {
          if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setArrastrando(false);
        }}
        onDrop={(ev) => {
          ev.preventDefault();
          setArrastrando(false);
          if (ev.dataTransfer.files.length !== 1) {
            setError('Arrastra un solo archivo.');
            return;
          }
          void subir(ev.dataTransfer.files[0]);
        }}
      >
        <p className="font-semibold">Importar cuentas de alumnos</p>
        <p className="text-sm text-muted-foreground">
          CSV o Excel .xlsx, hasta 5 MB. Crea cuentas nuevas y actualiza las del mismo código; los alumnos que no estén
          en el archivo conservan su cuenta. Esto no modifica las votaciones.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label
            className={cn(
              'inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground',
              ocupado && 'pointer-events-none opacity-50',
            )}
          >
            <Upload className="h-4 w-4" /> Subir .xlsx o .csv
            <input
              type="file"
              className="sr-only"
              aria-label="Subir cuentas de alumnos"
              accept=".xlsx,.csv"
              disabled={ocupado}
              onChange={(ev) => {
                const f = ev.target.files?.[0];
                ev.target.value = '';
                if (f) void subir(f);
              }}
            />
          </label>
          <span className="text-sm text-muted-foreground">o arrastra aquí el archivo</span>
          <Button asChild variant="outline" size="sm">
            <a href={api.urlPlantilla('cuentas')} download>
              <Download /> Plantilla
            </a>
          </Button>
          {ocupado && (
            <span role="status" className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Validando y guardando…
            </span>
          )}
        </div>
        {original && (
          <a href={api.urlArchivo(original.id)} download className="inline-block text-sm text-primary underline">
            Último archivo: {original.nombre}
          </a>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {preview && (
          <div className="space-y-2">
            {preview.erroresGenerales.map((e) => (
              <p key={e} className="text-sm text-destructive">
                {e}
              </p>
            ))}
            <TablaPreview preview={preview} />
          </div>
        )}
        {!!advertencias.length && (
          <ul className="list-disc pl-5 text-sm text-amber-800">
            {advertencias.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        )}
      </Card>
      <Input
        aria-label="Buscar alumno"
        placeholder="Buscar por código o nombre"
        value={busqueda}
        onChange={(ev) => setBusqueda(ev.target.value)}
      />
      {consulta.isLoading ? (
        <Cargando />
      ) : consulta.error ? (
        <ErrorCarga error={consulta.error} />
      ) : !alumnos.length ? (
        <Vacio>
          {q
            ? 'No hay alumnos que coincidan con la búsqueda.'
            : 'Aún no hay cuentas de alumnos. Sube un CSV o Excel para crearlas.'}
        </Vacio>
      ) : (
        <Card>
          <p className="px-4 pt-4 text-sm text-muted-foreground">{alumnos.length} alumnos</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Alumno</TableHead>
                <TableHead>Correo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alumnos.map((a) => (
                <TableRow key={a.codigo}>
                  <TableCell className="font-mono text-xs">{a.codigo}</TableCell>
                  <TableCell>
                    {a.apellidos}, {a.nombres}
                  </TableCell>
                  <TableCell>{a.correo || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

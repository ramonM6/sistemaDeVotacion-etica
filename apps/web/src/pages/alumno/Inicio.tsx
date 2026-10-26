import { useQueryClient } from '@tanstack/react-query';
import { BarChart3, BookOpen, ListChecks, Vote } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CuentaRegresiva } from '@/components/CuentaRegresiva';
import { Cargando, ErrorCarga } from '@/components/Estados';
import { EstadoProcesoBadge } from '@/components/Insignias';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatearFecha } from '@/lib/formato';
import { useResultadosEnVivo } from '@/lib/socket';
import { useEstadoAlumno } from './LayoutAlumno';

export default function Inicio() {
  const { usuario } = useAuth();
  const estado = useEstadoAlumno();
  const queryClient = useQueryClient();
  useResultadosEnVivo([['alumno', 'estado']]);

  if (estado.isLoading) return <Cargando />;
  // Sin padrón o sin proceso: el layout ya muestra el aviso.
  if (estado.error)
    return estado.error instanceof ApiError && estado.error.status < 500 ? null : <ErrorCarga error={estado.error} />;
  const e = estado.data!;
  const p = e.proceso;

  const accesos = [
    {
      a: '/alumno/catalogo',
      titulo: 'Catálogo de electivos',
      texto: 'Revisa tu aptitud y vota por hasta ' + e.maxCursos + ' electivos.',
      icono: BookOpen,
    },
    { a: '/alumno/votos', titulo: 'Mis votos', texto: 'Consulta los votos que ya registraste.', icono: ListChecks },
    {
      a: '/alumno/resultados',
      titulo: 'Resultados al cierre',
      texto: 'Ranking de electivos y franjas preferidas.',
      icono: BarChart3,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hola, {usuario?.nombres.split(' ')[0]}</h1>
        <p className="text-sm text-muted-foreground">
          Sondeo de demanda de electivos para el ciclo {p.cicloObjetivo}. Es referencial: no es una matrícula.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>{p.nombre}</CardTitle>
              <EstadoProcesoBadge estado={e.abierto ? 'ABIERTO' : p.estado === 'ABIERTO' ? 'CERRADO' : p.estado} />
            </div>
            <CardDescription>
              Del {formatearFecha(p.fechaInicio)} al {formatearFecha(p.fechaFin)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {e.abierto ? (
              <div>
                <p className="mb-2 text-sm text-muted-foreground">La votación cierra en</p>
                <CuentaRegresiva
                  hasta={p.fechaFin}
                  alTerminar={() => queryClient.invalidateQueries({ queryKey: ['alumno'] })}
                />
              </div>
            ) : (
              <Alert variant="info">
                <AlertDescription>
                  {p.estado === 'BORRADOR'
                    ? 'La votación aún no se ha abierto. Puedes revisar el catálogo en modo de solo lectura.'
                    : 'La votación está cerrada. Puedes revisar tus votos y los resultados en modo de solo lectura.'}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-2">
              <Vote className="h-4 w-4" aria-hidden /> Votos usados
            </CardDescription>
            <CardTitle className="text-4xl tabular-nums">
              {e.votosUsados} <span className="text-lg font-normal text-muted-foreground">de {e.maxCursos}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-1" aria-hidden>
              {Array.from({ length: e.maxCursos }, (_, i) => (
                <span key={i} className={`h-2 flex-1 rounded-full ${i < e.votosUsados ? 'bg-primary' : 'bg-muted'}`} />
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Cada voto incluye de 1 a {e.maxFranjas} franjas horarias. Puedes cambiar tus votos mientras la votación
              esté abierta.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {accesos.map(({ a, titulo, texto, icono: Icono }) => (
          <Link key={a} to={a} className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardHeader>
                <Icono className="h-5 w-5 text-primary" aria-hidden />
                <CardTitle className="text-base">{titulo}</CardTitle>
                <CardDescription>{texto}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

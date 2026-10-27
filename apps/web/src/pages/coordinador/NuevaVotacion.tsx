import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Titulo } from '@/components/Estados';
import { Button } from '@/components/ui/button';
import { FormularioProceso } from './Procesos';

export default function NuevaVotacion() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-3">
        <Link to="/coord">
          <ArrowLeft /> Todas las votaciones
        </Link>
      </Button>
      <Titulo
        titulo="Nueva votación"
        descripcion="Se creará en borrador para revisar y confirmar sus archivos antes de abrirla."
      />
      <div className="rounded-xl border bg-card p-5 sm:p-6">
        <FormularioProceso
          proceso={null}
          alCancelar={() => navigate('/coord')}
          alTerminar={(proceso, archivos) => {
            navigate(`/coord/votaciones/${proceso.id}/carga?preparar=1`, { state: { archivosPreparacion: archivos } });
          }}
        />
      </div>
    </div>
  );
}

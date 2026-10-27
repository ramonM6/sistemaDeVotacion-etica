import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Pencil, Play, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { EstadoProceso, Proceso } from '@/lib/tipos';
import { api } from '@/lib/api';
import { FormularioProceso } from './Procesos';

export default function AdministrarVotacion({ proceso }: { proceso: Proceso }) {
  const cliente = useQueryClient();
  const [editando, setEditando] = useState(false);
  const procesos = useQuery({ queryKey: ['coord', 'procesos'], queryFn: api.procesos });
  const actualizar = () => cliente.invalidateQueries({ queryKey: ['coord'] });
  const cambiar = useMutation({
    mutationFn: (estado: EstadoProceso) => api.cambiarEstado(proceso.id, estado),
    onSuccess: () => {
      actualizar();
      toast.success('Estado de la votación actualizado');
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const otroAbierto = procesos.data?.some((p) => p.id !== proceso.id && p.estado === 'ABIERTO');
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" onClick={() => setEditando(true)}>
        <Pencil /> Editar votación
      </Button>
      {proceso.estado === 'BORRADOR' && (
        <Button disabled={otroAbierto || cambiar.isPending || !procesos.data} onClick={() => cambiar.mutate('ABIERTO')}>
          <Play /> Abrir votación
        </Button>
      )}
      {proceso.estado === 'ABIERTO' && (
        <Button
          variant="destructive"
          disabled={cambiar.isPending}
          onClick={() => {
            if (window.confirm('¿Cerrar esta votación? Los alumnos ya no podrán modificar sus elecciones.'))
              cambiar.mutate('CERRADO');
          }}
        >
          <Lock /> Cerrar votación
        </Button>
      )}
      {proceso.estado === 'CERRADO' && (
        <Button
          variant="outline"
          disabled={otroAbierto || cambiar.isPending || !procesos.data}
          onClick={() => cambiar.mutate('ABIERTO')}
        >
          <RotateCcw /> Reabrir votación
        </Button>
      )}
      <Dialog open={editando} onOpenChange={setEditando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar {proceso.nombre}</DialogTitle>
            <DialogDescription>
              Para reabrir, extiende primero la fecha de fin. Una votación con decisiones de cursos registradas no se
              puede reabrir.
            </DialogDescription>
          </DialogHeader>
          <FormularioProceso
            proceso={proceso}
            alCancelar={() => setEditando(false)}
            alTerminar={() => {
              setEditando(false);
              actualizar();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

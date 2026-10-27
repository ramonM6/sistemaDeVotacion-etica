import { useVotacionAlumno } from './LayoutAlumno';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, ScrollText } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import type { EstadoAlumno } from '@/lib/tipos';

/** Modal bloqueante en la primera entrada a un proceso abierto (sección 8). */
export function TerminosModal({ estado }: { estado: EstadoAlumno }) {
  const { procesoId } = useVotacionAlumno();
  const queryClient = useQueryClient();
  const [marcado, setMarcado] = useState(false);
  const aceptar = useMutation({
    mutationFn: () => api.aceptarTerminos(procesoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alumno'] });
      toast.success('Términos aceptados. Ya puedes votar.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const abierto = estado.abierto && !estado.terminos.aceptados;
  const [encabezado, ...puntos] = estado.terminos.texto.split('\n');

  return (
    <Dialog open={abierto}>
      <DialogContent
        ocultarCerrar
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="max-w-xl"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScrollText className="h-5 w-5" aria-hidden /> Términos de participación
          </DialogTitle>
          <DialogDescription>
            {estado.proceso.nombre} · versión {estado.terminos.version}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 rounded-md border bg-muted/40 p-4 text-sm leading-relaxed">
          <p className="font-medium">{encabezado}</p>
          <ol className="space-y-2">
            {puntos.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
        </div>
        <div className="flex items-start gap-3">
          <Checkbox id="acepto" checked={marcado} onCheckedChange={(v) => setMarcado(v === true)} className="mt-0.5" />
          <Label htmlFor="acepto" className="leading-snug">
            He leído y acepto los términos de participación.
          </Label>
        </div>
        <DialogFooter>
          <Button disabled={!marcado || aceptar.isPending} onClick={() => aceptar.mutate()}>
            {aceptar.isPending && <Loader2 className="animate-spin" />}
            Acepto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

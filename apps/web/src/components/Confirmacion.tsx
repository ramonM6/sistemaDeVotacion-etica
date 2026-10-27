import { useSyncExternalStore } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

type Aviso = { mensaje: string; resolver: (respuesta: boolean) => void };
const cola: Aviso[] = [];
const oyentes = new Set<() => void>();
const notificar = () => oyentes.forEach((oyente) => oyente());
const suscribir = (oyente: () => void) => {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
};

export function confirmar(mensaje: string): Promise<boolean> {
  return new Promise((resolver) => {
    cola.push({ mensaje, resolver });
    notificar();
  });
}

export function Confirmacion() {
  const aviso = useSyncExternalStore(suscribir, () => cola[0] ?? null);
  const responder = (valor: boolean) => {
    const actual = cola.shift();
    actual?.resolver(valor);
    notificar();
  };
  return (
    <AlertDialog
      open={!!aviso}
      onOpenChange={(abierto) => {
        if (!abierto && aviso === cola[0]) responder(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar acción</AlertDialogTitle>
          <AlertDialogDescription>{aviso?.mensaje}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => responder(false)}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => responder(true)}>Confirmar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

function obtenerSocket() {
  // Mismo origen: Vite reenvía /socket.io al API.
  socket ??= io('/resultados', { path: '/socket.io', transports: ['websocket', 'polling'] });
  return socket;
}

/**
 * Escucha `resultados:actualizados` y vuelve a pedir las consultas indicadas con TanStack Query.
 * El evento no trae datos: solo avisa que algo cambió. Devuelve si la conexión está activa.
 */
export function useResultadosEnVivo(claves: QueryKey[]) {
  const queryClient = useQueryClient();
  const [conectado, setConectado] = useState(false);
  const firma = JSON.stringify(claves);

  useEffect(() => {
    const s = obtenerSocket();
    const alActualizar = () => {
      for (const queryKey of JSON.parse(firma) as QueryKey[]) queryClient.invalidateQueries({ queryKey });
    };
    const alConectar = () => {
      setConectado(true);
      alActualizar();
    };
    const alDesconectar = () => setConectado(false);
    setConectado(s.connected);
    s.on('resultados:actualizados', alActualizar);
    s.on('connect', alConectar);
    s.on('disconnect', alDesconectar);
    return () => {
      s.off('resultados:actualizados', alActualizar);
      s.off('connect', alConectar);
      s.off('disconnect', alDesconectar);
    };
  }, [firma, queryClient]);

  return conectado;
}

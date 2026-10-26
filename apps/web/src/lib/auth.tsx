import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import { api, ApiError } from './api';
import type { Usuario } from './tipos';

interface Auth {
  usuario: Usuario | null;
  cargando: boolean;
  login: (codigo: string, password: string) => Promise<Usuario>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.me();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: Infinity,
    retry: false,
  });

  /**
   * Borra del caché todo lo que pertenece a la sesión anterior, EXCEPTO la consulta ['me'].
   * No se usa queryClient.clear(): eliminaría la consulta ['me'] a la que el AuthProvider sigue
   * suscrito y la pantalla seguiría mostrando al usuario como conectado (el logout "no hacía nada").
   */
  const limpiarSesionEnCache = async () => {
    await queryClient.cancelQueries();
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
  };

  const login = useMutation({
    mutationFn: ({ codigo, password }: { codigo: string; password: string }) => api.login(codigo, password),
    onSuccess: async (usuario) => {
      await limpiarSesionEnCache();
      queryClient.setQueryData(['me'], usuario);
    },
  });

  const valor: Auth = {
    usuario: me.data ?? null,
    cargando: me.isLoading,
    login: (codigo, password) => login.mutateAsync({ codigo, password }),
    logout: async () => {
      try {
        // El backend borra la cookie de sesión y registra LOGOUT en la auditoría.
        await api.logout();
      } catch {
        // Si falla (p. ej. la sesión ya expiró, 401), igual se cierra la sesión en el cliente.
      } finally {
        // 1) Estado de la cuenta: sin usuario. 2) Se descartan los datos de la sesión anterior.
        queryClient.setQueryData(['me'], null);
        await limpiarSesionEnCache();
      }
    },
  };
  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
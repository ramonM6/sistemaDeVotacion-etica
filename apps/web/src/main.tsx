import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import App from './App';
import { Confirmacion } from './components/Confirmacion';
import { TooltipProvider } from './components/ui/tooltip';
import { ApiError } from './lib/api';
import { AuthProvider } from './lib/auth';
import './index.css';

// Si la sesión expira (401) en cualquier consulta, se vuelve al login.
const alError = (error: unknown) => {
  if (error instanceof ApiError && error.status === 401 && !location.pathname.startsWith('/login')) {
    queryClient.setQueryData(['me'], null);
  }
};

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: alError }),
  mutationCache: new MutationCache({ onError: alError }),
  defaultOptions: {
    queries: {
      retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2,
      refetchOnWindowFocus: true,
      staleTime: 10_000,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <TooltipProvider delayDuration={150}>
            <App />
            <Confirmacion />
            <Toaster richColors position="top-right" />
          </TooltipProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

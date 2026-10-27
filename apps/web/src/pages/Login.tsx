import { zodResolver } from '@hookform/resolvers/zod';
import { GraduationCap, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { inicioPorRol } from '@/components/RequiereRol';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const esquema = z.object({
  codigo: z.string().trim().min(1, 'Ingresa tu código'),
  password: z.string().min(1, 'Ingresa tu contraseña'),
});
type Datos = z.infer<typeof esquema>;

export default function Login() {
  const { usuario, login } = useAuth();
  const navigate = useNavigate();
  const ubicacion = useLocation();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<Datos>({ resolver: zodResolver(esquema) });

  if (usuario) return <Navigate to={inicioPorRol(usuario.rol)} replace />;

  const enviar = handleSubmit(async ({ codigo, password }) => {
    setError(null);
    try {
      const u = await login(codigo, password);
      const desde = (ubicacion.state as { desde?: string } | null)?.desde;
      navigate(desde && desde.startsWith(inicioPorRol(u.rol)) ? desde : inicioPorRol(u.rol), { replace: true });
    } catch (e) {
      // Mensaje genérico: no revela si el código existe.
      setError(
        e instanceof ApiError
          ? e.status === 401
            ? 'Código o contraseña incorrectos'
            : e.message
          : 'No se pudo conectar con el servidor. Inténtalo de nuevo en unos momentos.',
      );
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-100 to-slate-200 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 rounded-full bg-primary p-3 text-primary-foreground">
            <GraduationCap className="h-6 w-6" aria-hidden />
          </div>
          <CardTitle>Votación de electivos</CardTitle>
          <CardDescription>Ingeniería Informática · PUCP</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={enviar} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="codigo">Código</Label>
              <Input id="codigo" autoComplete="username" placeholder="20201234" autoFocus {...register('codigo')} />
              {formState.errors.codigo && <p className="text-xs text-destructive">{formState.errors.codigo.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" type="password" autoComplete="current-password" {...register('password')} />
              {formState.errors.password && (
                <p className="text-xs text-destructive">{formState.errors.password.message}</p>
              )}
            </div>
            {error && (
              <Alert variant="destructive" className="py-2">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" className="w-full" disabled={formState.isSubmitting}>
              {formState.isSubmitting && <Loader2 className="animate-spin" />}
              Ingresar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

import { urlBaseDePruebas } from './url-test';

process.env.DATABASE_URL = urlBaseDePruebas();
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.JWT_SECRET = 'secreto-de-pruebas';
process.env.COORD_USER = 'coord-test';
process.env.COORD_PASSWORD = 'Coordinador#Test1';
// Los tests inician muchas sesiones; el rate limit real (5/min) se prueba en rate-limit.e2e-spec.ts.
process.env.LOGIN_INTENTOS_POR_MINUTO ??= '1000';

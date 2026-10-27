import 'dotenv/config';

/** URL de la base de pruebas: DATABASE_URL_TEST o la misma DATABASE_URL con la base "<nombre>_test". */
export function urlBaseDePruebas(): string {
  if (process.env.DATABASE_URL_TEST) return process.env.DATABASE_URL_TEST;
  const base = process.env.DATABASE_URL ?? 'postgresql://votacion:votacion@localhost:5432/votacion?schema=public';
  const url = new URL(base);
  if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname))
    throw new Error('Para pruebas usa npm run test:e2e:local o configura DATABASE_URL_TEST en una BD exclusiva de pruebas. No se deriva una BD de pruebas de Supabase.');
  url.pathname = `${url.pathname.replace(/_test$/, '')}_test`;
  return url.toString();
}

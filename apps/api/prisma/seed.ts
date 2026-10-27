/** Inicialización mínima. Las mallas, alumnos e historiales se importan por votación desde CSV/Excel. */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
const prisma = new PrismaClient();
async function main() {
  const codigo = process.env.COORD_USER ?? 'coordinador';
  const existente = await prisma.usuario.findUnique({ where: { codigo } });
  if (existente) {
    if (existente.rol !== 'COORDINADOR')
      throw new Error('El código configurado para coordinación ya pertenece a otro rol.');
    console.log('Coordinador existente: se conservan sus credenciales y los datos de las votaciones.');
    return;
  }
  await prisma.usuario.create({
    data: {
      codigo,
      nombres: 'Coordinación',
      apellidos: 'Académica',
      rol: 'COORDINADOR',
      passwordHash: await bcrypt.hash(process.env.COORD_PASSWORD ?? 'Coordinador#2026', 10),
    },
  });
  console.log(
    'Coordinador creado. Crea una votación y carga o reutiliza sus archivos; no se generan votaciones ni votos de demostración.',
  );
}
main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

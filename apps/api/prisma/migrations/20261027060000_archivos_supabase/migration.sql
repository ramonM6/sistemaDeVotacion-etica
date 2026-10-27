ALTER TABLE "ArchivoCarga" ALTER COLUMN "contenido" DROP NOT NULL;
ALTER TABLE "ArchivoCarga" ADD COLUMN "bucket" TEXT, ADD COLUMN "ruta" TEXT;

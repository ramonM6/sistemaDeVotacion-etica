ALTER TABLE "Usuario" ADD COLUMN "ingreso" TEXT, ADD COLUMN "craest" DOUBLE PRECISION, ADD COLUMN "matriculado" BOOLEAN;
UPDATE "Usuario" AS u SET "ingreso" = p."ingreso", "craest" = p."craest", "matriculado" = p."matriculado"
FROM (SELECT DISTINCT ON ("usuarioId") "usuarioId", "ingreso", "craest", "matriculado" FROM "PadronAlumno" ORDER BY "usuarioId", "procesoId") AS p WHERE u.id = p."usuarioId";
DELETE FROM "PadronAlumno" p WHERE NOT EXISTS (SELECT 1 FROM "HistorialItem" h WHERE h."procesoId"=p."procesoId" AND h."usuarioId"=p."usuarioId");
INSERT INTO "PadronAlumno" ("procesoId", "usuarioId", "ingreso", "craest", "matriculado")
SELECT DISTINCT h."procesoId", h."usuarioId", u."ingreso", u."craest", u."matriculado" FROM "HistorialItem" h JOIN "Usuario" u ON u.id=h."usuarioId"
ON CONFLICT ("procesoId", "usuarioId") DO NOTHING;
UPDATE "ArchivoCarga" SET "procesoId" = NULL WHERE "tipo" = 'cuentas';

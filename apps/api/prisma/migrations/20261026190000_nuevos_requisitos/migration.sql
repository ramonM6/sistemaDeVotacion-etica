ALTER TABLE "Curso" ADD COLUMN activo BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ProcesoVotacion" ADD COLUMN "primeraApertura" TIMESTAMP(3);
UPDATE "ProcesoVotacion" SET "primeraApertura" = "fechaInicio" WHERE estado <> 'BORRADOR';
ALTER TABLE "PadronAlumno" ADD COLUMN ingreso TEXT, ADD COLUMN craest DECIMAL(6,2), ADD COLUMN matriculado BOOLEAN;
CREATE TABLE "SeguimientoCurso" (
 "procesoId" TEXT NOT NULL REFERENCES "ProcesoVotacion"(id) ON DELETE CASCADE,
 "cursoCodigo" TEXT NOT NULL,
 seleccion TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (seleccion IN ('PENDIENTE','SELECCIONADO_PARA_REVISION','NO_SELECCIONADO')),
 consejo TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (consejo IN ('PENDIENTE','APROBADO','NO_APROBADO')),
 dictado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (dictado IN ('PENDIENTE','CONFIRMADO','NO_SE_DICTARA')),
 observacion TEXT NOT NULL DEFAULT '',
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("procesoId", "cursoCodigo")
);

ALTER TABLE "ProcesoVotacion" ADD COLUMN "cicloActual" TEXT, ADD COLUMN catalogo JSONB;
UPDATE "ProcesoVotacion" SET catalogo = (
 SELECT COALESCE(jsonb_agg(to_jsonb(c) || jsonb_build_object('requisitos', (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.orden), '[]'::jsonb) FROM "Requisito" r WHERE r."cursoCodigo" = c.codigo))), '[]'::jsonb) FROM "Curso" c
) WHERE estado <> 'BORRADOR';

CREATE TABLE "ArchivoCarga" (
 id TEXT PRIMARY KEY, nombre TEXT NOT NULL, tipo TEXT NOT NULL, "procesoId" TEXT,
 "actorId" TEXT NOT NULL, sha256 TEXT NOT NULL, filas INTEGER NOT NULL,
 contenido BYTEA NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

UPDATE "ProcesoVotacion" SET "maxCursos" = LEAST("maxCursos", 5), "maxFranjas" = LEAST("maxFranjas", 2);
ALTER TABLE "ProcesoVotacion" ADD CONSTRAINT limites_votacion CHECK ("maxCursos" BETWEEN 1 AND 5 AND "maxFranjas" BETWEEN 1 AND 2);

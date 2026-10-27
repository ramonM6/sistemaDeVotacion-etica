import { Download, FileSpreadsheet } from 'lucide-react';
import { Titulo } from '@/components/Estados';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import type { TipoImportacion } from '@/lib/tipos';

const FORMATOS: {
  tipo: TipoImportacion;
  titulo: string;
  hoja: string;
  obligatorias: string;
  opcionales: string;
  ejemplo: string;
  nota: string;
}[] = [
  {
    tipo: 'malla',
    titulo: '1. Malla curricular',
    hoja: 'cursos',
    obligatorias: 'codigo, nombre, creditos, tipo',
    opcionales: 'ciclo, grupo, requisitos, descripcion',
    ejemplo:
      'codigo,nombre,creditos,tipo,requisitos\nINF101,Programación Básica,4,OBLIGATORIO,\nINF202,Desarrollo de Aplicaciones,3,ELECTIVO,INF101',
    nota: 'Tipos: OBLIGATORIO, ELECTIVO, ELECTIVO_GENERALES o ELECTIVO_LIBRE. Solo ELECTIVO participa en la votación.',
  },
  {
    tipo: 'cuentas',
    titulo: '2. Cuentas de alumnos',
    hoja: 'alumnos',
    obligatorias: 'codigo, nombres, apellidos, password',
    opcionales: 'correo, ingreso, craest, matriculado',
    ejemplo:
      'codigo,nombres,apellidos,password\n20990001,Ana,Prueba Uno,Prueba#2026\n20990002,Bruno,Prueba Dos,Prueba#2026',
    nota: 'Código de 8 dígitos y contraseña de al menos 8 caracteres. Los ejemplos contienen cuentas ficticias.',
  },
  {
    tipo: 'historial',
    titulo: '3. Historial académico',
    hoja: 'historial',
    obligatorias: 'codigo_alumno, codigo_curso',
    opcionales: 'nota',
    ejemplo: 'codigo_alumno,codigo_curso,nota\n20990001,INF101,16\n20990002,INF101,',
    nota: 'Nota entera de 0 a 20. Deja la nota vacía si el curso está en progreso. El alumno debe estar en las cuentas importadas.',
  },
];
export default function Plantillas() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Titulo
        titulo="Plantillas y ejemplos"
        descripcion="Descarga el formato de cada archivo o un CSV con datos ficticios para probar las importaciones."
      />
      <p className="text-sm text-muted-foreground">
        Usa CSV UTF-8 o Excel .xlsx, hasta 5 MB. Carga malla, cuentas e historial en ese orden. Los tres ejemplos
        descargables son compatibles entre sí.
      </p>
      {FORMATOS.map((f) => (
        <Card key={f.tipo} className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-semibold">
              <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
              {f.titulo}
            </h2>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <a href={api.urlPlantilla(f.tipo)} download>
                  <Download /> Plantilla Excel
                </a>
              </Button>
              <Button asChild size="sm">
                <a href={api.urlEjemplo(f.tipo)} download>
                  <Download /> Ejemplo CSV
                </a>
              </Button>
            </div>
          </div>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium">Columnas obligatorias</dt>
              <dd className="mt-1 text-muted-foreground">{f.obligatorias}</dd>
            </div>
            <div>
              <dt className="font-medium">Columnas opcionales</dt>
              <dd className="mt-1 text-muted-foreground">{f.opcionales}</dd>
            </div>
          </dl>
          <p className="text-sm text-muted-foreground">
            En Excel, usa la hoja «{f.hoja}». {f.nota}
          </p>
          <details>
            <summary className="cursor-pointer text-sm font-medium text-primary">Ver ejemplo del formato</summary>
            <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 text-xs">{f.ejemplo}</pre>
          </details>
        </Card>
      ))}
      <p className="text-sm text-muted-foreground">
        Cuentas de los CSV de prueba: 20990001 a 20990004, contraseña Prueba#2026. Úsalas en una votación de prueba:
        importar cuentas o historial reemplaza los datos de ese borrador.
      </p>
    </div>
  );
}

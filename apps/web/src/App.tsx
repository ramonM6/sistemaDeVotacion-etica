import GestionCursos from '@/pages/coordinador/GestionCursos';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Cargando } from '@/components/Estados';
import { RequiereRol, inicioPorRol } from '@/components/RequiereRol';
import { useAuth } from '@/lib/auth';
import Login from '@/pages/Login';
import AlumnoCatalogo from '@/pages/alumno/Catalogo';
import DetalleElectivo from '@/pages/alumno/DetalleElectivo';
import VotacionesAlumno from '@/pages/alumno/Votaciones';
import SeguimientoAlumno from '@/pages/alumno/Seguimiento';
import LayoutAlumno from '@/pages/alumno/LayoutAlumno';
import MisVotos from '@/pages/alumno/MisVotos';
import AlumnoResultados from '@/pages/alumno/Resultados';
import CargaDatos from '@/pages/coordinador/CargaDatos';
import Cursos from '@/pages/coordinador/Cursos';
import DetalleAlumno from '@/pages/coordinador/DetalleAlumno';
import DetalleCurso from '@/pages/coordinador/DetalleCurso';
import LayoutCoord from '@/pages/coordinador/LayoutCoord';
import Padron from '@/pages/coordinador/Padron';
import Procesos from '@/pages/coordinador/Procesos';
import NuevaVotacion from '@/pages/coordinador/NuevaVotacion';
import CoordResultados from '@/pages/coordinador/Resultados';

function Inicio() {
  const { usuario, cargando } = useAuth();
  if (cargando) return <Cargando />;
  return <Navigate to={usuario ? inicioPorRol(usuario.rol) : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Inicio />} />
      <Route path="/login" element={<Login />} />

      <Route element={<RequiereRol rol="ALUMNO" />}>
        <Route path="/alumno" element={<LayoutAlumno />}>
          <Route index element={<VotacionesAlumno />} />
          <Route path="votaciones/:procesoId">
            <Route index element={<Navigate to="catalogo" replace />} />
            <Route path="catalogo" element={<AlumnoCatalogo />} />
            <Route path="catalogo/:codigo" element={<DetalleElectivo />} />
            <Route path="votos" element={<MisVotos />} />
            <Route path="resultados" element={<AlumnoResultados />} />
            <Route path="seguimiento" element={<Navigate to="seleccion" replace />} />
            <Route path="seguimiento/:etapa" element={<SeguimientoAlumno />} />
          </Route>
          <Route path="*" element={<Navigate to="/alumno" replace />} />
        </Route>
      </Route>

      <Route element={<RequiereRol rol="COORDINADOR" />}>
        <Route path="/coord" element={<LayoutCoord />}>
          <Route index element={<Procesos />} />
          <Route path="nueva-votacion" element={<NuevaVotacion />} />
          <Route path="catalogo" element={<Cursos />} />
          <Route path="votaciones/:procesoId">
            <Route index element={<Navigate to="cursos/seleccion" replace />} />
            <Route path="cursos" element={<Navigate to="seleccion" replace />} />
            <Route path="cursos/:etapa" element={<GestionCursos />} />
            <Route path="resultados" element={<CoordResultados />} />
            <Route path="resultados/:codigo" element={<DetalleCurso />} />
            <Route path="carga" element={<CargaDatos />} />
            <Route path="padron" element={<Padron />} />
            <Route path="padron/:codigo" element={<DetalleAlumno />} />
          </Route>
          <Route path="*" element={<Navigate to="/coord" replace />} />
        </Route>
      </Route>

      <Route path="*" element={<Inicio />} />
    </Routes>
  );
}

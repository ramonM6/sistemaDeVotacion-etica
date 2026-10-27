import { Navigate, Route, Routes } from 'react-router-dom';
import { Cargando } from '@/components/Estados';
import { RequiereRol, inicioPorRol } from '@/components/RequiereRol';
import { useAuth } from '@/lib/auth';
import Login from '@/pages/Login';
import AlumnoCatalogo from '@/pages/alumno/Catalogo';
import DetalleElectivo from '@/pages/alumno/DetalleElectivo';
import AlumnoInicio from '@/pages/alumno/Inicio';
import LayoutAlumno from '@/pages/alumno/LayoutAlumno';
import MisVotos from '@/pages/alumno/MisVotos';
import AlumnoResultados from '@/pages/alumno/Resultados';
import CargaDatos from '@/pages/coordinador/CargaDatos';
import Cursos from '@/pages/coordinador/Cursos';
import DetalleAlumno from '@/pages/coordinador/DetalleAlumno';
import DetalleCurso from '@/pages/coordinador/DetalleCurso';
import LayoutCoord from '@/pages/coordinador/LayoutCoord';
import Padron from '@/pages/coordinador/Padron';
import Panel from '@/pages/coordinador/Panel';
import Procesos from '@/pages/coordinador/Procesos';
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
          <Route index element={<AlumnoInicio />} />
          <Route path="catalogo" element={<AlumnoCatalogo />} />
          <Route path="catalogo/:codigo" element={<DetalleElectivo />} />
          <Route path="votos" element={<MisVotos />} />
          <Route path="resultados" element={<AlumnoResultados />} />
        </Route>
      </Route>

      <Route element={<RequiereRol rol="COORDINADOR" />}>
        <Route path="/coord" element={<LayoutCoord />}>
          <Route index element={<Procesos />} />
          <Route path="catalogo" element={<Cursos />} />
          <Route path="votaciones/:procesoId">
            <Route index element={<Panel />} />
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

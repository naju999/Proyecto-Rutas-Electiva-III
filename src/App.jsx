import { Navigate, Route, Routes } from 'react-router-dom';
import MainLayout from './layout/MainLayout';
import InicioPage from './pages/InicioPage';
import RutasPage from './pages/RutasPage';
import FavoritosPage from './pages/FavoritosPage';
import PerfilPage from './pages/PerfilPage';
import NotFoundPage from './pages/NotFoundPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<Navigate to="/inicio" replace />} />
        <Route path="inicio" element={<InicioPage />} />
        <Route path="rutas" element={<RutasPage />} />
        <Route path="favoritos" element={<FavoritosPage />} />
        <Route path="perfil" element={<PerfilPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default App;

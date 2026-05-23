import { Navigate, Route, Routes } from 'react-router-dom';
import MainLayout from './layout/MainLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import InicioPage from './pages/InicioPage';
import RutasPage from './pages/RutasPage';
import FavoritosPage from './pages/FavoritosPage';
import PerfilPage from './pages/PerfilPage';
import NotFoundPage from './pages/NotFoundPage';
import CacheLabPage from './pages/CacheLabPage';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <Routes>
      {/* Ruta de pruebas / laboratorio (independiente) */}
      <Route path="/lab/cache" element={<CacheLabPage />} />

      {/* Rutas públicas (sin autenticación) */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Rutas protegidas (requieren autenticación) */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/inicio" replace />} />
        <Route path="inicio" element={<InicioPage />} />
        <Route path="rutas" element={<RutasPage />} />
        <Route path="favoritos" element={<FavoritosPage />} />
        <Route path="perfil" element={<PerfilPage />} />
      </Route>

      {/* 404 */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;

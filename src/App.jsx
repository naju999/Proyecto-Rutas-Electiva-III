import { Navigate, Route, Routes } from 'react-router-dom';
import MainLayout from './layout/MainLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import InicioPage from './pages/InicioPage';
import RutasPage from './pages/RutasPage';
import FavoritosPage from './pages/FavoritosPage';
import PerfilPage from './pages/PerfilPage';
import NotFoundPage from './pages/NotFoundPage';
import ProtectedRoute from './components/ProtectedRoute';
import OfflineSyncBadge from './components/OfflineSyncBadge';

function App() {
  return (
    <>
      <OfflineSyncBadge />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

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
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}

export default App;

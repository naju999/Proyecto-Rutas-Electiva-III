import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  captureDeviceLocation,
  isDeviceLocationEnabled,
  persistPendingDeviceLocation
} from '../utils/deviceLocation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [locationStatus, setLocationStatus] = useState('');
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let isCancelled = false;

    const requestDeviceLocation = async () => {
      if (!isDeviceLocationEnabled()) {
        setLocationStatus('La ubicacion esta desactivada para la app. Puedes activarla luego desde el perfil.');
        return;
      }

      if (!navigator.geolocation) {
        setLocationStatus('Tu navegador no soporta geolocalizacion.');
        return;
      }

      setLocationStatus('Solicitando permiso para usar tu ubicacion y mejorar la experiencia...');

      try {
        const deviceLocation = await captureDeviceLocation();

        if (isCancelled) {
          return;
        }

        persistPendingDeviceLocation(deviceLocation);
        setLocationStatus('');
      } catch {
        if (!isCancelled) {
          setLocationStatus('No pudimos obtener tu ubicacion. Puedes continuar sin ella.');
        }
      }
    };

    void requestDeviceLocation();

    return () => {
      isCancelled = true;
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/inicio');
    } catch (err) {
      setError(
        err.code === 'auth/user-not-found'
          ? 'Usuario no encontrado'
          : err.code === 'auth/wrong-password'
            ? 'Contraseña incorrecta'
            : 'Error al iniciar sesión: ' + err.message
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setError('');
    setLoading(true);

    try {
      await loginWithGoogle();
      navigate('/inicio');
    } catch (err) {
      setError('Error al iniciar sesión con Google: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-container">
      <section className="auth-form-section">
        <div className="auth-card">
          <div className="auth-card-hero">
            <span className="auth-card-badge">Tu Ruta</span>
            <p className="auth-card-kicker">Acceso seguro con Firebase</p>
          </div>
          <h1>Iniciar Sesión</h1>

          {locationStatus ? (
            <div className="auth-location-banner" role="status" aria-live="polite">
              {locationStatus}
            </div>
          ) : null}
          
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="email">Correo Electrónico</label>
              <input
                id="email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Contraseña</label>
              <input
                id="password"
                type="password"
                placeholder="Tu contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <button type="submit" disabled={loading} className="submit-button">
              {loading ? 'Cargando...' : 'Iniciar Sesión'}
            </button>
          </form>

          <div className="auth-divider" aria-hidden="true">
            <span>o</span>
          </div>

          <button
            type="button"
            className="submit-button auth-google-button"
            onClick={handleGoogleLogin}
            disabled={loading}
          >
            {loading ? 'Cargando...' : 'Continuar con Google'}
          </button>

          <div className="auth-footer">
            <p>
              ¿No tienes cuenta?{' '}
              <Link to="/register" className="auth-link">
                Regístrate aquí
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

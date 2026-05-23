import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

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

  return (
    <main className="auth-container">
      <section className="auth-form-section">
        <div className="auth-card">
          <h1>Iniciar Sesión</h1>
          
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

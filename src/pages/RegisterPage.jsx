import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signup } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    // Validaciones
    if (!displayName.trim()) {
      setError('Por favor ingresa tu nombre');
      return;
    }

    if (password !== passwordConfirm) {
      setError('Las contraseñas no coinciden');
      return;
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setLoading(true);

    try {
      await signup(email, password, displayName);
      navigate('/inicio');
    } catch (err) {
      setError(
        err.code === 'auth/email-already-in-use'
          ? 'Este correo ya está registrado'
          : err.code === 'auth/invalid-email'
            ? 'Correo inválido'
            : err.code === 'auth/weak-password'
              ? 'Contraseña débil (mínimo 6 caracteres)'
              : 'Error al registrarse: ' + err.message
      );
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
            <p className="auth-card-kicker">Crea tu cuenta para guardar rutas</p>
          </div>
          <h1>Registrarse</h1>
          
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="displayName">Nombre</label>
              <input
                id="displayName"
                type="text"
                placeholder="Tu nombre completo"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                disabled={loading}
              />
            </div>

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
              <div className="password-field">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={loading}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" style={{ width: '20px', height: '20px', stroke: 'currentColor', fill: 'none', strokeWidth: 2 }}>
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" style={{ width: '20px', height: '20px', stroke: 'currentColor', fill: 'none', strokeWidth: 2 }}>
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="passwordConfirm">Confirmar Contraseña</label>
              <div className="password-field">
                <input
                  id="passwordConfirm"
                  type={showPasswordConfirm ? 'text' : 'password'}
                  placeholder="Repite tu contraseña"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                  disabled={loading}
                  aria-label={showPasswordConfirm ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPasswordConfirm ? (
                    <svg viewBox="0 0 24 24" style={{ width: '20px', height: '20px', stroke: 'currentColor', fill: 'none', strokeWidth: 2 }}>
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" style={{ width: '20px', height: '20px', stroke: 'currentColor', fill: 'none', strokeWidth: 2 }}>
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="submit-button">
              {loading ? 'Cargando...' : 'Registrarse'}
            </button>
          </form>

          <div className="auth-footer">
            <p>
              ¿Ya tienes cuenta?{' '}
              <Link to="/login" className="auth-link">
                Inicia sesión aquí
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

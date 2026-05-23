import { useEffect, useMemo, useState } from 'react';
import { promptPwaInstall, subscribePwaInstallState } from '../pwa/pwaInstall';

const SESSION_STORAGE_KEY = 'tuRuta.sessionUser';
const ACCOUNTS_STORAGE_KEY = 'tuRuta.accounts';
const REVIEWS_STORAGE_KEY = 'tuRuta.routeReviews';
const FINALIZED_ROUTE_KEY = 'tuRuta.finalizedRoute';

const DEFAULT_AUTH_FORM = {
  email: '',
  password: '',
  confirmPassword: ''
};

const DEFAULT_REVIEW_FORM = {
  rating: 0,
  comments: ''
};

function PerfilPage() {
  const [installState, setInstallState] = useState({
    canInstall: false,
    installed: false
  });
  const [sessionUser, setSessionUser] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState(DEFAULT_AUTH_FORM);
  const [accounts, setAccounts] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [reviewForm, setReviewForm] = useState(DEFAULT_REVIEW_FORM);
  const [finalizedRoute, setFinalizedRoute] = useState(null);
  const [authMessage, setAuthMessage] = useState('Inicia sesion o crea una cuenta para continuar.');
  const [reviewMessage, setReviewMessage] = useState('Finaliza una ruta para habilitar la calificacion.');

  useEffect(() => {
    return subscribePwaInstallState(setInstallState);
  }, []);

  useEffect(() => {
    const storedUser = window.localStorage.getItem(SESSION_STORAGE_KEY) || '';
    const storedAccounts = window.localStorage.getItem(ACCOUNTS_STORAGE_KEY) || '[]';
    const storedReviews = window.localStorage.getItem(REVIEWS_STORAGE_KEY) || '[]';
    const storedFinalizedRoute = window.localStorage.getItem(FINALIZED_ROUTE_KEY) || '';

    setSessionUser(storedUser);
    setAuthForm((current) => ({
      ...current,
      email: storedUser,
      password: '',
      confirmPassword: ''
    }));

    try {
      setAccounts(JSON.parse(storedAccounts));
    } catch {
      setAccounts([]);
    }

    try {
      setReviews(JSON.parse(storedReviews));
    } catch {
      setReviews([]);
    }

    try {
      setFinalizedRoute(storedFinalizedRoute ? JSON.parse(storedFinalizedRoute) : null);
    } catch {
      setFinalizedRoute(null);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, sessionUser);
  }, [sessionUser]);

  useEffect(() => {
    window.localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
  }, [accounts]);

  useEffect(() => {
    window.localStorage.setItem(REVIEWS_STORAGE_KEY, JSON.stringify(reviews));
  }, [reviews]);

  useEffect(() => {
    const handleRouteFinalized = (event) => {
      setFinalizedRoute(event.detail || null);
      setReviewMessage('Ruta finalizada detectada. Ya puedes dejar tu calificacion.');
    };

    const syncFinalizedRoute = () => {
      const storedFinalizedRoute = window.localStorage.getItem(FINALIZED_ROUTE_KEY) || '';

      try {
        setFinalizedRoute(storedFinalizedRoute ? JSON.parse(storedFinalizedRoute) : null);
      } catch {
        setFinalizedRoute(null);
      }
    };

    window.addEventListener('tuRuta:routeFinalized', handleRouteFinalized);
    window.addEventListener('focus', syncFinalizedRoute);

    return () => {
      window.removeEventListener('tuRuta:routeFinalized', handleRouteFinalized);
      window.removeEventListener('focus', syncFinalizedRoute);
    };
  }, []);

  const installLabel = installState.installed
    ? 'Aplicacion instalada'
    : installState.canInstall
      ? 'Instalar aplicacion'
      : 'Instalacion no disponible';

  const metrics = useMemo(() => {
    if (!reviews.length) {
      return {
        totalReviews: 0,
        averageOverall: 0,
        activeUsers: sessionUser ? 1 : 0
      };
    }

    const totals = reviews.reduce(
      (accumulator, review) => {
        accumulator.driver += Number(review.driver);
        accumulator.bus += Number(review.bus);
        accumulator.routeQuality += Number(review.routeQuality);
        accumulator.routeTime += Number(review.routeTime);
        return accumulator;
      },
      { driver: 0, bus: 0, routeQuality: 0, routeTime: 0 }
    );

    const averageOverall =
      (totals.driver + totals.bus + totals.routeQuality + totals.routeTime) /
      (reviews.length * 4);

    return {
      totalReviews: reviews.length,
      averageOverall,
      activeUsers: new Set([...reviews.map((review) => review.user), sessionUser].filter(Boolean)).size
    };
  }, [reviews, sessionUser]);

  const hasFinalizedRoute = Boolean(finalizedRoute?.id);

  const handleLoginSubmit = (event) => {
    event.preventDefault();

    const nextEmail = authForm.email.trim().toLowerCase();
    const nextPassword = authForm.password.trim();

    if (!nextEmail || !nextPassword) {
      setAuthMessage('Escribe tu correo y contrasena para continuar.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setAuthMessage('Escribe un correo valido.');
      return;
    }

    const existingAccount = accounts.find((account) => account.email === nextEmail);

    if (!existingAccount) {
      setAuthMessage('No existe una cuenta con ese correo. Crea una cuenta primero.');
      return;
    }

    if (existingAccount.password !== nextPassword) {
      setAuthMessage('La contrasena no coincide.');
      return;
    }

    setSessionUser(nextEmail);
    setAuthForm((current) => ({
      ...current,
      password: ''
    }));
    setAuthMessage(`Sesion local iniciada como ${nextEmail}.`);
  };

  const handleRegisterSubmit = (event) => {
    event.preventDefault();

    const nextEmail = authForm.email.trim().toLowerCase();
    const nextPassword = authForm.password.trim();
    const nextConfirmPassword = authForm.confirmPassword.trim();

    if (!nextEmail || !nextPassword || !nextConfirmPassword) {
      setAuthMessage('Completa correo, contrasena y confirmacion.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setAuthMessage('Escribe un correo valido.');
      return;
    }

    if (nextPassword.length < 4) {
      setAuthMessage('La contrasena debe tener al menos 4 caracteres.');
      return;
    }

    if (nextPassword !== nextConfirmPassword) {
      setAuthMessage('Las contrasenas no coinciden.');
      return;
    }

    if (accounts.some((account) => account.email === nextEmail)) {
      setAuthMessage('Ya existe una cuenta con ese correo.');
      return;
    }

    const nextAccount = {
      email: nextEmail,
      password: nextPassword,
      createdAt: new Date().toISOString()
    };

    setAccounts((current) => [nextAccount, ...current]);
    setSessionUser(nextEmail);
    setAuthForm(DEFAULT_AUTH_FORM);
    setAuthMessage(`Cuenta creada e iniciada como ${nextEmail}.`);
  };

  const handleLogout = () => {
    setSessionUser('');
    setAuthMessage('Sesion cerrada. Puedes iniciar con otra cuenta cuando quieras.');
  };

  const handleRatingSelect = (rating) => {
    setReviewForm((current) => ({
      ...current,
      rating
    }));
  };

  const handleReviewSubmit = (event) => {
    event.preventDefault();

    if (!sessionUser) {
      setReviewMessage('Primero inicia sesion para dejar una valoracion.');
      return;
    }

    if (!hasFinalizedRoute) {
      setReviewMessage('La calificacion solo se habilita despues de finalizar una ruta.');
      return;
    }

    if (!reviewForm.rating) {
      setReviewMessage('Selecciona una calificacion de estrellas.');
      return;
    }

    if (!reviewForm.comments.trim()) {
      setReviewMessage('Agrega un comentario para completar la calificacion.');
      return;
    }

    const reviewId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const nextReview = {
      id: reviewId,
      user: sessionUser,
      routeId: finalizedRoute?.id ?? null,
      routeTitle: finalizedRoute?.title ?? 'Ruta finalizada',
      rating: reviewForm.rating,
      comments: reviewForm.comments.trim(),
      createdAt: new Date().toISOString()
    };

    setReviews((current) => [nextReview, ...current].slice(0, 12));
    setReviewForm(DEFAULT_REVIEW_FORM);
    setReviewMessage('Valoracion guardada en este dispositivo.');
  };

  const handleInstallClick = async () => {
    if (!installState.canInstall) {
      return;
    }

    await promptPwaInstall();
  };

  return (
    <section className="view-panel active" data-view="perfil">
      <section className="profile-screen" aria-label="Vista de perfil">
        <div className="profile-topbar">
          <div className="profile-brand">
            <span className="profile-brand-badge">TR</span>
            <strong>TuRuta</strong>
          </div>
          <h2>Perfil</h2>
          <span className="profile-topbar-space"></span>
        </div>

        <section className="profile-user-row">
          <div className="profile-avatar" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="profile-avatar-icon" focusable="false" aria-hidden="true">
              <circle cx="12" cy="8" r="4"></circle>
              <path d="M5 20a7 7 0 0 1 14 0"></path>
            </svg>
          </div>
          <div>
            <h3>{sessionUser || 'Usuario local'}</h3>
            <p>{sessionUser ? 'Sesion activa en esta PWA' : 'Sin sesion iniciada'}</p>
          </div>
        </section>

        <section className="profile-metrics" aria-label="Resumen de actividad">
          <article>
            <strong>{metrics.totalReviews}</strong>
            <span>Valoraciones</span>
          </article>
          <article>
            <strong>{metrics.averageOverall ? metrics.averageOverall.toFixed(1) : '0.0'}</strong>
            <span>Prom. estrellas</span>
          </article>
          <article>
            <strong>{metrics.activeUsers}</strong>
            <span>Usuarios activos</span>
          </article>
        </section>

        <section className="profile-settings profile-session-panel" aria-label="Inicio de sesion local">
          <div className="auth-tabs" role="tablist" aria-label="Opciones de acceso">
            <button
              type="button"
              className={authMode === 'login' ? 'auth-tab active' : 'auth-tab'}
              onClick={() => setAuthMode('login')}
              role="tab"
              aria-selected={String(authMode === 'login')}
            >
              Iniciar sesion
            </button>
            <button
              type="button"
              className={authMode === 'register' ? 'auth-tab active' : 'auth-tab'}
              onClick={() => setAuthMode('register')}
              role="tab"
              aria-selected={String(authMode === 'register')}
            >
              Crear cuenta
            </button>
          </div>

          <div className="auth-panel">
            {authMode === 'login' ? (
              <form className="profile-login-form" onSubmit={handleLoginSubmit}>
                <label htmlFor="loginEmail">Correo</label>
                <input
                  id="loginEmail"
                  type="email"
                  placeholder="correo@ejemplo.com"
                  autoComplete="email"
                  value={authForm.email}
                  onChange={(event) =>
                    setAuthForm((current) => ({
                      ...current,
                      email: event.target.value
                    }))
                  }
                />

                <label htmlFor="loginPassword">Contrasena</label>
                <div className="input-with-action profile-login-row">
                  <input
                    id="loginPassword"
                    type="password"
                    placeholder="Escribe tu contrasena"
                    autoComplete="current-password"
                    value={authForm.password}
                    onChange={(event) =>
                      setAuthForm((current) => ({
                        ...current,
                        password: event.target.value
                      }))
                    }
                  />
                  {sessionUser ? (
                    <button type="button" className="ghost-btn" onClick={handleLogout}>
                      Cerrar sesion
                    </button>
                  ) : (
                    <button type="submit" className="primary-btn profile-login-btn">
                      Entrar
                    </button>
                  )}
                </div>
              </form>
            ) : (
              <form className="profile-login-form" onSubmit={handleRegisterSubmit}>
                <label htmlFor="registerEmail">Correo</label>
                <input
                  id="registerEmail"
                  type="email"
                  placeholder="correo@ejemplo.com"
                  autoComplete="email"
                  value={authForm.email}
                  onChange={(event) =>
                    setAuthForm((current) => ({
                      ...current,
                      email: event.target.value
                    }))
                  }
                />

                <label htmlFor="registerPassword">Contrasena</label>
                <input
                  id="registerPassword"
                  type="password"
                  placeholder="Crea tu contrasena"
                  autoComplete="new-password"
                  value={authForm.password}
                  onChange={(event) =>
                    setAuthForm((current) => ({
                      ...current,
                      password: event.target.value
                    }))
                  }
                />

                <label htmlFor="registerConfirmPassword">Confirmar contrasena</label>
                <div className="input-with-action profile-login-row">
                  <input
                    id="registerConfirmPassword"
                    type="password"
                    placeholder="Repite tu contrasena"
                    autoComplete="new-password"
                    value={authForm.confirmPassword}
                    onChange={(event) =>
                      setAuthForm((current) => ({
                        ...current,
                        confirmPassword: event.target.value
                      }))
                    }
                  />
                  <button type="submit" className="primary-btn profile-login-btn">
                    Crear cuenta
                  </button>
                </div>
              </form>
            )}
          </div>

          <p className="profile-session-note">{authMessage}</p>
        </section>

        <section className="profile-settings profile-review-panel" aria-label="Calificaciones y comentarios">
          <h3>Calificar ruta</h3>
          <div className="route-finalized-banner">
            {hasFinalizedRoute ? (
              <>
                <strong>{finalizedRoute.title}</strong>
                <span>Ruta finalizada. Ya puedes dejar tu calificacion con estrellas.</span>
              </>
            ) : (
              <>
                <strong>Calificacion bloqueada</strong>
                <span>Primero debes finalizar una ruta desde la vista de rutas.</span>
              </>
            )}
          </div>
          <form className="profile-review-form" onSubmit={handleReviewSubmit}>
            <div className="star-rating" role="radiogroup" aria-label="Calificacion con estrellas">
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  key={rating}
                  type="button"
                  className={rating <= reviewForm.rating ? 'star-button is-active' : 'star-button'}
                  onClick={() => handleRatingSelect(rating)}
                  disabled={!hasFinalizedRoute}
                  aria-label={`${rating} estrella${rating === 1 ? '' : 's'}`}
                >
                  ★
                </button>
              ))}
            </div>

            <label htmlFor="reviewComments">Comentarios</label>
            <textarea
              id="reviewComments"
              rows="4"
              placeholder="Escribe tu comentario sobre el servicio..."
              value={reviewForm.comments}
              onChange={(event) => setReviewForm((current) => ({ ...current, comments: event.target.value }))}
              disabled={!hasFinalizedRoute}
            ></textarea>

            <button type="submit" className="primary-btn" disabled={!sessionUser || !hasFinalizedRoute}>
              Guardar calificacion
            </button>
          </form>
          <p className="profile-session-note">{reviewMessage}</p>
        </section>

        <section className="profile-settings profile-review-list-panel" aria-label="Comentarios guardados">
          <h3>Comentarios recientes</h3>
          {reviews.length ? (
            <div className="review-list">
              {reviews.map((review) => (
                <article key={review.id} className="review-card">
                  <div className="review-card-top">
                    <strong>{review.user}</strong>
                    <span>{new Date(review.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="review-stars-display">{'★'.repeat(Number(review.rating || 0))}</div>
                  <p>{review.comments || 'Sin comentario adicional.'}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="profile-session-note">Aun no hay comentarios guardados en este dispositivo.</p>
          )}
        </section>

        <section className="profile-settings" aria-label="Configuracion">
          <h3>Configuracion</h3>
          <button
            type="button"
            className="setting-item"
            onClick={handleInstallClick}
            disabled={!installState.canInstall}
          >
            <span className="setting-left">
              <span className="setting-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" className="setting-icon-svg" focusable="false" aria-hidden="true">
                  <path d="M12 4v10"></path>
                  <path d="M8 10l4 4 4-4"></path>
                  <path d="M4 20h16"></path>
                </svg>
              </span>
              <span>{installLabel}</span>
            </span>
            <span className="setting-chevron" aria-hidden="true">
              <svg viewBox="0 0 20 20" className="chevron-svg" focusable="false" aria-hidden="true">
                <path d="M7 4l6 6-6 6"></path>
              </svg>
            </span>
          </button>
          <button type="button" className="setting-item">
            <span className="setting-left">
              <span className="setting-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" className="setting-icon-svg" focusable="false" aria-hidden="true">
                  <path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11z"></path>
                  <circle cx="12" cy="10" r="2.5"></circle>
                </svg>
              </span>
              <span>Permisos de ubicacion</span>
            </span>
            <span className="setting-chevron" aria-hidden="true">
              <svg viewBox="0 0 20 20" className="chevron-svg" focusable="false" aria-hidden="true">
                <path d="M7 4l6 6-6 6"></path>
              </svg>
            </span>
          </button>
          <button type="button" className="setting-item">
            <span className="setting-left">
              <span className="setting-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" className="setting-icon-svg" focusable="false" aria-hidden="true">
                  <circle cx="12" cy="12" r="3.5"></circle>
                  <path d="M12 3v3"></path>
                  <path d="M12 18v3"></path>
                  <path d="M3 12h3"></path>
                  <path d="M18 12h3"></path>
                  <path d="M5.6 5.6l2.1 2.1"></path>
                  <path d="M16.3 16.3l2.1 2.1"></path>
                  <path d="M18.4 5.6l-2.1 2.1"></path>
                  <path d="M7.7 16.3l-2.1 2.1"></path>
                </svg>
              </span>
              <span>Ajustes generales</span>
            </span>
            <span className="setting-chevron" aria-hidden="true">
              <svg viewBox="0 0 20 20" className="chevron-svg" focusable="false" aria-hidden="true">
                <path d="M7 4l6 6-6 6"></path>
              </svg>
            </span>
          </button>
        </section>
      </section>
    </section>
  );
}

export default PerfilPage;

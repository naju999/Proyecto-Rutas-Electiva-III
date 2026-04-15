import { useEffect, useState } from 'react';
import { promptPwaInstall, subscribePwaInstallState } from '../pwa/pwaInstall';

function PerfilPage() {
  const [installState, setInstallState] = useState({
    canInstall: false,
    installed: false
  });

  useEffect(() => {
    return subscribePwaInstallState(setInstallState);
  }, []);

  const installLabel = installState.installed
    ? 'Aplicacion instalada'
    : installState.canInstall
      ? 'Instalar aplicacion'
      : 'Instalacion no disponible';

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
            <h3>Usuario TuRuta</h3>
            <p>Miembro desde marzo 2026</p>
          </div>
        </section>

        <section className="profile-metrics" aria-label="Resumen de actividad">
          <article>
            <strong>23</strong>
            <span>Viajes</span>
          </article>
          <article>
            <strong>4.8</strong>
            <span>Rating prom.</span>
          </article>
          <article>
            <strong>5</strong>
            <span>Favoritas</span>
          </article>
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

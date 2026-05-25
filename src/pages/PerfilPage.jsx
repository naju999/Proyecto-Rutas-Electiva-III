import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { promptPwaInstall, subscribePwaInstallState } from '../pwa/pwaInstall';
import { useAuth } from '../context/AuthContext';
import { updateUserProfile } from '../firebase/firestoreService';
import {
  captureDeviceLocation,
  disableDeviceLocationUsage,
  formatDeviceLocation,
  isDeviceLocationEnabled,
  markDeviceLocationReactivated,
  setDeviceLocationEnabled
} from '../utils/deviceLocation';



function PerfilPage() {
  const { currentUser, userProfile, logout } = useAuth();
  const navigate = useNavigate();
  const [installState, setInstallState] = useState({
    canInstall: false,
    installed: false
  });
  const [locationMessage, setLocationMessage] = useState('');
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [deviceLocation, setDeviceLocation] = useState(userProfile?.currentLocation || null);
  const [isGeneralOpen, setIsGeneralOpen] = useState(false);
  const [locationPermissionState, setLocationPermissionState] = useState(null);
  const [isLocationEnabled, setIsLocationEnabled] = useState(isDeviceLocationEnabled());

  useEffect(() => {
    return subscribePwaInstallState(setInstallState);
  }, []);



  useEffect(() => {
    setDeviceLocation(userProfile?.currentLocation || null);
  }, [userProfile?.currentLocation]);

  useEffect(() => {
    setIsLocationEnabled(isDeviceLocationEnabled());
  }, []);

  useEffect(() => {
    if (!navigator.permissions?.query) {
      setLocationPermissionState(null);
      return undefined;
    }

    let permissionStatus = null;
    let isCancelled = false;

    const syncPermissionState = () => {
      if (!permissionStatus || isCancelled) {
        return;
      }

      setLocationPermissionState(permissionStatus.state);
    };

    const loadPermissionState = async () => {
      try {
        permissionStatus = await navigator.permissions.query({ name: 'geolocation' });

        if (isCancelled) {
          return;
        }

        setLocationPermissionState(permissionStatus.state);
        permissionStatus.onchange = syncPermissionState;
      } catch {
        if (!isCancelled) {
          setLocationPermissionState(null);
        }
      }
    };

    void loadPermissionState();

    return () => {
      isCancelled = true;
      if (permissionStatus) {
        permissionStatus.onchange = null;
      }
    };
  }, []);

  const installLabel = installState.installed
    ? 'Aplicacion instalada'
    : installState.canInstall
      ? 'Instalar aplicacion'
      : 'Instalacion no disponible';

  const metrics = useMemo(() => ({
    totalReviews: 0,
    averageOverall: 0
  }), []);



  const handleLogout = () => {
    void logout().then(() => {
      navigate('/login');
    });
  };



  const handleInstallClick = async () => {
    if (!installState.canInstall) {
      return;
    }

    await promptPwaInstall();
  };

  const handleCaptureLocation = () => {
    if (!currentUser) {
      setLocationMessage('Primero inicia sesion para guardar la ubicacion en Firebase.');
      return;
    }

    setIsSavingLocation(true);
    setLocationMessage('Solicitando permiso para capturar la ubicacion actual...');

    void (async () => {
      try {
        const nextLocation = await captureDeviceLocation();

        await updateUserProfile(currentUser.uid, {
          currentLocation: nextLocation
        });
        setDeviceLocation(nextLocation);
        setLocationMessage('Ubicacion capturada y guardada en tu perfil Firebase.');
        setIsGeneralOpen(false);
      } catch (error) {
        setLocationMessage(error?.message || 'No se pudo guardar la ubicacion en Firebase. Intenta de nuevo.');
      } finally {
        setIsSavingLocation(false);
      }
    })();
  };

  const handleLocationPermissionToggle = () => {
    if (isLocationEnabled) {
      disableDeviceLocationUsage();
      setIsLocationEnabled(false);

      void updateUserProfile(currentUser?.uid, {
        currentLocation: null
      }).catch(() => {
        // Si falla la limpieza, no bloqueamos la interfaz.
      });

      setDeviceLocation(null);
      setLocationMessage(
        'La ubicacion se desactivo para esta app. Para revocar el permiso por completo, hazlo desde el navegador.'
      );
      return;
    }

    setDeviceLocationEnabled(true);
    setIsLocationEnabled(true);
    markDeviceLocationReactivated();
    handleCaptureLocation();
  };

  const locationPermissionLabel = isLocationEnabled ? 'Desactivar' : 'Activar';
  const locationPermissionHint =
    !isLocationEnabled
      ? 'Ubicacion desactivada para la app. Se puede volver a activar desde aqui.'
      : locationPermissionState === 'granted'
        ? 'Permiso concedido en el navegador.'
        : locationPermissionState === 'denied'
          ? 'Permiso bloqueado en el navegador.'
          : 'Aun no has autorizado el uso de la ubicacion.';

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
            <h3>{userProfile?.displayName || currentUser?.displayName || currentUser?.email || 'Usuario Firebase'}</h3>
            <p>{currentUser ? 'Sesion activa con Firebase' : 'Sin sesion iniciada'}</p>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            {currentUser ? (
              <button type="button" className="ghost-btn" onClick={handleLogout}>
                Cerrar sesion
              </button>
            ) : null}
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
        </section>

        <section className="profile-settings profile-session-panel" aria-label="Sesion Firebase">
          <h3>Sesion Firebase</h3>
          <p className="profile-session-note">
            El acceso ya no se maneja con login local en esta pantalla. Usa la pagina de inicio de
            sesion con Firebase y Google para entrar.
          </p>
          <p className="profile-session-note">
            {currentUser
              ? `Sesión activa: ${currentUser.email || 'usuario autenticado'}`
              : 'No hay una sesión Firebase activa en este momento.'}
          </p>
        </section>



        <section className="profile-settings profile-general-panel" aria-label="Ajustes generales">
          <h3>Ajustes generales</h3>
          <button
            type="button"
            className={isGeneralOpen ? 'setting-item setting-item-toggle is-open' : 'setting-item setting-item-toggle'}
            onClick={() => setIsGeneralOpen((current) => !current)}
            aria-expanded={isGeneralOpen}
            aria-controls="general-options-panel"
          >
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
              <span>General</span>
            </span>
            <span className="setting-chevron" aria-hidden="true">
              <svg viewBox="0 0 20 20" className="chevron-svg" focusable="false" aria-hidden="true">
                <path d="M7 4l6 6-6 6"></path>
              </svg>
            </span>
          </button>

          {isGeneralOpen ? (
            <div id="general-options-panel" className="general-dropdown" role="group" aria-label="Opciones generales">
              <button
                type="button"
                className="general-option"
                onClick={handleLocationPermissionToggle}
                disabled={isSavingLocation || !currentUser}
              >
                <span className="general-option-copy">
                  <strong>Ubicacion del dispositivo</strong>
                  <span>{locationPermissionHint}</span>
                </span>
                <span className="general-option-action">
                  {isSavingLocation && locationPermissionState !== 'granted'
                    ? 'Activando...'
                    : locationPermissionLabel}
                </span>
              </button>

              <p className="profile-session-note profile-location-note">
                {locationMessage || 'La ubicacion quedara asociada a tu usuario de Firebase y se mantendra entre sesiones.'}
              </p>
            </div>
          ) : null}
        </section>

        <section className="profile-settings profile-app-panel" aria-label="Aplicacion">
          <h3>Aplicacion</h3>
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
        </section>
      </section>
    </section>
  );
}

export default PerfilPage;

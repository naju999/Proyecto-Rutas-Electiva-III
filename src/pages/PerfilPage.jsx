import { useEffect, useState } from 'react';
import { promptPwaInstall, subscribePwaInstallState } from '../pwa/pwaInstall';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { updateUserProfile, subscribeToFavorites } from '../firebase/firestoreService';
import EditProfile from './EditProfile';


function PerfilPage() {
  const { currentUser, userProfile, logout, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [installState, setInstallState] = useState({
    canInstall: false,
    installed: false
  });

  const [displayName, setDisplayName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [createdAtMonth, setCreatedAtMonth] = useState('');
  const [favoritesCount, setFavoritesCount] = useState(0);

  useEffect(() => {
    return subscribePwaInstallState(setInstallState);
  }, []);

  useEffect(() => {
    if (userProfile?.displayName) {
      setDisplayName(userProfile.displayName);
    }
    // Obtener el mes de creación de la cuenta
    if (userProfile?.createdAt) {
      try {
        const createdDate = userProfile.createdAt.toDate();
        const month = createdDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
        setCreatedAtMonth(month.charAt(0).toUpperCase() + month.slice(1));
      } catch (err) {
        console.error('Error formateando fecha:', err);
        setCreatedAtMonth('');
      }
    }
  }, [userProfile]);

  // Suscribirse a cambios en favoritos
  useEffect(() => {
    if (!currentUser) return;

    const unsubscribe = subscribeToFavorites(currentUser.uid, (favorites) => {
      setFavoritesCount(favorites.length);
    });

    return unsubscribe;
  }, [currentUser]);

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

  async function handleLogout() {
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      console.error('Error:', err);
    }
  }

  async function handleSaveProfile() {
    if (!currentUser) return;

    setError('');
    setSuccess('');
    setIsSaving(true);

    try {
      await updateUserProfile(currentUser.uid, {
        displayName: displayName.trim()
      });
      setSuccess('Perfil actualizado correctamente');
      setIsEditing(false);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Error al guardar perfil:', err);
      setError('Error al actualizar el perfil');
    } finally {
      setIsSaving(false);
    }
  }

  if (authLoading) {
    return (
      <section className="view-panel active" data-view="perfil">
        <section className="profile-screen">
          <p>Cargando perfil...</p>
        </section>
      </section>
    );
  }

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

        {error && (
          <div className="error-message" style={{ margin: '15px 0' }} role="alert">
            {error}
          </div>
        )}

        {success && (
          <div style={{ padding: '10px', backgroundColor: '#d4edda', color: '#155724', borderRadius: '4px', margin: '15px 0' }} role="status">
            {success}
          </div>
        )}

        {isEditing ? (
          <EditProfile
            displayName={displayName}
            setDisplayName={setDisplayName}
            currentUser={currentUser}
            createdAtMonth={createdAtMonth}
            isSaving={isSaving}
            isEditing={isEditing}
            setIsEditing={setIsEditing}
            handleSaveProfile={handleSaveProfile}
            userProfile={userProfile}
          />
        ) : (
          <>
            <section className="profile-user-row">
              <div className="profile-avatar" aria-hidden="true">
                <svg viewBox="0 0 24 24" className="profile-avatar-icon" focusable="false" aria-hidden="true">
                  <circle cx="12" cy="8" r="4"></circle>
                  <path d="M5 20a7 7 0 0 1 14 0"></path>
                </svg>
              </div>
              <div>
                <h3>{displayName || 'Usuario TuRuta'}</h3>
                <p>{currentUser?.email}</p>
              </div>
            </section>

            <section className="profile-metrics" aria-label="Resumen de actividad">
              <article>
                <strong>--</strong>
                <span>Viajes</span>
              </article>
              <article>
                <strong>--</strong>
                <span>Rating prom.</span>
              </article>
              <article>
                <strong>{favoritesCount}</strong>
                <span>Favoritas</span>
              </article>
            </section>

            <section className="profile-settings" aria-label="Configuracion">
              <h3>Configuracion</h3>
              <button
                type="button"
                className="setting-item"
                onClick={() => setIsEditing(true)}
              >
                <span className="setting-left">
                  <span className="setting-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" className="setting-icon-svg" focusable="false" aria-hidden="true">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                  </span>
                  <span>Editar Perfil</span>
                </span>
                <span className="setting-chevron" aria-hidden="true">
                  <svg viewBox="0 0 20 20" className="chevron-svg" focusable="false" aria-hidden="true">
                    <path d="M7 4l6 6-6 6"></path>
                  </svg>
                </span>
              </button>
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
              <button
                onClick={handleLogout}
                className="logout-button logout-button-centered"
                type="button"
                aria-label="Cerrar sesión"
              >
                <span className="setting-left">
                  <span className="setting-icon" aria-hidden="true">
                    <svg
                      viewBox="0 0 24 24"
                      className="setting-icon-svg"
                      focusable="false"
                      aria-hidden="true"
                    >
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                      <path d="M16 8l3-3m0 0l-3-3m3 3H9"></path>
                    </svg>
                  </span>
                  <span>Cerrar Sesión</span>
                </span>
              </button>
            </section>
          </>
        )}
      </section>
    </section>
  );
}

export default PerfilPage;

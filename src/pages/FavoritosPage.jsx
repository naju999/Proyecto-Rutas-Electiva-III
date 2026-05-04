import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  subscribeToFavorites, 
  removeFavorite 
} from '../firebase/firestoreService';

function FavoritosPage() {
  const { currentUser, loading: authLoading } = useAuth();
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (authLoading || !currentUser) {
      setLoading(authLoading);
      return;
    }

    setLoading(true);
    setError(null);
    
    // Suscribirse a cambios en tiempo real
    const unsubscribe = subscribeToFavorites(
      currentUser.uid,
      (data) => {
        setFavorites(data);
        setLoading(false);
      }
    );

    // Limpiar suscripción al desmontar
    return unsubscribe;
  }, [currentUser, authLoading]);

  async function handleRemoveFavorite(routeId) {
    try {
      await removeFavorite(currentUser.uid, routeId);
    } catch (err) {
      console.error('Error eliminando favorito:', err);
      setError('Error al eliminar favorito');
    }
  }

  if (authLoading || loading) {
    return (
      <section className="view-panel active" data-view="favoritos">
        <section className="panel">
          <h2>Favoritos</h2>
          <p className="panel-copy">Cargando favoritos...</p>
        </section>
      </section>
    );
  }

  return (
    <section className="view-panel active" data-view="favoritos">
      <section className="panel">
        <h2>Favoritos</h2>
        
        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}

        {favorites.length === 0 ? (
          <p className="panel-copy">
            No tienes rutas favoritas aún. Guarda rutas desde el panel de búsqueda para verlas aquí.
          </p>
        ) : (
          <div className="saved-routes">
            {favorites.map((route) => (
              <article key={route.id} className="saved-route-card">
                <h3>{route.origin} → {route.destination}</h3>
                {route.distance && <p>Distancia: {route.distance}</p>}
                {route.estimatedTime && <p>Tiempo: {route.estimatedTime}</p>}
                <button 
                  onClick={() => handleRemoveFavorite(route.id)}
                  className="btn-remove"
                  style={{ marginTop: '10px', padding: '5px 10px', fontSize: '0.9em' }}
                >
                  Eliminar
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

export default FavoritosPage;

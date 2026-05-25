import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppStore } from '../store/AppStore';
import { favoritesActions } from '../store/actions';
import { selectFavoriteRoutes } from '../store/selectors';

function FavoritosPage() {
  const state = useAppStore();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const favoriteRoutes = selectFavoriteRoutes(state);

  const handleFavoriteToggle = (route) => {
    if (route.type === 'trip') {
      dispatch(favoritesActions.toggleFavoriteTripRoute(route));
      return;
    }

    dispatch(favoritesActions.toggleFavorite(route));
  };

  const handleOpenRoute = (route) => {
    if (route.type === 'trip') {
      navigate('/inicio', {
        state: {
          tripFavorite: route
        }
      });
      return;
    }

    navigate('/rutas', {
      state: {
        selectedRouteId: route.id
      }
    });
  };

  const getRouteTitle = (route) => {
    if (route.type === 'trip') {
      return route.title || `${route.origin?.label ?? 'Origen'} - ${route.destination?.label ?? 'Destino'}`;
    }

    return route.title;
  };

  const getRouteSummary = (route) => {
    if (route.type === 'trip') {
      return route.summary || route.route?.title || 'Ruta guardada con origen y destino';
    }

    return route.summary;
  };

  return (
    <section className="view-panel active" data-view="favoritos">
      <section className="panel">
        <h2>Favoritos</h2>
        <p className="panel-copy">
          Aqui se muestran solo las rutas que marcaste con el corazon desde la seccion de rutas.
        </p>
        <div className="saved-routes">
          {favoriteRoutes.length > 0 ? (
            favoriteRoutes.map((route) => (
              <article key={route.id} className="saved-route-card">
                <button
                  type="button"
                  className="saved-route-main"
                  onClick={() => handleOpenRoute(route)}
                  aria-label={`Abrir ${getRouteTitle(route)} en la vista de rutas`}
                >
                  <h3>{getRouteTitle(route)}</h3>
                  <p>{getRouteSummary(route)}</p>
                  <div className="route-card-meta">
                    <span className="route-pill">ETA {route.eta}</span>
                    <span className="route-pill route-pill-muted">Ver en rutas</span>
                  </div>
                </button>

                <button
                  type="button"
                  className="route-favorite-btn is-favorite"
                  aria-label={`Quitar ${getRouteTitle(route)} de favoritos`}
                  aria-pressed="true"
                  onClick={() => handleFavoriteToggle(route)}
                >
                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <path d="M12 21s-7.2-4.6-9.4-9.1C1 8.5 2.8 5.5 6.1 4.8c2-.4 3.9.4 5.1 1.8 1.2-1.4 3.1-2.2 5.1-1.8C19.6 5.5 21.4 8.5 21.4 11.9 19.2 16.4 12 21 12 21z"></path>
                  </svg>
                </button>
              </article>
            ))
          ) : (
            <div className="route-detail">
              <h3>Sin rutas favoritas</h3>
              <p>Marca el corazon de una ruta en la vista de rutas para verla aqui.</p>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}

export default FavoritosPage;

import { useState } from 'react';
import { useAppDispatch, useAppStore } from '../store/AppStore';
import { uiActions } from '../store/actions';
import { selectRoutesSheetCollapsed } from '../store/selectors';
import { useAuth } from '../context/AuthContext';
import { addFavorite, addRecentSearch } from '../firebase/firestoreService';

function RutasPage() {
  const state = useAppStore();
  const dispatch = useAppDispatch();
  const { currentUser } = useAuth();
  const isCollapsed = selectRoutesSheetCollapsed(state);
  
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [searchError, setSearchError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Rutas de ejemplo
  const mockRoutes = [
    {
      id: 'route-a1',
      name: 'Ruta A1 - Centro / Norte',
      description: 'Llega a 320 m de tu destino estimado',
      distance: '5.2 km',
      estimatedTime: '25 min'
    },
    {
      id: 'route-c3',
      name: 'Ruta C3 - Avenida Universitaria',
      description: 'Requiere caminar 6 minutos al final del trayecto',
      distance: '4.8 km',
      estimatedTime: '20 min'
    },
    {
      id: 'route-b2',
      name: 'Ruta B2 - Variante Oriental',
      description: 'Alternativa de menor tiempo en hora pico',
      distance: '6.1 km',
      estimatedTime: '18 min'
    }
  ];

  async function handleSearch(e) {
    e.preventDefault();
    setSearchError('');
    setSuccessMessage('');

    if (!origin.trim() || !destination.trim()) {
      setSearchError('Por favor completa origen y destino');
      return;
    }

    try {
      // Guardar búsqueda reciente en Firestore
      if (currentUser) {
        await addRecentSearch(currentUser.uid, {
          origin: origin.trim(),
          destination: destination.trim(),
          distance: '5.2 km',
          duration: '25 min'
        });
      }

      setSuccessMessage('Búsqueda registrada y rutas mostradas');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('Error al buscar:', err);
      setSearchError('Error al procesar la búsqueda');
    }
  }

  async function handleSaveFavorite(route) {
    if (!currentUser) {
      setSearchError('Debes estar autenticado para guardar favoritos');
      return;
    }

    try {
      await addFavorite(currentUser.uid, {
        origin: origin.trim() || 'Mi ubicación',
        destination: destination.trim() || 'Destino',
        distance: route.distance,
        estimatedTime: route.estimatedTime,
        transportModes: ['Autobús']
      });

      setSuccessMessage(`Ruta guardada en favoritos: ${route.name}`);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('Error guardando favorito:', err);
      setSearchError('Error al guardar favorito');
    }
  }

  return (
    <section className="view-panel active" data-view="rutas">
      <div className="routes-sheet-header">
        <button
          type="button"
          className="routes-sheet-toggle"
          id="toggleRoutesSheetBtn"
          aria-expanded={String(!isCollapsed)}
          aria-label={isCollapsed ? 'Expandir panel de rutas' : 'Minimizar panel de rutas'}
          onClick={() => dispatch(uiActions.toggleRoutesSheetCollapsed())}
        >
          <span className="sheet-grabber" aria-hidden="true"></span>
          <span id="routesSheetToggleLabel">{isCollapsed ? 'Mostrar panel' : 'Panel de rutas'}</span>
        </button>
      </div>

      <section className="panel">
        {searchError && (
          <div className="error-message" role="alert" style={{ marginBottom: '15px' }}>
            {searchError}
          </div>
        )}

        {successMessage && (
          <div style={{ padding: '10px', backgroundColor: '#d4edda', color: '#155724', borderRadius: '4px', marginBottom: '15px' }} role="status">
            {successMessage}
          </div>
        )}

        <form className="trip-form" onSubmit={handleSearch}>
          <label htmlFor="originInput">Donde estás</label>
          <div className="input-with-action">
            <input 
              id="originInput" 
              type="text" 
              placeholder="Ej: Plaza de Bolivar, Tunja"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
            />
            <button type="button" className="ghost-btn" id="useCurrentLocationBtn">
              Usar mi ubicación
            </button>
          </div>

          <label htmlFor="destinationInput">A donde quieres ir</label>
          <input
            id="destinationInput"
            type="text"
            placeholder="Ej: Universidad Pedagógica y Tecnológica de Colombia"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          />

          <button type="submit" className="primary-btn" id="findRoutesBtn">
            Buscar rutas de buses
          </button>
        </form>
        
        <div id="routeSuggestionStatus" className="note-box">
          {origin && destination 
            ? `Buscando rutas de "${origin}" a "${destination}"...` 
            : 'Aún no hay una búsqueda activa. Completa origen y destino para ver sugerencias.'
          }
        </div>
      </section>

      <section className="panel">
        <h2>Rutas disponibles</h2>
        <ul className="route-list">
          {mockRoutes.map((route) => (
            <li key={route.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px', borderBottom: '1px solid #eee' }}>
              <div>
                <strong>{route.name}</strong>
                <span style={{ display: 'block', fontSize: '0.9em', color: '#666' }}>{route.description}</span>
                <span style={{ display: 'block', fontSize: '0.85em', color: '#999' }}>
                  {route.distance} • {route.estimatedTime}
                </span>
              </div>
              <button 
                type="button"
                onClick={() => handleSaveFavorite(route)}
                disabled={!currentUser}
                style={{ 
                  padding: '5px 10px', 
                  backgroundColor: currentUser ? '#ff6b6b' : '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: currentUser ? 'pointer' : 'not-allowed',
                  fontSize: '0.85em'
                }}
                title={currentUser ? 'Guardar como favorito' : 'Debes estar autenticado'}
              >
                ❤️
              </button>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}

export default RutasPage;

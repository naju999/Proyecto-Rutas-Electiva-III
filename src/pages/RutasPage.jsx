import { useAppDispatch, useAppStore } from '../store/AppStore';
import { uiActions } from '../store/actions';
import { selectRoutesSheetCollapsed } from '../store/selectors';

function RutasPage() {
  const state = useAppStore();
  const dispatch = useAppDispatch();
  const isCollapsed = selectRoutesSheetCollapsed(state);

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
        <form className="trip-form" onSubmit={event => event.preventDefault()}>
          <label htmlFor="originInput">Donde estas</label>
          <div className="input-with-action">
            <input id="originInput" type="text" placeholder="Ej: Plaza de Bolivar, Tunja" />
            <button type="button" className="ghost-btn" id="useCurrentLocationBtn">
              Usar mi ubicacion
            </button>
          </div>

          <label htmlFor="destinationInput">A donde quieres ir</label>
          <input
            id="destinationInput"
            type="text"
            placeholder="Ej: Universidad Pedagogica y Tecnologica de Colombia"
          />

          <button type="button" className="primary-btn" id="findRoutesBtn">
            Buscar rutas de buses
          </button>
        </form>
        <div id="routeSuggestionStatus" className="note-box">
          Aun no hay una busqueda activa. Completa origen y destino para ver sugerencias.
        </div>
      </section>

      <section className="panel">
        <h2>Rutas disponibles</h2>
        <ul className="route-list">
          <li>
            <strong>Ruta A1 - Centro / Norte</strong>
            <span>Llega a 320 m de tu destino estimado</span>
          </li>
          <li>
            <strong>Ruta C3 - Avenida Universitaria</strong>
            <span>Requiere caminar 6 minutos al final del trayecto</span>
          </li>
          <li>
            <strong>Ruta B2 - Variante Oriental</strong>
            <span>Alternativa de menor tiempo en hora pico</span>
          </li>
        </ul>
      </section>
    </section>
  );
}

export default RutasPage;

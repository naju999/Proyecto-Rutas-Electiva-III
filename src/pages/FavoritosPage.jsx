function FavoritosPage() {
  return (
    <section className="view-panel active" data-view="favoritos">
      <section className="panel">
        <h2>Favoritos</h2>
        <p className="panel-copy">
          Aqui se muestran las rutas favoritas del usuario y las mas recientes consultadas.
        </p>
        <div className="saved-routes">
          <article className="saved-route-card">
            <h3>Casa -&gt; UPTC</h3>
            <p>Ruta guardada como favorita.</p>
          </article>
          <article className="saved-route-card">
            <h3>Terminal -&gt; Centro</h3>
            <p>Consulta reciente de esta semana.</p>
          </article>
          <article className="saved-route-card">
            <h3>Barrio Norte -&gt; Hospital</h3>
            <p>Guardada por tiempo de viaje eficiente.</p>
          </article>
        </div>
      </section>
    </section>
  );
}

export default FavoritosPage;

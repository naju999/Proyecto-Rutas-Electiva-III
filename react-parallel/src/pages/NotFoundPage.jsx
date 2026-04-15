import { Link } from 'react-router-dom';

function NotFoundPage() {
  return (
    <section className="view-panel active">
      <section className="panel">
        <h2>Ruta no encontrada</h2>
        <p className="panel-copy">La vista solicitada no existe en este cascaron.</p>
        <Link to="/inicio" className="inline-link">
          Ir a inicio
        </Link>
      </section>
    </section>
  );
}

export default NotFoundPage;

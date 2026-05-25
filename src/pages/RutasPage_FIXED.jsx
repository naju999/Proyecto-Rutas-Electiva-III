// Script para mostrar la línea que necesita cambio
// Cambiar esta línea:
// {isSelected && selectedRouteView ? (

// Por esta:
// {isSearchResult && isSelected ? (

// El `isSearchResult` se define localmente en el map como:
// const isSearchResult = Boolean(routeView);

// Y esto funciona porque cada entrada en visibleRoutes que viene de searchResults
// tendrá un routeView definido.

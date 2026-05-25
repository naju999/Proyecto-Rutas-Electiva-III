// Fix para el problema de los botones de Iniciar/Finalizar ruta
// 
// El problema: La condición {isSelected && selectedRouteView ? está incorrecta
// 
// Solución: Cambiar a {isSearchResult && isSelected ? (
// 
// Porque isSearchResult se define localmente como:
// const isSearchResult = Boolean(routeView);
//
// Y esto determina correctamente si la ruta proviene de un resultado de búsqueda
// (que tiene routeView) o del catálogo general (que no tiene routeView).

// Cambios necesarios en src/pages/RutasPage.jsx línea 1017:
// 
// ANTES:
// {isSelected && selectedRouteView ? (
//
// DESPUÉS:
// {isSearchResult && isSelected ? (

function syncLayoutMeasurements() {
    const header = document.getElementById('header');
    const bottomNav = document.querySelector('.bottom-nav');

    if (header) {
        document.documentElement.style.setProperty('--header-height', `${header.offsetHeight}px`);
    }

    if (bottomNav) {
        document.documentElement.style.setProperty('--nav-height', `${bottomNav.offsetHeight}px`);
    }
}

function setOverlayCollapsedState(isCollapsed) {
    const overlay = document.getElementById('homeMapOverlay');
    const toggleOverlayBtn = document.getElementById('toggleHomeOverlayBtn');
    if (!overlay || !toggleOverlayBtn) return;

    overlay.classList.toggle('is-collapsed', isCollapsed);
    toggleOverlayBtn.textContent = isCollapsed ? '+' : '-';
    toggleOverlayBtn.setAttribute('aria-expanded', String(!isCollapsed));
    toggleOverlayBtn.setAttribute(
        'aria-label',
        isCollapsed ? 'Expandir panel de informacion' : 'Minimizar panel de informacion'
    );
}

function adaptInicioOverlayForMobile(viewName) {
    if (viewName !== 'inicio') return;
    setOverlayCollapsedState(window.innerWidth <= 720);
}

function setRoutesSheetCollapsedState(isCollapsed) {
    const routesToggleBtn = document.getElementById('toggleRoutesSheetBtn');
    const routesToggleLabel = document.getElementById('routesSheetToggleLabel');

    document.body.classList.toggle('routes-sheet-collapsed', isCollapsed);

    if (routesToggleBtn) {
        routesToggleBtn.setAttribute('aria-expanded', String(!isCollapsed));
        routesToggleBtn.setAttribute(
            'aria-label',
            isCollapsed ? 'Expandir panel de rutas' : 'Minimizar panel de rutas'
        );
    }

    if (routesToggleLabel) {
        routesToggleLabel.textContent = isCollapsed ? 'Mostrar panel' : 'Panel de rutas';
    }
}

function syncRoutesSheetForView(viewName) {
    if (viewName !== 'rutas') {
        setRoutesSheetCollapsedState(false);
        return;
    }

    setRoutesSheetCollapsedState(window.innerWidth <= 720);
}

function setActiveView(viewName) {
    const panels = document.querySelectorAll('.view-panel');
    const navButtons = document.querySelectorAll('.nav-item');
    const mapWorkspace = document.getElementById('mapWorkspace');
    const isMapView = viewName === 'inicio' || viewName === 'rutas';

    document.body.setAttribute('data-active-view', viewName);

    panels.forEach((panel) => {
        const isActive = panel.dataset.view === viewName;
        panel.classList.toggle('active', isActive);
    });

    navButtons.forEach((button) => {
        const isActive = button.dataset.view === viewName;
        button.classList.toggle('active', isActive);
        if (isActive) {
            button.setAttribute('aria-current', 'page');
        } else {
            button.removeAttribute('aria-current');
        }
    });

    mapWorkspace.classList.toggle('is-hidden', !isMapView);
    adaptInicioOverlayForMobile(viewName);
    syncRoutesSheetForView(viewName);
    syncLayoutMeasurements();

    if (window.MAP_STATE && MAP_STATE.map && isMapView) {
        setTimeout(() => MAP_STATE.map.invalidateSize(false), 180);
    }
}

async function loadViewPartials() {
    const sidebar = document.getElementById('sidebar');
    const viewFiles = [
        'views/inicio.html',
        'views/rutas.html',
        'views/favoritos.html',
        'views/perfil.html'
    ];

    const responses = await Promise.all(
        viewFiles.map((path) => fetch(path, { cache: 'no-cache' }))
    );

    for (const response of responses) {
        if (!response.ok) {
            throw new Error('No se pudo cargar una vista modular.');
        }
    }

    const htmlParts = await Promise.all(responses.map((response) => response.text()));
    sidebar.innerHTML = htmlParts.join('\n');
}

function setupUiEvents() {
    document.querySelectorAll('.nav-item').forEach((button) => {
        button.addEventListener('click', () => setActiveView(button.dataset.view));
    });

    document.querySelectorAll('[data-go-view]').forEach((button) => {
        button.addEventListener('click', () => setActiveView(button.dataset.goView));
    });

    const overlay = document.getElementById('homeMapOverlay');
    const toggleOverlayBtn = document.getElementById('toggleHomeOverlayBtn');

    if (overlay && toggleOverlayBtn) {
        toggleOverlayBtn.addEventListener('click', () => {
            const isCollapsed = !overlay.classList.contains('is-collapsed');
            setOverlayCollapsedState(isCollapsed);

            if (window.MAP_STATE && MAP_STATE.map) {
                setTimeout(() => MAP_STATE.map.invalidateSize(false), 120);
            }
        });
    }

    const routesToggleBtn = document.getElementById('toggleRoutesSheetBtn');
    if (routesToggleBtn && !routesToggleBtn.dataset.bound) {
        routesToggleBtn.dataset.bound = '1';
        routesToggleBtn.addEventListener('click', () => {
            const isCollapsed = !document.body.classList.contains('routes-sheet-collapsed');
            setRoutesSheetCollapsedState(isCollapsed);
        });
    }
}

function loadAppScript() {
    const appScript = document.createElement('script');
    appScript.src = 'js/app.js';
    document.body.appendChild(appScript);
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadViewPartials();
        setupUiEvents();
        syncLayoutMeasurements();
        setActiveView(document.body.getAttribute('data-active-view') || 'inicio');

        let resizeTimer = null;
        window.addEventListener('resize', () => {
            if (resizeTimer) {
                clearTimeout(resizeTimer);
            }
            resizeTimer = setTimeout(() => {
                resizeTimer = null;
                const activeView = document.body.getAttribute('data-active-view') || 'inicio';
                syncLayoutMeasurements();
                adaptInicioOverlayForMobile(activeView);
                syncRoutesSheetForView(activeView);
                if (window.MAP_STATE && MAP_STATE.map && (activeView === 'inicio' || activeView === 'rutas')) {
                    MAP_STATE.map.invalidateSize(false);
                }
            }, 120);
        });

        loadAppScript();
    } catch (error) {
        console.error(error);
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            sidebar.innerHTML = '<section class="view-panel active" data-view="inicio"><section class="panel"><h2>Error</h2><p class="panel-copy">No se pudieron cargar las vistas.</p></section></section>';
        }
    }
});

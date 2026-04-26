import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright-core';

const BASE_URL = process.env.QA_BASE_URL || 'http://127.0.0.1:4173';
const OUTPUT_DIR = path.resolve(process.cwd(), 'qa-results');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'phase7-qa-report.json');

const CANDIDATE_BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'
];

const LAYER_ATTRIBUTION_MARKERS = {
  openstreetmap: 'OpenStreetMap',
  satellite: 'USGS',
  terrain: 'OpenTopoMap'
};

function nowIso() {
  return new Date().toISOString();
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveBrowserPath() {
  for (const candidate of CANDIDATE_BROWSERS) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  throw new Error('No se encontro Edge/Chrome local para ejecutar QA automatizada.');
}

async function addQaInitScript(page) {
  await page.addInitScript(() => {
    window.__qaMetrics = {
      startAt: performance.now(),
      firstTileAt: null
    };

    const setFirstTile = () => {
      if (window.__qaMetrics.firstTileAt !== null) return;
      const tile = document.querySelector('#map img.leaflet-tile-loaded');
      if (!tile) return;
      window.__qaMetrics.firstTileAt = performance.now();
    };

    const observer = new MutationObserver(setFirstTile);

    const startObserver = () => {
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class']
      });
      setFirstTile();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startObserver, { once: true });
    } else {
      startObserver();
    }

    window.addEventListener('load', setFirstTile);
  });
}

async function measureLayerSwitch(page, layerName, attributionMarker) {
  const selector = `input[name="layer"][value="${layerName}"]`;
  const start = Date.now();
  await page.click(selector);
  await page.waitForFunction(
    ({ marker, layer }) => {
      const selected = document.querySelector(`input[name="layer"][value="${layer}"]`);
      if (!selected || !selected.checked) {
        return false;
      }

      const attribution = document.querySelector('.leaflet-control-attribution');
      if (!attribution) {
        return false;
      }

      const text = attribution.textContent || '';
      return text.includes(marker);
    },
    { marker: attributionMarker, layer: layerName },
    { timeout: 45000 }
  );

  return Date.now() - start;
}

async function collectOnlineScenario(page) {
  await addQaInitScript(page);

  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', (error) => {
    pageErrors.push(String(error));
  });

  await page.goto(`${BASE_URL}/inicio`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#map', { timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__qaMetrics?.firstTileAt), null, { timeout: 25000 });

  const timings = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    return {
      domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      loadEventMs: nav ? Math.round(nav.loadEventEnd) : null,
      firstTileMs: window.__qaMetrics ? Math.round(window.__qaMetrics.firstTileAt) : null
    };
  });

  await page.goto(`${BASE_URL}/rutas`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#map', { timeout: 20000 });

  const layerTimesMs = {
    openstreetmap: await measureLayerSwitch(page, 'openstreetmap', LAYER_ATTRIBUTION_MARKERS.openstreetmap),
    satellite: await measureLayerSwitch(page, 'satellite', LAYER_ATTRIBUTION_MARKERS.satellite),
    terrain: await measureLayerSwitch(page, 'terrain', LAYER_ATTRIBUTION_MARKERS.terrain)
  };

  await page.click('button:has-text("Zoom +")');
  await page.click('button:has-text("Zoom -")');

  const routeToggleBefore = await page.isChecked('label.route-toggle input[type="checkbox"]');
  await page.click('label.route-toggle input[type="checkbox"]');
  const routeToggleAfter = await page.isChecked('label.route-toggle input[type="checkbox"]');

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#map', { timeout: 20000 });

  const controllerState = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) {
      return { supported: false, controlled: false };
    }

    const registration = await navigator.serviceWorker.getRegistration('/');
    return {
      supported: true,
      controlled: Boolean(navigator.serviceWorker.controller),
      hasRegistration: Boolean(registration)
    };
  });

  return {
    timings,
    layerTimesMs,
    routeToggle: {
      before: routeToggleBefore,
      after: routeToggleAfter,
      ok: routeToggleBefore !== routeToggleAfter
    },
    errors: {
      consoleErrorCount: consoleErrors.length,
      pageErrorCount: pageErrors.length,
      consoleErrors,
      pageErrors
    },
    serviceWorker: controllerState
  };
}

async function collectFast3gScenario(browserPath) {
  const browser = await chromium.launch({
    executablePath: browserPath,
    headless: true
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  await addQaInitScript(page);

  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: 209715,
    uploadThroughput: 98304,
    connectionType: 'cellular3g'
  });

  await page.goto(`${BASE_URL}/inicio`, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForSelector('#map', { timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__qaMetrics?.firstTileAt), null, { timeout: 30000 });

  const timing = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    return {
      domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      loadEventMs: nav ? Math.round(nav.loadEventEnd) : null,
      firstTileMs: window.__qaMetrics ? Math.round(window.__qaMetrics.firstTileAt) : null
    };
  });

  await context.close();
  await browser.close();

  return timing;
}

async function collectOfflineScenario(browserPath) {
  const browser = await chromium.launch({
    executablePath: browserPath,
    headless: true
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/inicio`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#map', { timeout: 20000 });

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#map', { timeout: 20000 });

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });

  const offlineState = await page.evaluate(() => {
    const hasMapTitle = document.body.textContent.includes('Rutas de Buses de Tunja');
    const hasOfflineFallback = document.body.textContent.includes('Sin conexion');
    return {
      hasMapTitle,
      hasOfflineFallback
    };
  });

  await context.close();
  await browser.close();

  return {
    ok: offlineState.hasMapTitle || offlineState.hasOfflineFallback,
    mode: offlineState.hasMapTitle ? 'app-shell' : offlineState.hasOfflineFallback ? 'offline-fallback' : 'unknown'
  };
}

async function main() {
  const browserPath = await resolveBrowserPath();

  const browser = await chromium.launch({
    executablePath: browserPath,
    headless: true
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  const online = await collectOnlineScenario(page);

  await context.close();
  await browser.close();

  const fast3g = await collectFast3gScenario(browserPath);
  const offline = await collectOfflineScenario(browserPath);

  const report = {
    generatedAt: nowIso(),
    baseUrl: BASE_URL,
    browserPath,
    scenarios: {
      online,
      fast3g,
      offline
    },
    summary: {
      pass: Boolean(
        online.routeToggle.ok &&
          online.errors.consoleErrorCount === 0 &&
          online.errors.pageErrorCount === 0 &&
          offline.ok
      )
    }
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(report, null, 2), 'utf8');

  console.log(`QA report generado en: ${OUTPUT_FILE}`);
  console.log(JSON.stringify(report.summary, null, 2));

  if (!report.summary.pass) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Fallo QA Fase 7:', error);
  process.exitCode = 1;
});

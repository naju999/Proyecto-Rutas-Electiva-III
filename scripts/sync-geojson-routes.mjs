import { promises as fs } from 'node:fs';
import path from 'node:path';

const DATABASE_DIR = path.join(process.cwd(), 'database');
const PUBLIC_DATA_DIR = path.join(process.cwd(), 'public', 'data');
const PUBLIC_ROUTES_DIR = path.join(PUBLIC_DATA_DIR, 'routes');
const MANIFEST_PATH = path.join(PUBLIC_DATA_DIR, 'routes-manifest.json');

const DISPATCH_PATTERN = /despach|depacho/i;
const ROUTE_CODE_PATTERN = /^Ruta([0-9]+[A-Za-z]*)-/i;

function compareFileNames(a, b) {
  return a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });
}

function sortRouteCodes(a, b) {
  return a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });
}

function toPublicRoutePath(fileName) {
  return `/data/routes/${encodeURIComponent(fileName)}`;
}

async function ensureDirectories() {
  await fs.mkdir(PUBLIC_DATA_DIR, { recursive: true });
  await fs.mkdir(PUBLIC_ROUTES_DIR, { recursive: true });
}

async function clearRoutesDirectory() {
  const entries = await fs.readdir(PUBLIC_ROUTES_DIR, { withFileTypes: true });
  const removals = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.geojson'))
    .map((entry) => fs.unlink(path.join(PUBLIC_ROUTES_DIR, entry.name)));

  await Promise.all(removals);
}

async function readDatabaseGeoJsonFiles() {
  const entries = await fs.readdir(DATABASE_DIR, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.geojson'))
    .map((entry) => entry.name)
    .sort(compareFileNames);
}

function groupFilesByRoute(fileNames) {
  const grouped = new Map();

  fileNames.forEach((fileName) => {
    const routeMatch = fileName.match(ROUTE_CODE_PATTERN);
    if (!routeMatch) {
      return;
    }

    const routeCode = `Ruta${String(routeMatch[1]).toUpperCase()}`;
    const route = grouped.get(routeCode) ?? {
      dispatchFiles: [],
      directionFiles: []
    };

    if (DISPATCH_PATTERN.test(fileName)) {
      route.dispatchFiles.push(fileName);
    } else {
      route.directionFiles.push(fileName);
    }

    grouped.set(routeCode, route);
  });

  return grouped;
}

async function copyGeoJsonFiles(fileNames) {
  await Promise.all(
    fileNames.map((fileName) => {
      const sourcePath = path.join(DATABASE_DIR, fileName);
      const targetPath = path.join(PUBLIC_ROUTES_DIR, fileName);
      return fs.copyFile(sourcePath, targetPath);
    })
  );
}

async function buildManifest() {
  await ensureDirectories();
  await clearRoutesDirectory();

  const sourceFiles = await readDatabaseGeoJsonFiles();
  const grouped = groupFilesByRoute(sourceFiles);

  const incompleteRoutes = [];
  const manifestRoutes = [];
  const copiedFiles = new Set();

  [...grouped.entries()]
    .sort(([codeA], [codeB]) => sortRouteCodes(codeA, codeB))
    .forEach(([routeCode, routeFiles]) => {
      const dispatchCandidates = [...routeFiles.dispatchFiles].sort(compareFileNames);
      const directionCandidates = [...routeFiles.directionFiles].sort(compareFileNames);

      if (dispatchCandidates.length < 1 || directionCandidates.length < 2) {
        incompleteRoutes.push({
          routeCode,
          dispatchCount: dispatchCandidates.length,
          directionCount: directionCandidates.length
        });
        return;
      }

      const dispatchFile = dispatchCandidates[0];
      const outboundFile = directionCandidates[0];
      const inboundFile = directionCandidates[1];

      copiedFiles.add(dispatchFile);
      copiedFiles.add(outboundFile);
      copiedFiles.add(inboundFile);

      manifestRoutes.push({
        id: routeCode,
        code: routeCode,
        title: routeCode.replace('Ruta', 'Ruta '),
        summary: `${routeCode} con despachos y dos sentidos de recorrido.`,
        detail: 'Datos cargados desde archivos GeoJSON del proyecto.',
        eta: 'Variable',
        files: {
          dispatch_points: toPublicRoutePath(dispatchFile),
          outbound_route: toPublicRoutePath(outboundFile),
          inbound_route: toPublicRoutePath(inboundFile)
        },
        source_files: {
          dispatch_points: dispatchFile,
          outbound_route: outboundFile,
          inbound_route: inboundFile
        }
      });
    });

  await copyGeoJsonFiles([...copiedFiles]);

  const manifest = {
    generated_at: new Date().toISOString(),
    total_routes: manifestRoutes.length,
    routes: manifestRoutes
  };

  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  return {
    totalSourceFiles: sourceFiles.length,
    totalRoutes: manifestRoutes.length,
    incompleteRoutes
  };
}

(async () => {
  try {
    const result = await buildManifest();

    console.log(`Manifest generado en public/data/routes-manifest.json`);
    console.log(`GeoJSON encontrados en database: ${result.totalSourceFiles}`);
    console.log(`Rutas completas publicadas: ${result.totalRoutes}`);

    if (result.incompleteRoutes.length > 0) {
      console.warn('Rutas incompletas (se omitieron del manifest):');
      result.incompleteRoutes.forEach((item) => {
        console.warn(
          `- ${item.routeCode}: despachos=${item.dispatchCount}, sentidos=${item.directionCount}`
        );
      });
    }
  } catch (error) {
    console.error('No se pudo sincronizar los GeoJSON de rutas.', error);
    process.exitCode = 1;
  }
})();

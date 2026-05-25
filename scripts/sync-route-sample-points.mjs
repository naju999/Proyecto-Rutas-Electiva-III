import fs from 'fs/promises';
import path from 'path';

const ROOT_DIR = path.resolve('.');
const SOURCE_DIR = path.join(ROOT_DIR, 'database', 'sampled_points');
const TARGET_DIR = path.join(ROOT_DIR, 'public', 'data', 'sample-points');

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function main() {
  await ensureDir(TARGET_DIR);

  const entries = await fs.readdir(SOURCE_DIR, { withFileTypes: true });
  const geojsonFiles = entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.geojson'));

  await Promise.all(
    geojsonFiles.map(async (entry) => {
      const sourcePath = path.join(SOURCE_DIR, entry.name);
      const targetPath = path.join(TARGET_DIR, entry.name);
      await fs.copyFile(sourcePath, targetPath);
    })
  );

  console.log(`Sample points sincronizados: ${geojsonFiles.length} archivos`);
}

main().catch((error) => {
  console.error(`No se pudieron sincronizar los sample points: ${error.message}`);
  process.exitCode = 1;
});

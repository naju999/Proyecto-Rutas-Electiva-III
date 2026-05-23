import fs from 'fs/promises'
import path from 'path'
import * as turf from '@turf/turf'

const INTERVAL_METERS = 50
const INPUT_DIR = path.resolve('./database')
const OUTPUT_DIR = path.resolve('./database/sampled_points')

async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true })
  } catch (e) {
    // ignore
  }
}

function basenameNoExt(file) {
  return path.basename(file).replace(/\.geojson$/i, '')
}

async function processFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8')
  const geo = JSON.parse(raw)
  const features = geo.type === 'FeatureCollection' ? geo.features : [geo]
  const points = []
  for (const feat of features) {
    const geom = feat.geometry
    if (!geom) continue
    if (geom.type === 'LineString') {
      const line = turf.lineString(geom.coordinates)
      const lengthKm = turf.length(line, { units: 'kilometers' })
      const lengthMeters = lengthKm * 1000
      const steps = Math.max(1, Math.floor(lengthMeters / INTERVAL_METERS))
      for (let i = 0; i <= steps; i++) {
        const distKm = (i * INTERVAL_METERS) / 1000
        if (distKm > lengthKm) break
        const pt = turf.along(line, distKm, { units: 'kilometers' })
        pt.properties = pt.properties || {}
        pt.properties._source = basenameNoExt(filePath)
        pt.properties._segmentIndex = 0
        pt.properties._position = i
        points.push(pt)
      }
    } else if (geom.type === 'MultiLineString') {
      let segIndex = 0
      for (const coords of geom.coordinates) {
        const line = turf.lineString(coords)
        const lengthKm = turf.length(line, { units: 'kilometers' })
        const lengthMeters = lengthKm * 1000
        const steps = Math.max(1, Math.floor(lengthMeters / INTERVAL_METERS))
        for (let i = 0; i <= steps; i++) {
          const distKm = (i * INTERVAL_METERS) / 1000
          if (distKm > lengthKm) break
          const pt = turf.along(line, distKm, { units: 'kilometers' })
          pt.properties = pt.properties || {}
          pt.properties._source = basenameNoExt(filePath)
          pt.properties._segmentIndex = segIndex
          pt.properties._position = i
          points.push(pt)
        }
        segIndex++
      }
    }
  }

  const fc = {
    type: 'FeatureCollection',
    features: points
  }

  const outName = basenameNoExt(filePath) + '-samples.geojson'
  const outPath = path.join(OUTPUT_DIR, outName)
  await fs.writeFile(outPath, JSON.stringify(fc, null, 2), 'utf8')
  console.log('Wrote', outPath, 'points:', points.length)
}

async function main() {
  await ensureDir(OUTPUT_DIR)
  const dirents = await fs.readdir(INPUT_DIR, { withFileTypes: true })
  const geojsonFiles = dirents
    .filter(d => d.isFile() && d.name.toLowerCase().endsWith('.geojson'))
    .map(d => path.join(INPUT_DIR, d.name))

  for (const file of geojsonFiles) {
    try {
      console.log('Processing', file)
      await processFile(file)
    } catch (e) {
      console.error('Failed', file, e.message)
    }
  }
  console.log('Done.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

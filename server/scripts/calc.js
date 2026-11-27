/**
 * Procesa todos los AT03 de data/periodos y escribe los entregables 2 a 5 en output/.
 * Uso: npm run calc [-- <dirPeriodos> <dirSalida>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalogs } from '../src/engine/catalogs.js';
import { buildDataset } from '../src/engine/pipeline.js';
import * as X from '../src/engine/exports.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const periodosDir = path.resolve(process.argv[2] || path.join(root, 'data/periodos'));
const outDir = path.resolve(process.argv[3] || path.join(root, 'output'));

const t0 = Date.now();
const catalogs = loadCatalogs(path.join(root, 'data/catalogos'));
const files = fs.readdirSync(periodosDir).filter((f) => f.toLowerCase().endsWith('.csv')).sort()
  .map((name) => ({ name, text: fs.readFileSync(path.join(periodosDir, name), 'utf8') }));
const { periods, comparisons, fileErrors } = buildDataset(files, catalogs);

fs.mkdirSync(outDir, { recursive: true });
const write = (n, c) => fs.writeFileSync(path.join(outDir, n), c, 'utf8');
write('rankings.csv', X.exportRankings(periods));
write('subactividades.csv', X.exportSubactividades(periods));
write('calidad.csv', X.exportCalidad(periods));
write('movimientos.csv', X.exportMovimientos(comparisons));
write('filas_excluidas.csv', X.exportExcluidas(periods));
write('alertas.csv', X.exportAlertas(periods));

for (const e of fileErrors) console.error(`ARCHIVO RECHAZADO ${e.archivo}:\n  - ${e.errores.join('\n  - ')}`);
console.table(periods.map((p) => {
  const { Conteo_Independiente, ...q } = p.quality;
  return q;
}));
console.log(`Listo en ${Date.now() - t0} ms. Salida: ${outDir}`);

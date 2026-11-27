/**
 * Prepara la demostración del entregable 7: "procesar julio y agosto y luego cargar septiembre".
 *   npm run demo:preparar   -> mueve el período más reciente a data/demo/ (quedan los anteriores)
 *   npm run demo:restaurar  -> devuelve a data/periodos/ los archivos que estén en data/demo/
 * Durante la demo, el Administrador carga el archivo de data/demo/ desde Administración.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const periodos = path.join(root, 'data/periodos');
const demo = path.join(root, 'data/demo');
const accion = process.argv[2];
fs.mkdirSync(demo, { recursive: true });

if (accion === 'preparar') {
  // Ordena por el campo Fecha de la primera fila de datos (la regla del reto), no por el nombre del archivo
  const fechaDe = (f) => {
    const [header, primera = ''] = fs.readFileSync(path.join(periodos, f), 'utf8').replace(/^\ufeff/, '').split(/\r?\n/, 2);
    const i = header.split(',').indexOf('Fecha');
    return i >= 0 ? primera.split(',')[i] || '' : '';
  };
  const files = fs.readdirSync(periodos).filter((f) => f.toLowerCase().endsWith('.csv'))
    .map((f) => ({ f, fecha: fechaDe(f) })).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.f.localeCompare(b.f)).map((x) => x.f);
  if (files.length < 2) { console.error('Se necesitan al menos 2 períodos en data/periodos.'); process.exit(1); }
  const ultimo = files.at(-1);
  fs.renameSync(path.join(periodos, ultimo), path.join(demo, ultimo));
  console.log(`Listo. Quedan ${files.length - 1} período(s) cargados: ${files.slice(0, -1).join(', ')}.`);
  console.log(`Reinicie el servidor (npm start) y, como Administrador, cargue:\n  ${path.join(demo, ultimo)}`);
} else if (accion === 'restaurar') {
  const files = fs.readdirSync(demo).filter((f) => f.toLowerCase().endsWith('.csv'));
  for (const f of files) {
    if (fs.existsSync(path.join(periodos, f))) { fs.rmSync(path.join(demo, f)); continue; } // ya fue cargado en la demo
    fs.renameSync(path.join(demo, f), path.join(periodos, f));
  }
  console.log(files.length ? `Restaurado(s): ${files.join(', ')}. Reinicie el servidor.` : 'No había archivos en data/demo.');
} else {
  console.error('Uso: node server/scripts/demo.js preparar|restaurar');
  process.exit(1);
}

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store/store.js';
import { initPasswords } from './api/auth.js';
import { createApp } from './app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
try { process.loadEnvFile(path.join(root, '.env')); } catch { /* .env es opcional */ }

const PORT = Number(process.env.PORT || 3001);
const store = new Store(path.resolve(root, process.env.DATA_DIR || 'data'));
console.log(`[datos] ${store.periods.length} período(s) calculado(s) en ${store.lastDurationMs} ms: ${store.periods.map((p) => p.fecha).join(', ')}`);
for (const e of store.fileErrors) console.warn(`[datos] Archivo rechazado ${e.archivo}: ${e.errores.join(' ')}`);

createApp(store, initPasswords(), path.join(root, 'client/dist'))
  .listen(PORT, '127.0.0.1', () => console.log(`[api] Abra http://127.0.0.1:${PORT} en el navegador`));

/**
 * Prueba de punta a punta de la API: simula la demo del jurado.
 * Arranca con julio y agosto, verifica permisos por perfil y luego el Administrador carga septiembre.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store/store.js';
import { createApp } from '../src/app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sbp-test-'));
const PW = { analista: 'test-analista', administrador: 'test-admin' };
let server; let base;

before(async () => {
  fs.cpSync(path.join(root, 'data/catalogos'), path.join(tmp, 'catalogos'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'periodos'));
  for (const f of ['AT03_sintetico_202607.csv', 'AT03_sintetico_202608.csv']) {
    fs.copyFileSync(path.join(root, 'data/periodos', f), path.join(tmp, 'periodos', f));
  }
  const app = createApp(new Store(tmp), PW);
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => { server?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const login = async (perfil, password) => {
  const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ perfil, password }) });
  return r.ok ? (await r.json()).token : null;
};
const upload = (token, nombre, body, extra = '') => fetch(`${base}/admin/periods?nombre=${nombre}${extra}`, {
  method: 'POST', headers: { 'Content-Type': 'text/csv', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body,
});

test('público consulta y descarga, pero no compara ni carga', async () => {
  const meta = await (await fetch(`${base}/meta`)).json();
  assert.deepEqual(meta.periodos.map((p) => p.fecha), ['20260731', '20260831']);
  assert.match(meta.fuente, /ficticios/);
  const rk = await (await fetch(`${base}/periods/20260831/rankings?ranking=HIPOTECARIO`)).json();
  assert.equal(rk.HIPOTECARIO.length, 12);
  assert.equal((await fetch(`${base}/export/rankings.csv`)).status, 200);
  assert.equal((await fetch(`${base}/compare?desde=20260731&hasta=20260831`)).status, 403);
  assert.equal((await upload(null, 'x.csv', 'a,b')).status, 403);
});

test('contraseña incorrecta es rechazada; analista compara pero no administra', async () => {
  assert.equal(await login('administrador', 'mala'), null);
  const t = await login('analista', PW.analista);
  const auth = { headers: { Authorization: `Bearer ${t}` } };
  const cmp = await (await fetch(`${base}/compare?desde=20260731&hasta=20260831`, auth)).json();
  assert.equal(cmp.movimientos.length, 6 * 12);
  assert.equal((await fetch(`${base}/admin/log`, auth)).status, 403);
});

test('administrador: archivo inválido se rechaza con mensaje claro', async () => {
  const t = await login('administrador', PW.administrador);
  const r = await upload(t, 'malo.csv', 'Fecha,Codigo_Banco\r\n20260930,101\r\n');
  assert.equal(r.status, 400);
  const body = await r.json();
  assert.match(body.detalles.join(' '), /61 columnas/);
});

test('administrador carga septiembre: se recalcula y se detectan movimientos sin tocar código', async () => {
  const t = await login('administrador', PW.administrador);
  const text = fs.readFileSync(path.join(root, 'data/periodos/AT03_sintetico_202609.csv'), 'utf8');
  const dry = await (await upload(t, 'AT03_sintetico_202609.csv', text, '&dryRun=1')).json();
  assert.equal(dry.accion, 'nuevo');
  const res = await (await upload(t, 'AT03_sintetico_202609.csv', text)).json();
  assert.deepEqual(res.periodosAhora, ['20260731', '20260831', '20260930']);
  assert.equal(res.resultados[0].comparadoCon, '20260831');
  assert.equal(res.resultados[0].calidad.Filas_Leidas, 30000);
  // volver a cargar el mismo período lo actualiza (no lo duplica)
  const again = await (await upload(t, 'AT03_sintetico_202609.csv', text)).json();
  assert.equal(again.accion, 'actualizar');
  assert.equal(again.periodosAhora.length, 3);
  const log = await (await fetch(`${base}/admin/log`, { headers: { Authorization: `Bearer ${t}` } })).json();
  assert.ok(log.some((l) => l.Accion === 'Carga de período'));
});

test('administrador cambia la regla de movimiento significativo', async () => {
  const t = await login('administrador', PW.administrador);
  const h = { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' };
  const p = await (await fetch(`${base}/admin/params`, { method: 'PUT', headers: h, body: JSON.stringify({ minCambioPosicion: 12, cambioLider: false, umbralVarSaldoPct: 0 }) })).json();
  assert.equal(p.minCambioPosicion, 12);
  const cmp = await (await fetch(`${base}/compare?desde=20260731&hasta=20260930`, { headers: h })).json();
  assert.equal(cmp.movimientos.filter((m) => m.Significativo).length, 0);
});

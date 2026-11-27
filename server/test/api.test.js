/**
 * Prueba de punta a punta de la API: simula la demo del jurado.
 * Arranca con julio y agosto, verifica permisos por perfil y luego el Administrador carga septiembre.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store/store.js';
import { createApp } from '../src/app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sbp-test-'));
// Contraseñas aleatorias por ejecución: ninguna contraseña queda escrita en el repositorio (R5)
const PW = { analista: crypto.randomBytes(9).toString('base64url'), administrador: crypto.randomBytes(9).toString('base64url') };
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

const USUARIO = { analista: 'analista', administrador: 'admin' };
const login = async (perfil, password, usuario = USUARIO[perfil]) => {
  const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ perfil, usuario, password }) });
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
  assert.equal(await login('administrador', PW.administrador, 'otro-usuario'), null);
  assert.equal(await login('administrador', PW.analista, 'analista'), null);
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

test('carga que retiraría otros períodos se rechaza con mensaje claro', async () => {
  const t = await login('administrador', PW.administrador);
  const jul = fs.readFileSync(path.join(root, 'data/periodos/AT03_sintetico_202607.csv'), 'utf8');
  const ago = fs.readFileSync(path.join(root, 'data/periodos/AT03_sintetico_202608.csv'), 'utf8');
  // un archivo combinado julio+agosto reemplaza a los dos archivos individuales (no pierde nada)
  const header = jul.split('\r\n')[0];
  const combinado = jul + ago.split('\r\n').slice(1).join('\r\n');
  const ok = await upload(t, 'combinado.csv', combinado, '&dryRun=1');
  assert.equal(ok.status, 200);
  // ahora cargamos el combinado y luego intentamos reemplazarlo solo con julio: perdería agosto
  assert.equal((await upload(t, 'combinado.csv', combinado)).status, 200);
  const r = await upload(t, 'solo_julio.csv', jul);
  assert.equal(r.status, 400);
  assert.match((await r.json()).detalles.join(' '), /20260831/);
  assert.ok(header.startsWith('Fecha,'));
});

test('permisos editables: el Administrador quita y concede permisos por perfil', async () => {
  const t = await login('administrador', PW.administrador);
  const h = { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' };
  const cfg = await (await fetch(`${base}/admin/permisos`, { headers: h })).json();
  const asig = structuredClone(cfg.asignaciones);
  asig.descargar_calidad = ['analista']; // se lo quitamos al Público
  asig.comparar_periodos = ['publico', 'analista']; // se lo damos al Público
  asig.inventado = ['publico']; // clave desconocida: se ignora
  const res = await (await fetch(`${base}/admin/permisos`, { method: 'PUT', headers: h, body: JSON.stringify({ asignaciones: asig }) })).json();
  assert.equal(res.asignaciones.inventado, undefined);
  assert.equal((await fetch(`${base}/export/calidad.csv`)).status, 403);
  assert.equal((await fetch(`${base}/compare?desde=20260731&hasta=20260831`)).status, 200);
  const meta = await (await fetch(`${base}/meta`)).json();
  assert.ok(meta.permisos.includes('comparar_periodos') && !meta.permisos.includes('descargar_calidad'));
  // el Administrador conserva todo aunque se intente quitar
  assert.ok((await (await fetch(`${base}/auth/me`, { headers: h })).json()).permisos.includes('descargar_calidad'));
  // las acciones de administración no son configurables para otros perfiles
  const ta = await login('analista', PW.analista);
  assert.equal((await fetch(`${base}/admin/permisos`, { headers: { Authorization: `Bearer ${ta}` } })).status, 403);
  // restaurar valores por defecto
  await fetch(`${base}/admin/permisos/restaurar`, { method: 'POST', headers: h });
  assert.equal((await fetch(`${base}/export/calidad.csv`)).status, 200);
  assert.equal((await fetch(`${base}/compare?desde=20260731&hasta=20260831`)).status, 403);
});

test('asistente de IA: requiere permiso y responde 503 claro si no hay clave configurada', async () => {
  const body = JSON.stringify({ fecha: '20260831', pregunta: '¿Quién lidera HIPOTECARIO?' });
  assert.equal((await fetch(`${base}/asistente`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status, 403);
  if (process.env.GEMINI_API_KEY) return; // con clave real no se llama al servicio en las pruebas
  const t = await login('analista', PW.analista);
  const r = await fetch(`${base}/asistente`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body });
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /GEMINI_API_KEY/);
});

test('consultas de operaciones: solo el administrador', async () => {
  assert.equal((await fetch(`${base}/admin/operaciones?fecha=20260731`)).status, 403);
  const ta = await login('analista', PW.analista);
  assert.equal((await fetch(`${base}/admin/operaciones?fecha=20260731`, { headers: { Authorization: `Bearer ${ta}` } })).status, 403);
  const t = await login('administrador', PW.administrador);
  const r = await fetch(`${base}/admin/operaciones?fecha=20260731&pageSize=5`, { headers: { Authorization: `Bearer ${t}` } });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.rows.length, 5);
  assert.ok(body.total > 5);
  assert.ok(body.rows[0].Numero_Prestamo);
  assert.ok(body.rows[0].Estado === 'valida' || body.rows[0].Estado === 'excluida');
});

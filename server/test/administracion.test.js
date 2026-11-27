/** Usuarios y roles, registros, publicaciones y versiones de períodos (frente D). */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store/store.js';
import { createApp } from '../src/app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sbp-admin-'));
const PW = { analista: crypto.randomBytes(9).toString('base64url'), administrador: crypto.randomBytes(9).toString('base64url') };
const PW_NUEVO = crypto.randomBytes(9).toString('base64url');
let server; let base;

before(async () => {
  fs.cpSync(path.join(root, 'data/catalogos'), path.join(tmp, 'catalogos'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'periodos'));
  for (const f of ['AT03_sintetico_202607.csv', 'AT03_sintetico_202608.csv']) fs.copyFileSync(path.join(root, 'data/periodos', f), path.join(tmp, 'periodos', f));
  const app = createApp(new Store(tmp), PW);
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => { server?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const login = async (perfil, usuario, password) => {
  const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ perfil, usuario, password }) });
  return r.ok ? (await r.json()).token : null;
};
const call = (t, method, url, body) => fetch(`${base}${url}`, { method, headers: { Authorization: `Bearer ${t}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });

test('usuarios: el Administrador crea un Analista que puede ingresar; la contraseña queda cifrada', async () => {
  const ta = await login('administrador', 'admin', PW.administrador);
  const r = await call(ta, 'POST', '/admin/usuarios', { usuario: 'JPerez', nombre: 'Juan Pérez', rol: 'analista', password: PW_NUEVO });
  assert.equal(r.status, 201);
  assert.equal((await r.json()).usuario, 'jperez');
  const archivo = fs.readFileSync(path.join(tmp, 'usuarios.json'), 'utf8');
  assert.ok(!archivo.includes(PW_NUEVO)); // nunca en texto plano
  assert.match(archivo, /"hash"/);
  assert.ok(await login('analista', 'jperez', PW_NUEVO));
  assert.equal(await login('administrador', 'jperez', PW_NUEVO), null); // rol distinto
  assert.equal(await login('analista', 'jperez', 'incorrecta'), null);
  // duplicado y usuario reservado de .env
  assert.equal((await call(ta, 'POST', '/admin/usuarios', { usuario: 'jperez', rol: 'analista', password: PW_NUEVO })).status, 400);
  assert.equal((await call(ta, 'POST', '/admin/usuarios', { usuario: 'admin', rol: 'analista', password: PW_NUEVO })).status, 400);
  // el Analista no administra usuarios
  const tAn = await login('analista', 'jperez', PW_NUEVO);
  assert.equal((await call(tAn, 'GET', '/admin/usuarios')).status, 403);
});

test('usuarios: desactivar cierra sus sesiones; la bitácora registra los cambios', async () => {
  const ta = await login('administrador', 'admin', PW.administrador);
  const tAn = await login('analista', 'jperez', PW_NUEVO);
  assert.equal((await (await call(tAn, 'GET', '/auth/me')).json()).perfil, 'analista');
  assert.equal((await call(ta, 'PUT', '/admin/usuarios/jperez', { activo: false })).status, 200);
  assert.equal((await (await call(tAn, 'GET', '/auth/me')).json()).perfil, 'publico'); // sesión cerrada
  assert.equal(await login('analista', 'jperez', PW_NUEVO), null);
  const log = await (await call(ta, 'GET', '/admin/log')).json();
  assert.ok(log.some((l) => l.Accion === 'Usuario actualizado' && l.Detalle.includes('desactivado')));
  assert.ok(!JSON.stringify(log).includes(PW_NUEVO));
});

test('usuarios: no se puede quedar sin Administrador cuando no hay uno en .env', async () => {
  const { Usuarios } = await import('../src/store/usuarios.js');
  const f = path.join(tmp, 'solo.json');
  const u = new Usuarios(f);
  u.crear({ usuario: 'jefa', rol: 'administrador', password: PW_NUEVO });
  assert.throws(() => u.actualizar('jefa', { rol: 'analista' }, 0), /sin ningún Administrador/);
  assert.throws(() => u.eliminar('jefa', 0), /último Administrador/);
  u.actualizar('jefa', { rol: 'analista' }, 1); // con un admin en .env sí se permite
});

test('registros: el Analista consulta sin datos del cliente; el Público no tiene acceso', async () => {
  assert.equal((await fetch(`${base}/registros?fecha=20260731`)).status, 403);
  const tAn = await login('analista', 'analista', PW.analista);
  const d = await (await call(tAn, 'GET', '/registros?fecha=20260731&estado=excluida&filtro=E2&pageSize=5')).json();
  assert.ok(d.total > 0);
  assert.ok(d.rows.every((r) => r.Estado === 'excluida' && r.Filtro === 'E2'));
  assert.ok(d.rows.every((r) => !('Nombre_Cliente' in r) && !('ID_Cliente' in r)));
  const v = await (await call(tAn, 'GET', '/registros?fecha=20260731&banco=112&actividad=HIPOTECARIO&estado=valida&pageSize=100')).json();
  assert.ok(v.rows.every((r) => r.Codigo_Banco === '112' && r.Macroactividad === 'HIPOTECARIO'));
  const ta = await login('administrador', 'admin', PW.administrador);
  const a = await (await call(ta, 'GET', '/registros?fecha=20260731&pageSize=1')).json();
  assert.ok('Nombre_Cliente' in a.rows[0]);
});

test('publicaciones y versiones: reemplazar guarda la versión anterior y se puede restaurar', async () => {
  const pubs = await (await fetch(`${base}/publicaciones`)).json();
  assert.deepEqual(pubs.map((p) => p.fecha), ['20260831', '20260731']); // más reciente primero
  const ta = await login('administrador', 'admin', PW.administrador);
  const original = fs.readFileSync(path.join(root, 'data/periodos/AT03_sintetico_202607.csv'), 'utf8');
  const recortado = original.split('\r\n').slice(0, 101).join('\r\n') + '\r\n'; // 100 filas
  const up = await fetch(`${base}/admin/periods?nombre=julio_v2.csv`, { method: 'POST', headers: { Authorization: `Bearer ${ta}`, 'Content-Type': 'text/csv' }, body: recortado });
  assert.equal(up.status, 200);
  const vers = await (await call(ta, 'GET', '/admin/periods/20260731/versiones')).json();
  assert.equal(vers.length, 1);
  assert.equal(vers[0].filas, 25000);
  const res = await call(ta, 'POST', '/admin/periods/20260731/restaurar', { archivo: vers[0].archivo });
  assert.equal(res.status, 200);
  const meta = await (await fetch(`${base}/meta`)).json();
  assert.equal(meta.periodos.find((p) => p.fecha === '20260731').filas, 25000);
  const vers2 = await (await call(ta, 'GET', '/admin/periods/20260731/versiones')).json();
  assert.equal(vers2[0].filas, 100); // la versión recortada quedó en el historial
  assert.equal((await call(ta, 'POST', '/admin/periods/20260731/restaurar', { archivo: 'no-existe.csv' })).status, 404);
});

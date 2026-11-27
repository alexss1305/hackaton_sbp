/** Comparación avanzada del Analista: hasta 5 bancos × varios cortes × varias actividades. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store/store.js';
import { createApp } from '../src/app.js';
import { comparar } from '../src/engine/comparacion.js';
import { toCents } from '../src/engine/money.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sbp-cmp-'));
const PW = { analista: crypto.randomBytes(9).toString('base64url'), administrador: crypto.randomBytes(9).toString('base64url') };
let server; let base; let store;

before(async () => {
  fs.cpSync(path.join(root, 'data/catalogos'), path.join(tmp, 'catalogos'), { recursive: true });
  fs.cpSync(path.join(root, 'data/periodos'), path.join(tmp, 'periodos'), { recursive: true });
  store = new Store(tmp);
  const app = createApp(store, PW);
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => { server?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const FECHAS = ['20260731', '20260831', '20260930'];

test('motor: series coinciden con los rankings oficiales y la participación usa el total de los 12 bancos', () => {
  const o = comparar(store.periods, store.catalogs, { fechas: FECHAS, bancos: ['101', '112'], rankings: ['HIPOTECARIO', 'CONSUMO'] });
  assert.equal(o.series.length, 3 * 2 * 2);
  for (const s of o.series) {
    const oficial = store.period(s.Fecha).rankings[s.Ranking].find((r) => r.Codigo_Banco === s.Codigo_Banco);
    assert.equal(s.Saldo_Actividad, oficial.Saldo_Actividad);
    assert.equal(s.Posicion, oficial.Posicion);
    const total = store.period(s.Fecha).rankings[s.Ranking].reduce((a, r) => a + toCents(r.Saldo_Actividad), 0n);
    assert.equal(toCents(s.Total_Ranking), total);
  }
  // pares consecutivos + primero→último
  assert.deepEqual([...new Set(o.movimientos.map((m) => m.Par))], ['20260731-20260831', '20260831-20260930', '20260731-20260930']);
  const r = o.resumen.find((x) => x.Ranking === 'HIPOTECARIO' && x.Codigo_Banco === '112');
  assert.equal(r.Cambio_Posicion, r.Posicion_Inicial - r.Posicion_Final);
});

test('API: requiere permiso, valida tope de 5 bancos y responde con los filtros', async () => {
  assert.equal((await fetch(`${base}/comparacion?bancos=101`)).status, 403); // Público sin permiso
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ perfil: 'analista', usuario: 'analista', password: PW.analista }) });
  const h = { Authorization: `Bearer ${(await login.json()).token}` };
  const seis = await fetch(`${base}/comparacion?fechas=${FECHAS.join(',')}&bancos=101,102,103,104,105,106`, { headers: h });
  assert.equal(seis.status, 400);
  assert.match((await seis.json()).error, /hasta 5/);
  const ok = await (await fetch(`${base}/comparacion?fechas=20260930,20260731&bancos=101,102,103,104,105&rankings=INDUSTRIA`, { headers: h })).json();
  assert.deepEqual(ok.fechas, ['20260731', '20260930']); // ordenadas
  assert.equal(ok.series.length, 2 * 5);
  assert.ok(ok.subactividades.every((s) => s.Ranking === 'INDUSTRIA'));
  assert.equal(ok.maxBancos, 5);
  const sinBanco = await fetch(`${base}/comparacion?fechas=20260930`, { headers: h });
  assert.equal(sinBanco.status, 400);
});

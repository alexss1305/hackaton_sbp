/** Fichas de bancos: lista y "estado de cuenta" por banco, siempre por Codigo_Banco del catálogo. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store/store.js';
import { createApp } from '../src/app.js';
import { toCents } from '../src/engine/money.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sbp-bancos-'));
let server; let base; let store;
before(async () => {
  fs.cpSync(path.join(root, 'data/catalogos'), path.join(tmp, 'catalogos'), { recursive: true });
  fs.cpSync(path.join(root, 'data/periodos'), path.join(tmp, 'periodos'), { recursive: true });
  store = new Store(tmp);
  const app = createApp(store, { analista: 'x', administrador: 'y' });
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => { server?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('lista: 12 bancos del catálogo, cartera igual al denominador oficial y puestos 1..12 sin huecos', async () => {
  const l = await (await fetch(`${base}/bancos?fecha=20260930`)).json(); // público, sin token
  assert.equal(l.bancos.length, 12);
  const p = store.period('20260930');
  let suma = 0n;
  for (const b of l.bancos) {
    const oficial = p.rankings.HIPOTECARIO.find((r) => r.Codigo_Banco === b.codigo);
    assert.equal(b.cartera, oficial.Total_Cartera_Local_Valida);
    assert.equal(b.posiciones.length, 6);
    suma += toCents(b.cartera);
  }
  assert.equal(suma, toCents(p.quality.Saldo_Universo_Local_Valido)); // R3
  assert.deepEqual(l.bancos.map((b) => b.puestoCartera).sort((a, b) => a - b), [...Array(12)].map((_, i) => i + 1));
  assert.equal(l.fechaAnterior, '20260831');
  assert.ok(l.bancos.every((b) => b.varCarteraPct !== null));
});

test('ficha: evolución en los 3 cortes, 22 subactividades y error claro si el código no existe', async () => {
  const f = await (await fetch(`${base}/bancos/112?fecha=20260930`)).json();
  assert.equal(f.nombre, 'Banco Solidez');
  assert.equal(f.evolucion.length, 3);
  assert.equal(f.subactividades.length, 22);
  assert.equal(f.evolucion.at(-1).pos_HIPOTECARIO, store.period('20260930').rankings.HIPOTECARIO.find((r) => r.Codigo_Banco === '112').Posicion);
  const sumaSub = f.subactividades.reduce((a, s) => a + toCents(s.Saldo), 0n);
  assert.equal(sumaSub, toCents(f.resumen.cartera)); // R1+R2: las subactividades suman la cartera
  const r = await fetch(`${base}/bancos/999`);
  assert.equal(r.status, 404);
  const primero = await (await fetch(`${base}/bancos?fecha=20260731`)).json();
  assert.equal(primero.fechaAnterior, null);
});

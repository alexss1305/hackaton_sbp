/**
 * Pruebas de la auditoría del backend: casos borde de las reglas del reto, exportaciones y seguridad.
 * Cada prueba indica la sección de INDICACIONES_RETO_RANKING_CREDITO.md que protege.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, toCsv } from '../src/engine/csv.js';
import { formatCentsMiles, toCents } from '../src/engine/money.js';
import { loadCatalogs, parseCatalog } from '../src/engine/catalogs.js';
import { processPeriod, readAt03 } from '../src/engine/pipeline.js';
import { compareRankings } from '../src/engine/compare.js';
import * as X from '../src/engine/exports.js';
import { login } from '../src/api/auth.js';
import { Store } from '../src/store/store.js';
import { createApp } from '../src/app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const catalogs = loadCatalogs(path.join(root, 'data/catalogos'));
const CP = 'K.64.649.6492.64921'; const TJ = 'K.64.649.6499.64991';

function row(over) {
  const o = Object.fromEntries(catalogs.schema.map((c) => [c, 'NA']));
  Object.assign(o, {
    Fecha: '20260731', Codigo_Banco: '101', Destino: 'L', Facilidad_Crediticia: '01',
    Tipo_Actividad: 'L.68.681.6810.00000', Saldo: '100.00', Dias_Mora: '0', Tasa_Interes: '5',
  }, over);
  return o;
}
const text = (objs) => toCsv(objs, catalogs.schema);
const period = (objs, fecha = '20260731') => {
  const r = readAt03(text(objs), 'test.csv', catalogs.schema);
  assert.ok(r.ok, r.errors.join(' '));
  return processPeriod(fecha, r.rowsByFecha.get(fecha), catalogs);
};

// ---------------------------------------------------------------- Sección 2.1 / 4.A
test('2.1: Fecha debe ser una fecha real (mes 13 o 30 de febrero rechazan el archivo)', () => {
  for (const f of ['20261399', '20260230', '2026073']) {
    const r = readAt03(text([row({ Numero_Prestamo: '1', Fecha: f })]), 'x.csv', catalogs.schema);
    assert.equal(r.ok, false, f);
    assert.match(r.errors.join(' '), /Fecha inválida/);
  }
  assert.ok(readAt03(text([row({ Numero_Prestamo: '1', Fecha: '20260930' })]), 'x.csv', catalogs.schema).ok);
});

test('2.1: el período sale del campo Fecha; un archivo con dos fechas genera dos períodos independientes', () => {
  const r = readAt03(text([
    row({ Numero_Prestamo: 'A', Fecha: '20260831' }),
    row({ Numero_Prestamo: 'A', Fecha: '20260731' }), // mismo préstamo en otro mes: NO es duplicado
  ]), 'julio.csv', catalogs.schema);
  assert.deepEqual(r.fechas, ['20260731', '20260831']);
  const jul = processPeriod('20260731', r.rowsByFecha.get('20260731'), catalogs);
  assert.equal(jul.quality.E1_Duplicados, 0);
  assert.equal(jul.quality.Universo_Local_Valido, 1);
});

test('2.1: Destino exacto: " L", "l" y "E" no son locales', () => {
  const p = period([
    row({ Numero_Prestamo: '1', Destino: ' L' }), row({ Numero_Prestamo: '2', Destino: 'l' }),
    row({ Numero_Prestamo: '3', Destino: 'E' }), row({ Numero_Prestamo: '4' }),
  ]);
  assert.equal(p.quality.E2_Destino_Extranjero, 3);
  assert.equal(p.quality.Universo_Local_Valido, 1);
});

// ---------------------------------------------------------------- Sección 4.B (cascada)
test('4.B: fila que incumple E2+E3+E4 a la vez cuenta solo en E2; el conteo independiente va aparte', () => {
  const p = period([
    row({ Numero_Prestamo: '1', Destino: 'E', Saldo: '-1.00', Tipo_Actividad: 'Z.99' }),
    row({ Numero_Prestamo: '2', Saldo: '0.00', Tipo_Actividad: 'Z.99' }), // E3 y E4 -> cuenta en E3
    row({ Numero_Prestamo: '3', Saldo: '-0.00' }), // "-0.00" es saldo cero -> E3
    row({ Numero_Prestamo: '4', Saldo: '0.01' }), // el mínimo positivo es válido
  ]);
  const q = p.quality;
  assert.deepEqual([q.E1_Duplicados, q.E2_Destino_Extranjero, q.E3_Saldo_No_Positivo, q.E4_Actividad_No_Catalogada, q.Universo_Local_Valido], [0, 1, 2, 0, 1]);
  assert.deepEqual([q.Indep_E2, q.Indep_E3, q.Indep_E4], [1, 3, 2]);
  assert.ok(q.Cuadre_Cascada);
  assert.deepEqual(p.excluded.map((e) => e.Filtro), ['E2', 'E3', 'E3']);
});

test('4.B: E1 conserva la primera ocurrencia aunque sea inválida y las siguientes sean válidas', () => {
  const p = period([
    row({ Numero_Prestamo: 'X', Saldo: '0.00' }), // primera: se queda para E3
    row({ Numero_Prestamo: 'X', Saldo: '500.00' }), // duplicado -> E1
    row({ Numero_Prestamo: 'X', Saldo: '700.00' }), // duplicado -> E1
  ]);
  assert.equal(p.quality.E1_Duplicados, 2);
  assert.equal(p.quality.E3_Saldo_No_Positivo, 1);
  assert.equal(p.quality.Universo_Local_Valido, 0);
  assert.deepEqual(p.excluded.filter((e) => e.Filtro === 'E1').map((e) => e.Linea_Archivo), [3, 4]);
});

// ---------------------------------------------------------------- Sección 4.C / 7
test('4.C/7: banco no catalogado -> alerta, no se excluye, y el ranking mantiene exactamente los 12 bancos', () => {
  const p = period([
    row({ Numero_Prestamo: '1', Saldo: '100.00' }),
    row({ Numero_Prestamo: '2', Codigo_Banco: '999', Saldo: '50.00' }),
  ]);
  assert.equal(p.quality.Universo_Local_Valido, 2); // no es causal de exclusión
  for (const m of catalogs.macros) {
    assert.equal(p.rankings[m].length, 12);
    assert.ok(!p.rankings[m].some((r) => r.Codigo_Banco === '999'));
  }
  assert.ok(!p.subactividades.some((s) => s.Codigo_Banco === '999'));
  assert.ok(p.alerts.some((a) => a.Tipo === 'Banco no catalogado' && a.Codigo_Banco === '999'));
  // R3 lo detecta y explica la diferencia exacta
  assert.equal(p.reconciliaciones.r3.ok, false);
  assert.equal(p.reconciliaciones.r3.saldoBancosNoCatalogados, '50.00');
  assert.ok(p.quality.Reconciliacion_1 && p.quality.Reconciliacion_2);
});

test('4.C/7: facilidad no catalogada en SB21 -> alerta, la fila sigue en el universo', () => {
  const p = period([row({ Numero_Prestamo: '1', Facilidad_Crediticia: '99' })]);
  assert.equal(p.quality.Universo_Local_Valido, 1);
  assert.ok(p.alerts.some((a) => a.Tipo === 'Facilidad no catalogada'));
});

test('6: la reclasificación a Tarjeta usa la subactividad del catálogo y no cambia el total de CONSUMO', () => {
  const p = period([
    row({ Numero_Prestamo: '1', Tipo_Actividad: CP, Facilidad_Crediticia: '07', Saldo: '0.10' }),
    row({ Numero_Prestamo: '2', Tipo_Actividad: CP, Facilidad_Crediticia: '01', Saldo: '0.20' }),
    row({ Numero_Prestamo: '3', Tipo_Actividad: TJ, Facilidad_Crediticia: '01', Saldo: '0.30' }), // alerta: se queda en Tarjeta
  ]);
  const sub = (s) => p.subactividades.find((x) => x.Ranking === 'CONSUMO' && x.Subactividad === s && x.Codigo_Banco === '101').Saldo;
  assert.equal(sub(catalogs.cinuMap.get(TJ).sub), '0.40');
  assert.equal(sub('Credito personal'), '0.20');
  assert.equal(p.rankings.CONSUMO.find((r) => r.Codigo_Banco === '101').Saldo_Actividad, '0.60');
  assert.equal(p.alerts.filter((a) => a.Tipo === 'Coherencia CONSUMO').length, 1);
});

test('4.C: ponderación con muchos montos sigue siendo exacta (centavos) y half-up a 4 decimales', () => {
  const rows = [];
  for (let i = 0; i < 300; i++) rows.push(row({ Numero_Prestamo: `H${i}`, Saldo: '0.10' })); // 30.00 hipotecario
  rows.push(row({ Numero_Prestamo: 'C1', Tipo_Actividad: CP, Saldo: '60.00' })); // total 90.00
  const p = period(rows);
  const h = p.rankings.HIPOTECARIO.find((r) => r.Codigo_Banco === '101');
  assert.equal(h.Saldo_Actividad, '30.00'); // con float sería 30.000000000000135
  assert.equal(h.Total_Cartera_Local_Valida, '90.00');
  assert.equal(h.Ponderacion_Pct, '33.3333');
  assert.equal(p.rankings.CONSUMO.find((r) => r.Codigo_Banco === '101').Ponderacion_Pct, '66.6667');
});

// ---------------------------------------------------------------- Sección 8
test('8: cambio de líder: explicación exacta para quien entra y quien sale, montos sin pérdida de precisión', () => {
  const jul = period([
    row({ Numero_Prestamo: '1', Codigo_Banco: '101', Saldo: '9007199254740993.01' }),
    row({ Numero_Prestamo: '2', Codigo_Banco: '102', Saldo: '1.00' }),
  ]);
  const ago = period([
    row({ Fecha: '20260831', Numero_Prestamo: '1', Codigo_Banco: '101', Saldo: '1.00' }),
    row({ Fecha: '20260831', Numero_Prestamo: '2', Codigo_Banco: '102', Saldo: '9007199254740999.99' }),
  ], '20260831');
  const mov = compareRankings(jul, ago, { minCambioPosicion: 5, cambioLider: true, umbralVarSaldoPct: 0 });
  const sale = mov.find((m) => m.Ranking === 'HIPOTECARIO' && m.Codigo_Banco === '101');
  const entra = mov.find((m) => m.Ranking === 'HIPOTECARIO' && m.Codigo_Banco === '102');
  assert.equal(sale.Cambio_Posicion, -1);
  assert.equal(sale.Motivo_Significativo, 'Cambio de líder');
  assert.match(sale.Explicacion, /baja del puesto 1 al 2 en HIPOTECARIO y pierde el liderazgo/);
  assert.match(sale.Explicacion, /cae 9,007,199,254,740,992\.01/); // exacto al centavo
  assert.match(entra.Explicacion, /sube del puesto 2 al 1 en HIPOTECARIO y pasa a liderar el ranking/);
  assert.equal(entra.Var_Saldo, '9007199254740998.99');
  // el resto de bancos no es significativo con esta regla
  assert.equal(mov.filter((m) => m.Significativo).length, 2);
});

test('8: Var_Saldo_Pct con saldo anterior 0 queda vacío (no divide por cero) y Tendencia es coherente', () => {
  const jul = period([row({ Numero_Prestamo: '1', Codigo_Banco: '101' })]);
  const ago = period([row({ Fecha: '20260831', Numero_Prestamo: '1', Codigo_Banco: '102' })], '20260831');
  const m = compareRankings(jul, ago).find((x) => x.Ranking === 'HIPOTECARIO' && x.Codigo_Banco === '102');
  assert.equal(m.Var_Saldo_Pct, null);
  assert.equal(m.Tendencia, 'Sube');
  assert.equal(formatCentsMiles(-123456789n), '-1,234,567.89');
});

// ---------------------------------------------------------------- Sección 10 (exportaciones)
test('10: exportaciones con encabezados exactos, CRLF, sin BOM y ceros a la izquierda intactos', () => {
  const p = period([
    row({ Numero_Prestamo: '1' }),
    row({ Numero_Prestamo: '2', Destino: 'E', Facilidad_Crediticia: '07', Tipo_Actividad: '0701.X', Saldo: '-5.00' }),
  ]);
  const rk = X.exportRankings([p]);
  assert.ok(rk.startsWith('Fecha,Ranking,Posicion,Codigo_Banco,Banco,Saldo_Actividad,Total_Cartera_Local_Valida,Ponderacion_Pct'));
  assert.ok(!rk.startsWith('﻿'));
  assert.ok(rk.includes('\r\n'));
  assert.equal(rk.trim().split('\r\n').length, 1 + 6 * 12);
  const sb = X.exportSubactividades([p]);
  assert.ok(sb.startsWith('Fecha,Ranking,Subactividad,Codigo_Banco,Saldo'));
  assert.equal(sb.trim().split('\r\n').length, 1 + 22 * 12);
  const ex = parseCsv(X.exportExcluidas([p]));
  const fila = Object.fromEntries(ex.header.map((h, i) => [h, ex.rows[0][i]]));
  assert.equal(fila.Tipo_Actividad, '0701.X');
  assert.equal(fila.Saldo, '-5.00');
  assert.equal(fila.Fecha, '20260731');
  const cal = parseCsv(X.exportCalidad([p]));
  assert.deepEqual(cal.header.slice(0, 7), ['Fecha', 'Filas_Leidas', 'E1_Duplicados', 'E2_Destino_Extranjero', 'E3_Saldo_No_Positivo', 'E4_Actividad_No_Catalogada', 'Universo_Local_Valido']);
});

test('csv: valores con comas, comillas y saltos de línea se exportan y releen sin cambios', () => {
  const objs = [{ a: 'x, "y"', b: '007', c: 'línea1\nlínea2' }];
  const back = parseCsv(toCsv(objs, ['a', 'b', 'c']));
  assert.deepEqual(back.rows[0], ['x, "y"', '007', 'línea1\nlínea2']);
  assert.equal(toCents('1.5'), 150n);
  assert.equal(toCents('1,000.00'), null); // separador de miles no permitido
});

test('catálogos: se rechazan llaves repetidas o vacías', () => {
  assert.throws(() => parseCatalog('bancos', 'Codigo_Banco,Nombre_Ficticio,Tipo_Licencia\r\n101,A,L\r\n101,B,L\r\n'), /repetido/);
  assert.throws(() => parseCatalog('sb21', 'Codigo,Descripcion,Uso_en_reto\r\n,Vacio,G\r\n'), /vacío/);
});

// ---------------------------------------------------------------- R5 / perfiles
test('auth: perfiles heredados de Object ("constructor", "__proto__") nunca inician sesión', () => {
  const creds = { analista: { usuario: 'analista', password: 'a' }, administrador: { usuario: 'admin', password: 'b' } };
  for (const p of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.equal(login(creds, p, '', ''), null, p);
    assert.equal(login(creds, p, undefined, undefined), null, p);
  }
  assert.equal(login({ analista: { usuario: 'analista', password: '' } }, 'analista', '', 'analista'), null); // sin contraseña configurada
  assert.ok(login(creds, 'publico'));
});

// ---------------------------------------------------------------- API: retiro seguro y descargas
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sbp-audit-'));
const PW = { analista: crypto.randomBytes(9).toString('base64url'), administrador: crypto.randomBytes(9).toString('base64url') };
let server; let base;
before(async () => {
  fs.cpSync(path.join(root, 'data/catalogos'), path.join(tmp, 'catalogos'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'periodos'));
  // Un archivo con DOS períodos (julio y agosto)
  fs.writeFileSync(path.join(tmp, 'periodos', 'dos_meses.csv'), text([
    row({ Numero_Prestamo: '1' }), row({ Numero_Prestamo: '1', Fecha: '20260831', Saldo: '90.00' }),
  ]));
  const app = createApp(new Store(tmp), PW);
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => { server?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const auth = async (perfil, usuario, password) => {
  const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ perfil, usuario, password }) });
  return { status: r.status, token: r.ok ? (await r.json()).token : null };
};

test('API: perfil inválido -> 400; retirar un mes de un archivo con dos meses se rechaza sin borrar nada', async () => {
  assert.equal((await auth('constructor', '', '')).status, 400);
  const { token } = await auth('administrador', 'admin', PW.administrador);
  const h = { Authorization: `Bearer ${token}` };
  const r = await fetch(`${base}/admin/periods/20260731`, { method: 'DELETE', headers: h });
  assert.equal(r.status, 400);
  assert.match((await r.json()).detalles.join(' '), /20260831/);
  const meta = await (await fetch(`${base}/meta`)).json();
  assert.deepEqual(meta.periodos.map((p) => p.fecha), ['20260731', '20260831']);
});

test('API: descarga oficial sin BOM por defecto, con BOM solo si se pide, y nombre de archivo saneado', async () => {
  const plain = await fetch(`${base}/export/rankings.csv?fechas=20260731`);
  const buf = Buffer.from(await plain.arrayBuffer());
  assert.notDeepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.ok(buf.toString('utf8').startsWith('Fecha,Ranking,Posicion'));
  const withBom = Buffer.from(await (await fetch(`${base}/export/rankings.csv?bom=1`)).arrayBuffer());
  assert.deepEqual([...withBom.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  const odd = await fetch(`${base}/export/rankings.csv?fechas=${encodeURIComponent('a"b;c')}`);
  assert.match(odd.headers.get('content-disposition'), /filename="rankings_a_b_c\.csv"/);
});

test('API: parámetros — "false" como texto desactiva el cambio de líder', async () => {
  const { token } = await auth('administrador', 'admin', PW.administrador);
  const r = await fetch(`${base}/admin/params`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ cambioLider: 'false' }) });
  assert.equal((await r.json()).cambioLider, false);
});

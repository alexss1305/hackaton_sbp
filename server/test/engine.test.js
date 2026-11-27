import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCsv, toCsv } from '../src/engine/csv.js';
import { toCents, formatCents, pct } from '../src/engine/money.js';
import { loadCatalogs } from '../src/engine/catalogs.js';
import { buildDataset, processPeriod, readAt03 } from '../src/engine/pipeline.js';
import { compareRankings } from '../src/engine/compare.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const catalogs = loadCatalogs(path.join(root, 'data/catalogos'));

/** Crea una fila AT03 con las 61 columnas; los valores no indicados quedan en 'NA' o '0'. */
function row(over) {
  const o = Object.fromEntries(catalogs.schema.map((c) => [c, 'NA']));
  Object.assign(o, {
    Fecha: '20260731', Codigo_Banco: '101', Destino: 'L', Facilidad_Crediticia: '01',
    Tipo_Actividad: 'L.68.681.6810.00000', Saldo: '100.00', Dias_Mora: '0', Tasa_Interes: '5',
  }, over);
  return o;
}
const fileText = (objs) => toCsv(objs, catalogs.schema);
const period = (objs, fecha = '20260731') => {
  const r = readAt03(fileText(objs), 'test.csv', catalogs.schema);
  assert.ok(r.ok, r.errors.join(' '));
  return processPeriod(fecha, r.rowsByFecha.get(fecha), catalogs);
};

test('CSV conserva ceros a la izquierda y campos con comas entre comillas', () => {
  const { header, rows } = parseCsv('﻿a,b,c\r\n07,001,"x, y"\r\n');
  assert.deepEqual(header, ['a', 'b', 'c']);
  assert.deepEqual(rows[0], ['07', '001', 'x, y']);
});

test('montos en centavos exactos y ponderación half-up a 4 decimales', () => {
  assert.equal(toCents('84556.97'), 8455697n);
  assert.equal(toCents('-0.50'), -50n);
  assert.equal(toCents('12'), 1200n);
  assert.equal(toCents('abc'), null);
  assert.equal(formatCents(5n), '0.05');
  assert.equal(formatCents(-12345n), '-123.45');
  assert.equal(pct(1n, 3n), '33.3333');
  assert.equal(pct(2n, 3n), '66.6667');
  assert.equal(pct(1n, 8n, 1), '12.5'); // 12.5 exacto
  assert.equal(pct(1n, 16n, 2), '6.25');
  assert.equal(pct(1n, 32n, 2), '3.13'); // 3.125 -> 3.13 (half-up)
  // 0.1 + 0.2 en flotante falla; en centavos es exacto
  assert.equal(formatCents(toCents('0.10') + toCents('0.20')), '0.30');
});

test('cascada E1-E4: cada fila cuenta solo en el primer filtro que incumple', () => {
  const p = period([
    row({ Numero_Prestamo: 'A' }),
    row({ Numero_Prestamo: 'A', Destino: 'E', Saldo: '-5.00' }), // E1 (aunque también sea E2 y E3)
    row({ Numero_Prestamo: 'B', Destino: 'E', Saldo: '0.00' }), // E2 (aunque también sea E3)
    row({ Numero_Prestamo: 'C', Destino: 'l' }), // E2: comparación exacta, minúscula no es local
    row({ Numero_Prestamo: 'D', Saldo: '0.00', Tipo_Actividad: 'X.00' }), // E3
    row({ Numero_Prestamo: 'E', Tipo_Actividad: 'X.00' }), // E4
    row({ Numero_Prestamo: 'F' }),
  ]);
  const q = p.quality;
  assert.deepEqual([q.E1_Duplicados, q.E2_Destino_Extranjero, q.E3_Saldo_No_Positivo, q.E4_Actividad_No_Catalogada, q.Universo_Local_Valido], [1, 2, 1, 1, 2]);
  assert.equal(q.Cuadre_Cascada, true);
  assert.deepEqual(q.Conteo_Independiente, { E1: 1, E2: 3, E3: 3, E4: 2 });
  assert.equal(p.excluded.length, 5);
});

test('E1 conserva la PRIMERA ocurrencia aunque la siguiente sea válida', () => {
  const p = period([
    row({ Numero_Prestamo: 'A', Destino: 'E' }),
    row({ Numero_Prestamo: 'A', Saldo: '999.00' }),
  ]);
  assert.equal(p.quality.E1_Duplicados, 1);
  assert.equal(p.quality.E2_Destino_Extranjero, 1);
  assert.equal(p.quality.Universo_Local_Valido, 0);
});

test('regla SB21: crédito personal con facilidad 07 pasa a Tarjeta sin cambiar el total de CONSUMO', () => {
  const CP = 'K.64.649.6492.64921'; const TJ = 'K.64.649.6499.64991'; const AU = 'K.64.649.6492.64922';
  const p = period([
    row({ Numero_Prestamo: '1', Tipo_Actividad: CP, Facilidad_Crediticia: '07', Saldo: '10.00' }),
    row({ Numero_Prestamo: '2', Tipo_Actividad: CP, Facilidad_Crediticia: '01', Saldo: '20.00' }),
    row({ Numero_Prestamo: '3', Tipo_Actividad: TJ, Facilidad_Crediticia: '07', Saldo: '30.00' }),
    row({ Numero_Prestamo: '4', Tipo_Actividad: AU, Facilidad_Crediticia: '03', Saldo: '40.00' }),
    row({ Numero_Prestamo: '5', Tipo_Actividad: AU, Facilidad_Crediticia: '01', Saldo: '5.00' }), // alerta
  ]);
  const sub = (s) => p.subactividades.find((x) => x.Ranking === 'CONSUMO' && x.Subactividad === s && x.Codigo_Banco === '101').Saldo;
  assert.equal(sub('Tarjeta'), '40.00');
  assert.equal(sub('Credito personal'), '20.00');
  assert.equal(sub('Automovil'), '45.00'); // la alerta no excluye ni reclasifica
  assert.equal(p.rankings.CONSUMO.find((r) => r.Codigo_Banco === '101').Saldo_Actividad, '105.00');
  assert.equal(p.quality.Reclasificadas_Tarjeta_SB21, 1);
  assert.equal(p.alerts.filter((a) => a.Tipo === 'Coherencia CONSUMO').length, 1);
});

test('ranking: 12 bancos siempre, desempate por código, denominador sobre todo el universo', () => {
  const p = period([
    row({ Numero_Prestamo: '1', Codigo_Banco: '105', Saldo: '50.00' }),
    row({ Numero_Prestamo: '2', Codigo_Banco: '103', Saldo: '50.00' }),
    row({ Numero_Prestamo: '3', Codigo_Banco: '103', Saldo: '150.00', Tipo_Actividad: 'G.47.471.4719.47191' }),
  ]);
  for (const m of catalogs.macros) {
    assert.equal(p.rankings[m].length, 12);
    assert.deepEqual(p.rankings[m].map((r) => r.Posicion), [...Array(12)].map((_, i) => i + 1));
  }
  const h = p.rankings.HIPOTECARIO;
  assert.deepEqual(h.slice(0, 3).map((r) => r.Codigo_Banco), ['103', '105', '101']);
  assert.equal(h[0].Total_Cartera_Local_Valida, '200.00');
  assert.equal(h[0].Ponderacion_Pct, '25.0000');
  assert.equal(h[2].Saldo_Actividad, '0.00');
  assert.equal(h[2].Ponderacion_Pct, '0.0000');
  assert.ok(p.quality.Reconciliacion_1 && p.quality.Reconciliacion_2 && p.quality.Reconciliacion_3);
});

test('validación rechaza archivos con columnas faltantes o fechas inválidas', () => {
  const bad = readAt03('Fecha,Codigo_Banco\r\n20260731,101\r\n', 'x.csv', catalogs.schema);
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0], /61 columnas/);
  const badFecha = readAt03(fileText([row({ Fecha: '2026-07-31', Numero_Prestamo: '1' })]), 'y.csv', catalogs.schema);
  assert.equal(badFecha.ok, false);
  assert.match(badFecha.errors.join(), /Fecha inválida/);
});

test('comparación: Cambio_Posicion = anterior - actual y regla de significancia configurable', () => {
  const jul = period([row({ Numero_Prestamo: '1', Codigo_Banco: '101', Saldo: '100.00' }), row({ Numero_Prestamo: '2', Codigo_Banco: '102', Saldo: '50.00' })]);
  const ago = period([
    row({ Fecha: '20260831', Numero_Prestamo: '1', Codigo_Banco: '101', Saldo: '90.00' }),
    row({ Fecha: '20260831', Numero_Prestamo: '2', Codigo_Banco: '102', Saldo: '200.00' }),
  ], '20260831');
  const mov = compareRankings(jul, ago, { minCambioPosicion: 1, cambioLider: true, umbralVarSaldoPct: 0 });
  const b102 = mov.find((m) => m.Ranking === 'HIPOTECARIO' && m.Codigo_Banco === '102');
  assert.equal(b102.Cambio_Posicion, 1);
  assert.equal(b102.Tendencia, 'Sube');
  assert.equal(b102.Var_Saldo, '150.00');
  assert.equal(b102.Var_Saldo_Pct, '300.00');
  assert.ok(b102.Significativo);
  assert.match(b102.Explicacion, /pasa a liderar/);
  const strict = compareRankings(jul, ago, { minCambioPosicion: 5, cambioLider: false, umbralVarSaldoPct: 0 });
  assert.equal(strict.filter((m) => m.Significativo).length, 0);
});

test('datos reales: los 3 períodos cuadran y ningún préstamo se repite', () => {
  const dir = path.join(root, 'data/periodos');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.csv')).map((name) => ({ name, text: fs.readFileSync(path.join(dir, name), 'utf8') }));
  const { periods, comparisons } = buildDataset(files, catalogs);
  assert.ok(periods.length >= 3);
  for (const p of periods) {
    const q = p.quality;
    assert.equal(q.E1_Duplicados + q.E2_Destino_Extranjero + q.E3_Saldo_No_Positivo + q.E4_Actividad_No_Catalogada + q.Universo_Local_Valido, q.Filas_Leidas);
    assert.ok(q.Prestamos_Unicos_En_Universo && q.Reconciliacion_1 && q.Reconciliacion_2 && q.Reconciliacion_3);
    // El denominador es el mismo en los 6 rankings de un banco
    for (const b of catalogs.bancos) {
      const dens = new Set(catalogs.macros.map((m) => p.rankings[m].find((r) => r.Codigo_Banco === b.codigo).Total_Cartera_Local_Valida));
      assert.equal(dens.size, 1);
    }
  }
  assert.equal(comparisons.filter((c) => c.tipo === 'consecutivo').length, periods.length - 1);
});

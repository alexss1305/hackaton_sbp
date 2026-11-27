/**
 * Diagnóstico de archivos AT03 antes de importar: celdas vacías, tipos, ceros perdidos, catálogos,
 * coherencia, separador y vista previa E1–E4 (que debe coincidir con el cálculo oficial).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toCsv, parseCsv } from '../src/engine/csv.js';
import { loadCatalogs } from '../src/engine/catalogs.js';
import { diagnosticarAt03 } from '../src/engine/diagnose.js';
import { readAt03, processPeriod } from '../src/engine/pipeline.js';
import { Store } from '../src/store/store.js';
import { createApp } from '../src/app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const catalogs = loadCatalogs(path.join(root, 'data/catalogos'));
const real = fs.readFileSync(path.join(root, 'data/periodos/AT03_sintetico_202607.csv'), 'utf8');

/** Toma las primeras n filas reales (ya coherentes) y permite modificarlas por línea. */
function muestra(n, cambios = {}) {
  const lines = real.split(/\r?\n/).filter(Boolean).slice(0, n + 1);
  const h = lines[0].split(',');
  for (const [linea, campos] of Object.entries(cambios)) {
    const a = lines[Number(linea) - 1].split(',');
    for (const [c, v] of Object.entries(campos)) a[h.indexOf(c)] = v;
    lines[Number(linea) - 1] = a.join(',');
  }
  return lines.join('\r\n') + '\r\n';
}
const regla = (d, r, campo) => d.hallazgos.find((h) => h.regla === r && (!campo || h.campo === campo));

test('archivo real: importable, sin advertencias falsas y vista previa idéntica al reporte de calidad', () => {
  const d = diagnosticarAt03(real, 'jul.csv', catalogs);
  assert.equal(d.importable, true);
  assert.equal(d.totales.bloqueante, 0);
  assert.equal(d.totales.advertencia, 0);
  const r = readAt03(real, 'jul.csv', catalogs.schema);
  const q = processPeriod('20260731', r.rowsByFecha.get('20260731'), catalogs).quality;
  const p = d.porPeriodo[0];
  for (const k of ['Filas_Leidas', 'E1_Duplicados', 'E2_Destino_Extranjero', 'E3_Saldo_No_Positivo', 'E4_Actividad_No_Catalogada', 'Universo_Local_Valido', 'Saldo_Universo_Local_Valido', 'Reclasificadas_Tarjeta_SB21']) {
    assert.equal(p[k], q[k], k);
  }
  assert.equal(d.totales.calculo, q.E1_Duplicados + q.E2_Destino_Extranjero + q.E3_Saldo_No_Positivo + q.E4_Actividad_No_Catalogada);
});

test('detecta celda vacía, cero perdido, espacios, tipo inválido y valores fuera de dominio con su línea', () => {
  const d = diagnosticarAt03(muestra(10, {
    2: { Codigo_Region: '' },
    3: { Facilidad_Crediticia: '7' },
    4: { Tipo_Credito: '2' },
    5: { Tasa_Interes: 'cinco' },
    6: { Clasificacion_Prestamo: '09' },
    7: { Codigo_Subsidiaria: '001' },
  }), 'x.csv', catalogs);
  assert.equal(d.importable, true);
  assert.equal(regla(d, 'Celda vacía', 'Codigo_Region').ejemplos[0].linea, 2);
  const cero = regla(d, 'Cero a la izquierda perdido', 'Facilidad_Crediticia').ejemplos[0];
  assert.deepEqual([cero.linea, cero.valor, cero.esperado], [3, '7', '07']);
  assert.equal(regla(d, 'Cero a la izquierda perdido', 'Tipo_Credito').ejemplos[0].esperado, '002');
  assert.equal(regla(d, 'Tipo de dato inválido', 'Tasa_Interes').ejemplos[0].linea, 5);
  assert.ok(regla(d, 'Valor fuera del dominio del diccionario', 'Clasificacion_Prestamo'));
  assert.ok(regla(d, 'Debería ser NA en el reto', 'Codigo_Subsidiaria'));
});

test('casos que afectan el cálculo: Destino con espacio, CINU con espacio, banco no catalogado', () => {
  const lines = parseCsv(muestra(10));
  const cinu = lines.rows[3][lines.header.indexOf('Tipo_Actividad')];
  const d = diagnosticarAt03(muestra(10, { 3: { Destino: ' L' }, 4: { Tipo_Actividad: ` ${cinu}` }, 5: { Codigo_Banco: '199' } }), 'x.csv', catalogs);
  const e2 = regla(d, 'E2 · Destino distinto de L').ejemplos.find((x) => x.linea === 3);
  assert.match(e2.sugerencia, /exactamente "L"/);
  const e4 = regla(d, 'E4 · Actividad CINU no catalogada').ejemplos.find((x) => x.linea === 4);
  assert.match(e4.sugerencia, /espacios/);
  assert.equal(regla(d, 'Banco no catalogado').ejemplos[0].valor, '199');
});

test('coherencia: tramos, Valor_Inicial, fechas, Perfil_Vencimiento y Genero', () => {
  const d = diagnosticarAt03(muestra(10, {
    2: { Monto_por_Vencer_30_dias: '1.00' }, // la suma de tramos deja de ser el Saldo
    3: { Valor_Inicial: '0.01' },
    4: { Fecha_Vencimiento: '20200101' },
    5: { Perfil_Vencimiento: '02', Dias_Mora: '0' },
    6: { Tamano_Empresa: '06', Genero: 'NA' },
  }), 'x.csv', catalogs);
  for (const r of ['Saldo distinto de la suma de tramos', 'Valor_Inicial menor que Saldo', 'Vencimiento no posterior al corte', 'Perfil_Vencimiento incoherente con Dias_Mora', 'Genero incoherente con Tamano_Empresa']) {
    assert.ok(regla(d, r), r);
  }
  assert.equal(d.importable, true); // la coherencia nunca bloquea ni excluye
});

test('bloqueantes: separador ;, columnas faltantes, coma decimal, Saldo ilegible y Fecha vacía', () => {
  assert.equal(diagnosticarAt03(real.slice(0, 3000).replace(/,/g, ';'), 'x.csv', catalogs).hallazgos[0].regla, 'Separador incorrecto');
  const sinCol = real.split('\r\n').slice(0, 3).map((l) => l.split(',').slice(0, 60).join(',')).join('\r\n');
  assert.equal(diagnosticarAt03(sinCol, 'x.csv', catalogs).hallazgos[0].regla, 'Columnas faltantes');
  const d = diagnosticarAt03(muestra(6, { 2: { Tasa_Interes: '5,5' }, 3: { Saldo: '12.345' }, 4: { Fecha: '' } }), 'x.csv', catalogs);
  assert.equal(d.importable, false);
  assert.equal(d.estado, 'rechazado');
  assert.match(regla(d, 'Número de campos incorrecto').ejemplos[0].sugerencia, /coma como decimal/);
  assert.equal(regla(d, 'Saldo no numérico').ejemplos[0].linea, 3);
  assert.equal(regla(d, 'Celda vacía', 'Fecha').gravedad, 'bloqueante');
  assert.equal(diagnosticarAt03('', 'x.csv', catalogs).hallazgos[0].regla, 'Archivo vacío');
});

// ---------------------------------------------------------------- API
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sbp-import-'));
const PW = { analista: crypto.randomBytes(9).toString('base64url'), administrador: crypto.randomBytes(9).toString('base64url') };
let server; let base; let token;
before(async () => {
  fs.cpSync(path.join(root, 'data/catalogos'), path.join(tmp, 'catalogos'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'periodos'));
  const app = createApp(new Store(tmp), PW);
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
  const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ perfil: 'administrador', usuario: 'admin', password: PW.administrador }) });
  token = (await r.json()).token;
});
after(() => { server?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });
const post = (url, body) => fetch(`${base}${url}`, { method: 'POST', headers: { 'Content-Type': 'text/csv', Authorization: `Bearer ${token}` }, body });

test('API: la vista previa trae el diagnóstico; un archivo con bloqueantes se rechaza con diagnóstico y línea', async () => {
  const ok = await (await post('/admin/periods?nombre=m.csv&dryRun=1', muestra(20, { 3: { Facilidad_Crediticia: '7' } }))).json();
  assert.equal(ok.diagnostico.estado, 'con_observaciones');
  assert.equal(ok.diagnostico.porPeriodo[0].Filas_Leidas, 20);
  const r = await post('/admin/periods?nombre=m.csv', muestra(5, { 4: { Saldo: 'abc' } }));
  assert.equal(r.status, 400);
  const body = await r.json();
  assert.equal(body.diagnostico.estado, 'rechazado');
  assert.match(body.detalles.join(' '), /Saldo no numérico.*línea 4/);
  assert.deepEqual((await (await fetch(`${base}/meta`)).json()).periodos, []); // no se importó nada
});

test('API: el diagnóstico descargable lista TODOS los casos (no solo la muestra) y exige Administrador', async () => {
  const cambios = {};
  for (let l = 2; l <= 81; l++) cambios[l] = { Codigo_Region: '' }; // 80 celdas vacías (> 50 de muestra)
  const r = await post('/admin/periods/diagnostico.csv?nombre=m.csv', muestra(80, cambios));
  assert.equal(r.status, 200);
  const csv = parseCsv(await r.text());
  assert.deepEqual(csv.header, ['Gravedad', 'Regla', 'Campo', 'Total_En_Archivo', 'Linea', 'Valor', 'Esperado', 'Sugerencia']);
  assert.equal(csv.rows.filter((x) => x[1] === 'Celda vacía').length, 80);
  const pub = await fetch(`${base}/admin/periods/diagnostico.csv`, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: 'x' });
  assert.equal(pub.status, 403);
});

test('ejemplo con errores del repositorio: se puede importar y muestra observaciones de cada tipo', () => {
  const f = path.join(root, 'data/ejemplos/AT03_ejemplo_con_errores.csv');
  if (!fs.existsSync(f)) return;
  const d = diagnosticarAt03(fs.readFileSync(f, 'utf8'), 'ejemplo.csv', catalogs);
  assert.equal(d.importable, true);
  assert.ok(d.totales.calculo > 0 && d.totales.advertencia > 0);
  assert.ok(toCsv && regla(d, 'Cero a la izquierda perdido', 'Facilidad_Crediticia'));
});

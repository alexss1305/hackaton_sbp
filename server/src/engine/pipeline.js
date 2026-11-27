import { parseCsv } from './csv.js';
import { validateAt03, referentialAlerts } from './validate.js';
import { applyCascade, FILTERS } from './cascade.js';
import { classify } from './classify.js';
import { aggregate } from './aggregate.js';
import { compareRankings, DEFAULT_PARAMS } from './compare.js';
import { formatCents } from './money.js';

/**
 * Lee y valida un archivo AT03. Devuelve { ok, errors, fechas, rowsByFecha }.
 * El período de cada fila se toma del campo Fecha (no del nombre del archivo).
 */
export function readAt03(text, fileName, schema) {
  const { header, rows } = parseCsv(text);
  const v = validateAt03(header, rows, schema);
  if (!v.ok) return { ok: false, errors: v.errors, fechas: [], rowsByFecha: new Map() };
  const rowsByFecha = new Map();
  rows.forEach((arr, idx) => {
    const o = { _file: fileName, _line: idx + 2 };
    for (let i = 0; i < header.length; i++) o[header[i]] = arr[i];
    if (!rowsByFecha.has(o.Fecha)) rowsByFecha.set(o.Fecha, []);
    rowsByFecha.get(o.Fecha).push(o);
  });
  return { ok: true, errors: [], fechas: [...rowsByFecha.keys()].sort(), rowsByFecha, totalRows: rows.length };
}

/** Procesa UN período completo: validación referencial, cascada E1–E4, clasificación y agregación. */
export function processPeriod(fecha, rows, catalogs, archivos = []) {
  const refAlerts = referentialAlerts(rows, catalogs);
  const { universe, excluded, counts, independent } = applyCascade(rows, catalogs.cinuMap);
  const { rows: classified, alerts: consumoAlerts, reclasificadas } = classify(universe, catalogs.cinuMap);
  const agg = aggregate(fecha, classified, catalogs);

  const unicos = new Set(classified.map((r) => r.Numero_Prestamo)).size;
  const leidas = rows.length;
  const sumaCascada = counts.E1 + counts.E2 + counts.E3 + counts.E4 + classified.length;

  return {
    fecha,
    archivos,
    rankings: agg.rankings,
    subactividades: agg.subactividades,
    indicadores: agg.indicadores,
    excluded,
    alerts: [...refAlerts, ...consumoAlerts],
    quality: {
      Fecha: fecha,
      Filas_Leidas: leidas,
      E1_Duplicados: counts.E1,
      E2_Destino_Extranjero: counts.E2,
      E3_Saldo_No_Positivo: counts.E3,
      E4_Actividad_No_Catalogada: counts.E4,
      Universo_Local_Valido: classified.length,
      Saldo_Universo_Local_Valido: formatCents(agg.universeTotal),
      Cuadre_Cascada: sumaCascada === leidas,
      Prestamos_Unicos_En_Universo: unicos === classified.length,
      Reclasificadas_Tarjeta_SB21: reclasificadas,
      Alertas: refAlerts.length + consumoAlerts.length,
      Conteo_Independiente: independent,
      Reconciliacion_1: agg.reconciliaciones.r1.ok,
      Reconciliacion_2: agg.reconciliaciones.r2.ok,
      Reconciliacion_3: agg.reconciliaciones.r3.ok,
    },
    reconciliaciones: agg.reconciliaciones,
    filtros: FILTERS,
  };
}

/**
 * Procesa un conjunto de archivos AT03 y genera todos los períodos y comparaciones.
 * files: [{ name, text }] en orden de carga. Si un período aparece en varios archivos, las filas se
 * concatenan en ese orden (la capa de almacenamiento reemplaza archivos de un mismo período).
 */
export function buildDataset(files, catalogs, params = DEFAULT_PARAMS) {
  const byFecha = new Map();
  const archivosByFecha = new Map();
  const fileErrors = [];
  for (const f of files) {
    const r = readAt03(f.text, f.name, catalogs.schema);
    if (!r.ok) { fileErrors.push({ archivo: f.name, errores: r.errors }); continue; }
    for (const [fecha, rows] of r.rowsByFecha) {
      if (!byFecha.has(fecha)) { byFecha.set(fecha, []); archivosByFecha.set(fecha, []); }
      byFecha.get(fecha).push(...rows);
      archivosByFecha.get(fecha).push(f.name);
    }
  }
  const fechas = [...byFecha.keys()].sort();
  const periods = fechas.map((f) => processPeriod(f, byFecha.get(f), catalogs, archivosByFecha.get(f)));
  return { periods, comparisons: buildComparisons(periods, params), fileErrors };
}

/** Comparaciones entre períodos consecutivos y, si hay más de dos, entre el primero y el último. */
export function buildComparisons(periods, params) {
  const out = [];
  for (let i = 1; i < periods.length; i++) {
    out.push({ desde: periods[i - 1].fecha, hasta: periods[i].fecha, tipo: 'consecutivo', movimientos: compareRankings(periods[i - 1], periods[i], params) });
  }
  if (periods.length > 2) {
    const a = periods[0]; const b = periods[periods.length - 1];
    out.push({ desde: a.fecha, hasta: b.fecha, tipo: 'primero-ultimo', movimientos: compareRankings(a, b, params) });
  }
  return out;
}

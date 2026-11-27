/**
 * Estado de la aplicación: catálogos, archivos de períodos, resultados calculados, parámetros y bitácora.
 * Persistencia en disco (carpeta data/), sin base de datos: los resultados se recalculan desde los
 * archivos fuente cada vez que algo cambia, por lo que son siempre reproducibles.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalogs, parseCatalog, buildCatalogs, CATALOG_FILES } from '../engine/catalogs.js';
import { buildDataset, buildComparisons, readAt03 } from '../engine/pipeline.js';
import { compareRankings, DEFAULT_PARAMS } from '../engine/compare.js';

export class Store {
  constructor(dataDir) {
    this.dir = {
      root: dataDir,
      catalogos: path.join(dataDir, 'catalogos'),
      periodos: path.join(dataDir, 'periodos'),
      historial: path.join(dataDir, 'historial'),
    };
    this.paramsFile = path.join(dataDir, 'params.json');
    this.logFile = path.join(dataDir, 'bitacora.json');
    for (const d of Object.values(this.dir)) fs.mkdirSync(d, { recursive: true });
    this.params = this.#readJson(this.paramsFile, DEFAULT_PARAMS);
    this.log = this.#readJson(this.logFile, []);
    this.catalogs = loadCatalogs(this.dir.catalogos);
    this.recalculate();
  }

  #readJson(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return structuredClone(fallback); }
  }

  #files() {
    return fs.readdirSync(this.dir.periodos).filter((f) => f.toLowerCase().endsWith('.csv')).sort()
      .map((name) => ({ name, text: fs.readFileSync(path.join(this.dir.periodos, name), 'utf8') }));
  }

  /** Recalcula todos los períodos desde los archivos en disco. */
  recalculate() {
    const t0 = Date.now();
    const { periods, comparisons, fileErrors } = buildDataset(this.#files(), this.catalogs, this.params);
    this.periods = periods;
    this.comparisons = comparisons;
    this.fileErrors = fileErrors;
    this.byFecha = new Map(periods.map((p) => [p.fecha, p]));
    this.calculatedAt = new Date().toISOString();
    this.lastDurationMs = Date.now() - t0;
  }

  addLog(usuario, accion, detalle) {
    this.log.unshift({ Fecha_Hora: new Date().toISOString(), Perfil: usuario, Accion: accion, Detalle: detalle });
    this.log = this.log.slice(0, 1000);
    fs.writeFileSync(this.logFile, JSON.stringify(this.log, null, 2));
  }

  period(fecha) {
    const p = this.byFecha.get(fecha);
    if (!p) { const e = new Error(`No existe el período ${fecha}`); e.status = 404; throw e; }
    return p;
  }

  /**
   * Carga o actualiza un período. Valida el archivo; si es inválido lanza un error con el detalle.
   * Si el archivo trae un período que ya existía, el archivo anterior se mueve a data/historial.
   * Con dryRun=true solo valida y describe lo que haría.
   */
  uploadPeriod(originalName, text, perfil, { dryRun = false } = {}) {
    const name = path.basename(originalName || 'periodo.csv').replace(/[^\w.\-]/g, '_').replace(/(\.csv)?$/i, '.csv');
    const r = readAt03(text, name, this.catalogs.schema);
    if (!r.ok) {
      if (!dryRun) this.addLog(perfil, 'Carga rechazada', `${name}: ${r.errors.join(' ')}`);
      const e = new Error('El archivo no cumple el formato AT03 del diccionario.');
      e.status = 400; e.details = r.errors; throw e;
    }
    const replaced = this.#files().filter((f) => {
      const other = readAt03(f.text, f.name, this.catalogs.schema);
      return other.ok && other.fechas.some((x) => r.fechas.includes(x));
    }).map((f) => f.name);
    const summary = { archivo: name, filas: r.totalRows, fechas: r.fechas, reemplaza: replaced, accion: replaced.length ? 'actualizar' : 'nuevo' };
    if (dryRun) return summary;

    const prevFechas = this.periods.map((p) => p.fecha);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    for (const f of replaced) fs.renameSync(path.join(this.dir.periodos, f), path.join(this.dir.historial, `${stamp}_${f}`));
    fs.writeFileSync(path.join(this.dir.periodos, name), text, 'utf8');
    this.recalculate();
    this.addLog(perfil, replaced.length ? 'Actualización de período' : 'Carga de período', `${name} (${r.totalRows} filas, Fecha ${r.fechas.join(', ')})${replaced.length ? `; reemplaza ${replaced.join(', ')}` : ''}. Recalculado en ${this.lastDurationMs} ms`);

    // Movimientos detectados automáticamente frente al período anterior a cada fecha cargada
    const nuevos = r.fechas.map((fecha) => {
      const idx = this.periods.findIndex((p) => p.fecha === fecha);
      const prev = idx > 0 ? this.periods[idx - 1] : null;
      return {
        fecha,
        calidad: this.byFecha.get(fecha).quality,
        comparadoCon: prev?.fecha ?? null,
        movimientosSignificativos: prev ? compareRankings(prev, this.periods[idx], this.params).filter((m) => m.Significativo) : [],
      };
    });
    return { ...summary, periodosAntes: prevFechas, periodosAhora: this.periods.map((p) => p.fecha), resultados: nuevos };
  }

  deletePeriod(fecha, perfil) {
    const p = this.period(fecha);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    for (const f of p.archivos) {
      const src = path.join(this.dir.periodos, f);
      if (fs.existsSync(src)) fs.renameSync(src, path.join(this.dir.historial, `${stamp}_${f}`));
    }
    this.recalculate();
    this.addLog(perfil, 'Retiro de período', `Fecha ${fecha}; archivo(s) ${p.archivos.join(', ')} movido(s) a historial`);
  }

  updateParams(next, perfil) {
    const p = {
      minCambioPosicion: Math.max(1, Math.floor(Number(next.minCambioPosicion ?? this.params.minCambioPosicion))),
      cambioLider: Boolean(next.cambioLider ?? this.params.cambioLider),
      umbralVarSaldoPct: Math.max(0, Number(next.umbralVarSaldoPct ?? this.params.umbralVarSaldoPct)),
    };
    if (!Number.isFinite(p.minCambioPosicion) || !Number.isFinite(p.umbralVarSaldoPct)) {
      const e = new Error('Parámetros inválidos: deben ser números.'); e.status = 400; throw e;
    }
    this.params = p;
    fs.writeFileSync(this.paramsFile, JSON.stringify(p, null, 2));
    this.comparisons = buildComparisons(this.periods, p);
    this.addLog(perfil, 'Cambio de parámetros', JSON.stringify(p));
    return p;
  }

  /** Reemplaza un catálogo (con validación estructural) y recalcula todo. Guarda copia del anterior. */
  updateCatalog(kind, text, perfil) {
    const spec = CATALOG_FILES[kind];
    if (!spec) { const e = new Error(`Catálogo desconocido: ${kind}`); e.status = 404; throw e; }
    let parsed;
    try {
      parsed = parseCatalog(kind, text);
      const all = Object.fromEntries(Object.keys(CATALOG_FILES).map((k) => [k, k === kind ? parsed : this.catalogs.raw[k]]));
      buildCatalogs(all);
    } catch (err) { const e = new Error(err.message); e.status = 400; throw e; }
    const file = path.join(this.dir.catalogos, spec.file);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(file, path.join(this.dir.historial, `${stamp}_${spec.file}`));
    fs.writeFileSync(file, text, 'utf8');
    this.catalogs = loadCatalogs(this.dir.catalogos);
    this.recalculate();
    this.addLog(perfil, 'Actualización de catálogo', `${spec.file} (${parsed.length} registros). Recalculado en ${this.lastDurationMs} ms`);
  }
}

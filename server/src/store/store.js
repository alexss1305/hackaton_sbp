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
import { diagnosticarAt03 } from '../engine/diagnose.js';
import { normalizar, defaultAsignaciones, tienePermiso, permisosDe, PERMISOS } from '../api/permisos.js';

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
    this.permisosFile = path.join(dataDir, 'permisos.json');
    for (const d of Object.values(this.dir)) fs.mkdirSync(d, { recursive: true });
    this.params = this.#readJson(this.paramsFile, DEFAULT_PARAMS);
    this.log = this.#readJson(this.logFile, []);
    this.permisos = normalizar(this.#readJson(this.permisosFile, {}));
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
    let name = path.basename(originalName || 'periodo.csv').replace(/[^\w.\-]/g, '_').replace(/(\.csv)?$/i, '.csv');
    // Diagnóstico completo antes de importar: campos vacíos, tipos, ceros perdidos, catálogos y vista previa E1–E4
    const diagnostico = diagnosticarAt03(text, name, this.catalogs);
    const r = readAt03(text, name, this.catalogs.schema);
    if (!r.ok || !diagnostico.importable) {
      const bloqueos = diagnostico.hallazgos.filter((h) => h.gravedad === 'bloqueante')
        .map((h) => `${h.regla}${h.campo.startsWith('(') ? '' : ` en ${h.campo}`}: ${h.cantidad} caso(s), primero en la línea ${h.ejemplos[0]?.linea}`);
      const detalles = [...new Set([...(r.ok ? [] : r.errors), ...bloqueos])];
      if (!dryRun) this.addLog(perfil, 'Carga rechazada', `${name}: ${detalles.join(' · ')}`);
      const e = new Error('El archivo no se puede importar: revise los errores bloqueantes.');
      e.status = 400; e.details = detalles; e.diagnostico = diagnostico; throw e;
    }
    const overlapping = this.#files().map((f) => ({ name: f.name, other: readAt03(f.text, f.name, this.catalogs.schema) }))
      .filter(({ other }) => other.ok && other.fechas.some((x) => r.fechas.includes(x)));
    // Un archivo a reemplazar no puede llevarse períodos que el nuevo no trae (se perderían sin aviso)
    const perderia = overlapping.flatMap(({ name: n, other }) => other.fechas.filter((x) => !r.fechas.includes(x)).map((x) => `${x} (${n})`));
    if (perderia.length) {
      const e = new Error('La carga retiraría períodos que el archivo nuevo no contiene.');
      e.status = 400;
      e.details = [`El archivo existente también trae los períodos ${perderia.join(', ')}. Cargue un archivo que incluya esos períodos o retírelos primero.`];
      throw e;
    }
    const replaced = overlapping.map((f) => f.name);
    // Si ya existe un archivo con el mismo nombre que NO se reemplaza, se guarda con otro nombre
    let finalName = name;
    for (let i = 2; fs.existsSync(path.join(this.dir.periodos, finalName)) && !replaced.includes(finalName); i++) {
      finalName = name.replace(/\.csv$/i, `_${i}.csv`);
    }
    name = finalName;
    const summary = { archivo: name, filas: r.totalRows, fechas: r.fechas, reemplaza: replaced, accion: replaced.length ? 'actualizar' : 'nuevo', diagnostico };
    if (dryRun) return summary;

    const prevFechas = this.periods.map((p) => p.fecha);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    for (const f of replaced) fs.renameSync(path.join(this.dir.periodos, f), path.join(this.dir.historial, `${stamp}_${f}`));
    fs.writeFileSync(path.join(this.dir.periodos, name), text, 'utf8');
    this.recalculate();
    this.addLog(perfil, replaced.length ? 'Actualización de período' : 'Carga de período', `${name} (${r.totalRows} filas, Fecha ${r.fechas.join(', ')})${replaced.length ? `; reemplaza ${replaced.join(', ')}` : ''}. Observaciones: ${diagnostico.totales.calculo} que afectan el cálculo, ${diagnostico.totales.advertencia} advertencias. Recalculado en ${this.lastDurationMs} ms`);

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
    // Si un archivo del período también trae otros meses, retirarlo los borraría sin aviso
    const otros = this.#files().filter((f) => p.archivos.includes(f.name))
      .flatMap((f) => (readAt03(f.text, f.name, this.catalogs.schema).fechas || []).filter((x) => x !== fecha).map((x) => `${x} (${f.name})`));
    if (otros.length) {
      const e = new Error('No se puede retirar solo este período: su archivo contiene otros períodos.');
      e.status = 400;
      e.details = [`El archivo también trae ${otros.join(', ')}. Cargue un archivo actualizado sin este período o retire esos períodos también.`];
      throw e;
    }
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
      cambioLider: next.cambioLider === undefined ? Boolean(this.params.cambioLider) : [true, 'true', 1, '1', 'si', 'sí'].includes(next.cambioLider),
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

  // ---------- Permisos por perfil ----------
  tiene(perfil, clave) { return tienePermiso(this.permisos, perfil, clave); }
  permisosDe(perfil) { return permisosDe(this.permisos, perfil); }
  permisosConfig() { return { catalogo: PERMISOS, asignaciones: this.permisos }; }

  updatePermisos(asignaciones, perfil, { restaurar = false } = {}) {
    if (!restaurar && (typeof asignaciones !== 'object' || asignaciones === null || Array.isArray(asignaciones))) {
      const e = new Error('Formato de permisos inválido.'); e.status = 400; throw e;
    }
    const antes = this.permisos;
    this.permisos = restaurar ? defaultAsignaciones() : normalizar(asignaciones);
    fs.writeFileSync(this.permisosFile, JSON.stringify(this.permisos, null, 2));
    const cambios = PERMISOS.filter((p) => antes[p.clave].join() !== this.permisos[p.clave].join())
      .map((p) => `${p.label}: ${this.permisos[p.clave].join(', ') || 'solo Administrador'}`);
    this.addLog(perfil, restaurar ? 'Permisos restaurados' : 'Cambio de permisos', cambios.join(' · ') || 'Sin cambios');
    return this.permisosConfig();
  }
}

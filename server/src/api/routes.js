import express from 'express';
import { comparacionRouter } from './comparacion.js';
import { bancosRouter } from './bancos.js';
import { authenticate, requirePerfil, login, logout, cambiarContrasena, PERFILES, esPerfil } from './auth.js';
import { compareRankings } from '../engine/compare.js';
import * as X from '../engine/exports.js';
import { toCsv } from '../engine/csv.js';
import { CATALOG_FILES } from '../engine/catalogs.js';
import { preguntar, asistenteDisponible } from './asistente.js';
import { diagnosticarAt03, hallazgosPlano } from '../engine/diagnose.js';
import { consultarOperaciones } from '../engine/consultas.js';

export const FUENTE = 'Datos sintéticos con estructura regulatoria AT03 (Átomo 03) suministrados por la SBP para el Hackathon SBP 2026. '
  + 'Bancos, clientes y operaciones son ficticios. Uso informativo; no constituye opinión formal de la Superintendencia de Bancos de Panamá.';

const list = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);
const wrap = (fn) => (req, res, next) => { try { fn(req, res, next); } catch (e) { next(e); } };

/**
 * Envía un CSV. Por defecto en UTF-8 SIN BOM, igual que los archivos del reto, para que la comparación del
 * jurado lea el encabezado "Fecha" exacto. Con ?bom=1 se agrega el BOM (útil para abrir en Excel).
 */
function sendCsv(res, name, csv, { bom = false } = {}) {
  const safe = name.replace(/[^\w.\-]/g, '_');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
  res.send((bom ? '\ufeff' : '') + csv);
}

export function buildRouter(store, passwords) {
  const r = express.Router();
  r.use(authenticate);
  const permiso = (clave) => (req, res, next) => (store.tiene(req.perfil, clave) ? next()
    : res.status(403).json({ error: `Su perfil (${PERFILES[req.perfil].nombre}) no tiene permiso para esta función.` }));

  // ---------- Sesión ----------
  r.post('/auth/login', express.json(), (req, res) => {
    const { perfil, password, usuario } = req.body || {};
    if (!esPerfil(perfil)) return res.status(400).json({ error: 'Perfil inválido.' });
    const token = login(passwords, perfil, password, usuario);
    if (!token) return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    store.addLog(perfil, 'Inicio de sesión', `Perfil ${PERFILES[perfil].nombre}${usuario ? ` · usuario ${String(usuario).trim().toLowerCase()}` : ''}`);
    res.json({ token, perfil, nombre: PERFILES[perfil].nombre });
  });
  r.post('/auth/logout', (req, res) => { if (req.token) logout(req.token); res.json({ ok: true }); });
  r.get('/auth/me', (req, res) => res.json({ perfil: req.perfil, nombre: PERFILES[req.perfil].nombre, permisos: store.permisosDe(req.perfil) }));

  // ---------- Consulta (todos los perfiles) ----------
  r.get('/meta', (req, res) => {
    const c = store.catalogs;
    res.json({
      fuente: FUENTE,
      calculadoEn: store.calculatedAt,
      periodos: store.periods.map((p) => ({ fecha: p.fecha, archivos: p.archivos, filas: p.quality.Filas_Leidas, universo: p.quality.Universo_Local_Valido })),
      rankings: c.macros,
      subactividades: c.subsByMacro,
      bancos: c.bancos,
      params: store.params,
      permisos: store.permisosDe(req.perfil),
      asistenteDisponible: asistenteDisponible(),
      erroresArchivos: store.fileErrors,
    });
  });

  r.get('/periods/:fecha/rankings', wrap((req, res) => {
    const p = store.period(req.params.fecha);
    res.json(req.query.ranking ? { [req.query.ranking]: p.rankings[req.query.ranking] || [] } : p.rankings);
  }));

  r.get('/periods/:fecha/subactividades', wrap((req, res) => {
    const p = store.period(req.params.fecha);
    const rk = list(req.query.rankings); const bk = list(req.query.bancos); const sb = list(req.query.subactividades);
    res.json(p.subactividades.filter((s) => (!rk.length || rk.includes(s.Ranking)) && (!bk.length || bk.includes(s.Codigo_Banco)) && (!sb.length || sb.includes(s.Subactividad))));
  }));

  r.get('/periods/:fecha/quality', wrap((req, res) => {
    const p = store.period(req.params.fecha);
    res.json({
      quality: p.quality,
      filtros: p.filtros,
      reconciliaciones: {
        r1: { descripcion: p.reconciliaciones.r1.descripcion, ok: p.reconciliaciones.r1.ok, verificaciones: p.reconciliaciones.r1.detalle.length },
        r2: p.reconciliaciones.r2,
        r3: p.reconciliaciones.r3,
      },
      excluidas: p.excluded.slice(0, 300),
      totalExcluidas: p.excluded.length,
      alertas: p.alerts.slice(0, 300),
      totalAlertas: p.alerts.length,
    });
  }));

  r.get('/periods/:fecha/indicadores', wrap((req, res) => res.json(store.period(req.params.fecha).indicadores)));

  // Resumen del panel principal
  r.get('/periods/:fecha/resumen', wrap((req, res) => {
    const p = store.period(req.params.fecha);
    const lideres = Object.entries(p.rankings).map(([rk, rows]) => ({ ranking: rk, ...rows[0], total: rows.reduce((a, x) => a + Number(x.Saldo_Actividad), 0) }));
    const carteraBancos = store.catalogs.bancos.map((b) => ({ ...b, cartera: Number(p.rankings[store.catalogs.macros[0]].find((x) => x.Codigo_Banco === b.codigo)?.Total_Cartera_Local_Valida ?? 0) }));
    res.json({ quality: p.quality, lideres, carteraBancos, indicadores: p.indicadores });
  }));

  // Descargas: ranking, subactividad y calidad para todos los perfiles
  r.get('/export/:tipo.csv', wrap((req, res, next) => {
    const opts = { fechas: list(req.query.fechas), rankings: list(req.query.rankings), bancos: list(req.query.bancos), subactividades: list(req.query.subactividades) };
    const t = req.params.tipo;
    const clave = { rankings: 'descargar_rankings', subactividades: 'descargar_subactividades', calidad: 'descargar_calidad', excluidas: 'descargar_excluidas', alertas: 'descargar_alertas', movimientos: 'descargar_movimientos' }[t];
    if (clave && !store.tiene(req.perfil, clave)) return res.status(403).json({ error: `Su perfil (${PERFILES[req.perfil].nombre}) no tiene permiso para esta descarga. El Administrador puede habilitarlo.` });
    const gen = {
      rankings: () => X.exportRankings(store.periods, opts),
      subactividades: () => X.exportSubactividades(store.periods, opts),
      calidad: () => X.exportCalidad(store.periods, opts),
      excluidas: () => X.exportExcluidas(store.periods, opts),
      alertas: () => X.exportAlertas(store.periods, opts),
      movimientos: () => {
        if (req.query.desde && req.query.hasta) {
          const rows = compareRankings(store.period(req.query.desde), store.period(req.query.hasta), store.params)
            .filter((m) => (!opts.rankings.length || opts.rankings.includes(m.Ranking)) && (!opts.bancos.length || opts.bancos.includes(m.Codigo_Banco)) && (req.query.solo !== '1' || m.Significativo));
          return toCsv(rows, X.COLUMNS.movimientos);
        }
        return X.exportMovimientos(store.comparisons, { soloSignificativos: req.query.solo === '1' });
      },
    }[t];
    if (!gen) return next();
    sendCsv(res, `${t}${opts.fechas.length ? '_' + opts.fechas.join('-') : ''}.csv`, gen(), { bom: req.query.bom === '1' });
  }));

  r.use(bancosRouter(store));

  // ---------- Análisis (Analista y Administrador) ----------
  r.use(comparacionRouter(store, permiso));
  r.get('/comparisons', permiso('comparar_periodos'), (req, res) => {
    res.json(store.comparisons.map((c) => ({ desde: c.desde, hasta: c.hasta, tipo: c.tipo, significativos: c.movimientos.filter((m) => m.Significativo).length })));
  });

  r.get('/compare', permiso('comparar_periodos'), wrap((req, res) => {
    const { desde, hasta } = req.query;
    if (!desde || !hasta || desde === hasta) return res.status(400).json({ error: 'Seleccione dos períodos distintos.' });
    const movs = compareRankings(store.period(desde), store.period(hasta), store.params);
    res.json({ desde, hasta, params: store.params, movimientos: movs });
  }));

  // Serie histórica de posiciones y saldos por banco (para evolución y comparación de entidades)
  r.get('/series', permiso('comparar_periodos'), (req, res) => {
    const rk = req.query.ranking || store.catalogs.macros[0];
    res.json(store.periods.map((p) => ({ fecha: p.fecha, filas: (p.rankings[rk] || []).map(({ Codigo_Banco, Banco, Posicion, Saldo_Actividad, Ponderacion_Pct }) => ({ Codigo_Banco, Banco, Posicion, Saldo_Actividad: Number(Saldo_Actividad), Ponderacion_Pct: Number(Ponderacion_Pct) })) })));
  });

  // ---------- Asistente de IA (explica resultados ya calculados) ----------
  r.post('/asistente', permiso('asistente_ia'), express.json({ limit: '200kb' }), async (req, res, next) => {
    try { res.json(await preguntar(store, req.body || {})); } catch (e) { next(e); }
  });

  // ---------- Administración ----------
  const admin = requirePerfil('administrador');
  const csvBody = express.text({ type: ['text/csv', 'text/plain', 'application/octet-stream'], limit: '60mb' });

  r.post('/admin/periods', admin, csvBody, wrap((req, res) => {
    if (typeof req.body !== 'string' || !req.body.length) return res.status(400).json({ error: 'No se recibió ningún archivo CSV.' });
    res.json(store.uploadPeriod(req.query.nombre, req.body, req.perfil, { dryRun: req.query.dryRun === '1' }));
  }));
  // Diagnóstico descargable (todas las observaciones con línea, valor y valor esperado)
  r.post('/admin/periods/diagnostico.csv', admin, csvBody, wrap((req, res) => {
    if (typeof req.body !== 'string' || !req.body.length) return res.status(400).json({ error: 'No se recibió ningún archivo CSV.' });
    const nombre = String(req.query.nombre || 'archivo.csv');
    const d = diagnosticarAt03(req.body, nombre, store.catalogs, { maxEjemplos: Infinity });
    sendCsv(res, `diagnostico_${nombre.replace(/\.csv$/i, '')}.csv`, toCsv(hallazgosPlano(d), ['Gravedad', 'Regla', 'Campo', 'Total_En_Archivo', 'Linea', 'Valor', 'Esperado', 'Sugerencia']), { bom: req.query.bom === '1' });
  }));
  r.delete('/admin/periods/:fecha', admin, wrap((req, res) => { store.deletePeriod(req.params.fecha, req.perfil); res.json({ ok: true }); }));
  r.post('/admin/recalculate', admin, (req, res) => {
    store.recalculate(); store.addLog(req.perfil, 'Recálculo manual', `${store.periods.length} períodos en ${store.lastDurationMs} ms`);
    res.json({ ok: true, ms: store.lastDurationMs });
  });
  r.get('/admin/params', admin, (req, res) => res.json(store.params));
  r.put('/admin/params', admin, express.json(), wrap((req, res) => res.json(store.updateParams(req.body || {}, req.perfil))));
  r.get('/admin/catalogs', admin, (req, res) => {
    res.json(Object.fromEntries(Object.entries(CATALOG_FILES).map(([k, s]) => [k, { archivo: s.file, columnas: s.columns, filas: store.catalogs.raw[k] }])));
  });
  r.put('/admin/catalogs/:kind', admin, csvBody, wrap((req, res) => { store.updateCatalog(req.params.kind, req.body, req.perfil); res.json({ ok: true }); }));
  r.get('/admin/log', admin, (req, res) => res.json(store.log));
  r.get('/admin/permisos', admin, (req, res) => res.json(store.permisosConfig()));
  r.put('/admin/permisos', admin, express.json(), wrap((req, res) => res.json(store.updatePermisos(req.body?.asignaciones, req.perfil))));
  r.post('/admin/permisos/restaurar', admin, wrap((req, res) => res.json(store.updatePermisos(null, req.perfil, { restaurar: true }))));
  r.put('/admin/contrasena', admin, express.json(), wrap((req, res) => {
    const { perfil, password } = req.body || {};
    cambiarContrasena(passwords, perfil, password);
    store.addLog(req.perfil, 'Cambio de contraseña', `Se actualizó la contraseña del perfil ${PERFILES[perfil]?.nombre || perfil}`);
    res.json({ ok: true });
  }));
  r.get('/admin/operaciones', admin, wrap((req, res) => {
    if (!req.query.fecha) return res.status(400).json({ error: 'Seleccione una fecha de corte.' });
    res.json(consultarOperaciones(store.period(req.query.fecha), req.query));
  }));
  r.get('/admin/operaciones.csv', admin, wrap((req, res) => {
    if (!req.query.fecha) return res.status(400).json({ error: 'Seleccione una fecha de corte.' });
    const { rows } = consultarOperaciones(store.period(req.query.fecha), { ...req.query, todo: '1' });
    const columnas = rows[0] ? Object.keys(rows[0]) : ['Numero_Prestamo'];
    sendCsv(res, 'consulta_operaciones.csv', toCsv(rows, columnas), { bom: req.query.bom === '1' });
  }));

  r.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
  // eslint-disable-next-line no-unused-vars
  r.use((err, req, res, _next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'El archivo supera el tamaño máximo (60 MB).' });
    if (!err.status) console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Error interno', detalles: err.details, diagnostico: err.diagnostico });
  });
  return r;
}

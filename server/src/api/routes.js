import express from 'express';
import { authenticate, requirePerfil, login, logout, PERFILES } from './auth.js';
import { compareRankings } from '../engine/compare.js';
import * as X from '../engine/exports.js';
import { toCsv } from '../engine/csv.js';
import { CATALOG_FILES } from '../engine/catalogs.js';

export const FUENTE = 'Datos sintéticos con estructura regulatoria AT03 (Átomo 03) suministrados por la SBP para el Hackathon SBP 2026. '
  + 'Bancos, clientes y operaciones son ficticios. Uso informativo; no constituye opinión formal de la Superintendencia de Bancos de Panamá.';

const list = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);
const wrap = (fn) => (req, res, next) => { try { fn(req, res, next); } catch (e) { next(e); } };

function sendCsv(res, name, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send('﻿' + csv); // BOM para que Excel muestre bien los acentos
}

export function buildRouter(store, passwords) {
  const r = express.Router();
  r.use(authenticate);

  // ---------- Sesión ----------
  r.post('/auth/login', express.json(), (req, res) => {
    const { perfil, password } = req.body || {};
    const token = login(passwords, perfil, password);
    if (!token) return res.status(401).json({ error: 'Perfil o contraseña incorrectos.' });
    store.addLog(perfil, 'Inicio de sesión', `Perfil ${PERFILES[perfil].nombre}`);
    res.json({ token, perfil, nombre: PERFILES[perfil].nombre });
  });
  r.post('/auth/logout', (req, res) => { if (req.token) logout(req.token); res.json({ ok: true }); });
  r.get('/auth/me', (req, res) => res.json({ perfil: req.perfil, nombre: PERFILES[req.perfil].nombre }));

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
    const analyst = ['movimientos', 'excluidas', 'alertas'];
    if (analyst.includes(t) && PERFILES[req.perfil].nivel < 2) return res.status(403).json({ error: 'Esta descarga está disponible para Analista o Administrador.' });
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
    sendCsv(res, `${t}${opts.fechas.length ? '_' + opts.fechas.join('-') : ''}.csv`, gen());
  }));

  // ---------- Análisis (Analista y Administrador) ----------
  r.get('/comparisons', requirePerfil('analista'), (req, res) => {
    res.json(store.comparisons.map((c) => ({ desde: c.desde, hasta: c.hasta, tipo: c.tipo, significativos: c.movimientos.filter((m) => m.Significativo).length })));
  });

  r.get('/compare', requirePerfil('analista'), wrap((req, res) => {
    const { desde, hasta } = req.query;
    if (!desde || !hasta || desde === hasta) return res.status(400).json({ error: 'Seleccione dos períodos distintos.' });
    const movs = compareRankings(store.period(desde), store.period(hasta), store.params);
    res.json({ desde, hasta, params: store.params, movimientos: movs });
  }));

  // Serie histórica de posiciones y saldos por banco (para evolución y comparación de entidades)
  r.get('/series', requirePerfil('analista'), (req, res) => {
    const rk = req.query.ranking || store.catalogs.macros[0];
    res.json(store.periods.map((p) => ({ fecha: p.fecha, filas: (p.rankings[rk] || []).map(({ Codigo_Banco, Banco, Posicion, Saldo_Actividad, Ponderacion_Pct }) => ({ Codigo_Banco, Banco, Posicion, Saldo_Actividad: Number(Saldo_Actividad), Ponderacion_Pct: Number(Ponderacion_Pct) })) })));
  });

  // ---------- Administración ----------
  const admin = requirePerfil('administrador');
  const csvBody = express.text({ type: ['text/csv', 'text/plain', 'application/octet-stream'], limit: '60mb' });

  r.post('/admin/periods', admin, csvBody, wrap((req, res) => {
    if (typeof req.body !== 'string' || !req.body.length) return res.status(400).json({ error: 'No se recibió ningún archivo CSV.' });
    res.json(store.uploadPeriod(req.query.nombre, req.body, req.perfil, { dryRun: req.query.dryRun === '1' }));
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

  r.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
  // eslint-disable-next-line no-unused-vars
  r.use((err, req, res, _next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'El archivo supera el tamaño máximo (60 MB).' });
    if (!err.status) console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Error interno', detalles: err.details });
  });
  return r;
}

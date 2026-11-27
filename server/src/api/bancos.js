import express from 'express';
import { listaBancos, fichaBanco } from '../engine/bancos.js';

/** Fichas de bancos (consulta para todos los perfiles). Se monta en /api. */
export function bancosRouter(store) {
  const r = express.Router();
  const fechaDe = (req) => String(req.query.fecha || store.periods.at(-1)?.fecha || '');
  r.get('/bancos', (req, res, next) => {
    try { res.json(listaBancos(store.periods, store.catalogs, fechaDe(req))); } catch (e) { next(e); }
  });
  r.get('/bancos/:codigo', (req, res, next) => {
    try { res.json(fichaBanco(store.periods, store.catalogs, req.params.codigo, fechaDe(req))); } catch (e) { next(e); }
  });
  return r;
}

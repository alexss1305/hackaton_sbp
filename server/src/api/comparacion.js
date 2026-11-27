import express from 'express';
import { comparar, MAX_BANCOS } from '../engine/comparacion.js';

const list = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);

/**
 * Rutas de comparación avanzada (rol Analista). Se monta en /api con el middleware de permisos ya aplicado.
 * GET /comparacion?fechas=AAAAMMDD,...&bancos=101,...&rankings=HIPOTECARIO,...
 */
export function comparacionRouter(store, permiso) {
  const r = express.Router();
  r.get('/comparacion', permiso('comparar_periodos'), (req, res, next) => {
    try {
      const out = comparar(store.periods, store.catalogs, {
        fechas: list(req.query.fechas), bancos: list(req.query.bancos), rankings: list(req.query.rankings), params: store.params,
      });
      res.json({ ...out, params: store.params, maxBancos: MAX_BANCOS });
    } catch (e) { next(e); }
  });
  return r;
}

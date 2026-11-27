import express from 'express';
import { consultarOperaciones } from '../engine/consultas.js';
import { toCsv } from '../engine/csv.js';

/** Datos del cliente que no se muestran a quien no es Administrador (no se usan para clasificar: R3). */
const CLIENTE = ['Nombre_Cliente', 'ID_Cliente'];
const sinCliente = (r) => { const o = { ...r }; for (const c of CLIENTE) delete o[c]; return o; };

/**
 * Registros (préstamos) de un período: solo consulta. Permiso `consultar_registros` (Analista por defecto;
 * el Administrador siempre). Se monta en /api.
 */
export function registrosRouter(store, permiso) {
  const r = express.Router();
  const consultar = (req, extra = {}) => {
    if (!req.query.fecha) throw Object.assign(new Error('Seleccione una fecha de corte.'), { status: 400 });
    const out = consultarOperaciones(store.period(String(req.query.fecha)), { ...req.query, ...extra });
    if (req.perfil !== 'administrador') out.rows = out.rows.map(sinCliente);
    return out;
  };
  r.get('/registros', permiso('consultar_registros'), (req, res, next) => {
    try { res.json(consultar(req)); } catch (e) { next(e); }
  });
  r.get('/registros.csv', permiso('consultar_registros'), (req, res, next) => {
    try {
      const { rows } = consultar(req, { todo: '1' });
      const cols = rows[0] ? Object.keys(rows[0]) : ['Numero_Prestamo'];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="registros_${String(req.query.fecha).replace(/\D/g, '')}.csv"`);
      res.send((req.query.bom === '1' ? '﻿' : '') + toCsv(rows, cols));
    } catch (e) { next(e); }
  });
  return r;
}

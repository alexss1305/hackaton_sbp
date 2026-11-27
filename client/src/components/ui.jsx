import { useEffect, useMemo, useState, useCallback } from 'react';
import { api } from '../api.js';

/** Carga datos de la API y vuelve a cargar cuando cambian las dependencias. */
export function useApi(path, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const load = useCallback(() => {
    if (!path) { setState({ data: null, error: null, loading: false }); return () => {}; }
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    api(path).then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error) => alive && setState({ data: null, error, loading: false }));
    return () => { alive = false; };
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, reload: load };
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return (
    <div className="alert error" role="alert">
      <b>{error.message}</b>
      {error.detalles?.length > 0 && <ul>{error.detalles.map((d, i) => <li key={i}>{d}</li>)}</ul>}
    </div>
  );
}

export const Loading = () => <div className="muted">Cargando…</div>;

export function Kpi({ label, value, hint }) {
  return <div className="kpi"><div className="label">{label}</div><div className="value">{value}</div>{hint && <div className="hint">{hint}</div>}</div>;
}

export function Badge({ ok, children, kind }) {
  const k = kind || (ok ? 'ok' : 'bad');
  return <span className={`badge ${k}`}>{children}</span>;
}

/**
 * Tabla ordenable. columns: [{ key, label, num, render(row), sortValue(row) }]
 */
export function SortableTable({ columns, rows, initialSort, onRowClick, selectedKey, rowKey = (r, i) => i, maxHeight, empty = 'Sin datos para los filtros seleccionados.' }) {
  const [sort, setSort] = useState(initialSort || { key: null, dir: 1 });
  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const col = columns.find((c) => c.key === sort.key);
    const val = col?.sortValue || ((r) => r[sort.key]);
    return [...rows].sort((a, b) => {
      const x = val(a); const y = val(b);
      if (x === y) return 0;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      const nx = Number(x); const ny = Number(y);
      const cmp = !Number.isNaN(nx) && !Number.isNaN(ny) && x !== '' && y !== '' ? nx - ny : String(x).localeCompare(String(y), 'es');
      return cmp * sort.dir;
    });
  }, [rows, sort, columns]);
  const toggle = (key) => setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }));
  return (
    <div className="table-wrap" style={maxHeight ? { maxHeight } : undefined}>
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={`sortable ${c.num ? 'num' : ''}`} onClick={() => toggle(c.key)} aria-sort={sort.key === c.key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
                {c.label}{sort.key === c.key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && <tr><td colSpan={columns.length} className="muted">{empty}</td></tr>}
          {sorted.map((r, i) => {
            const k = rowKey(r, i);
            return (
              <tr key={k} className={`${onRowClick ? 'clickable' : ''} ${selectedKey !== undefined && k === selectedKey ? 'selected' : ''}`} onClick={onRowClick ? () => onRowClick(r) : undefined}>
                {columns.map((c) => <td key={c.key} className={`${c.num ? 'num' : ''} ${c.wrap ? 'wrap' : ''}`}>{c.render ? c.render(r) : r[c.key]}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Selector múltiple con casillas. options: [{ value, label }] */
export function MultiSelect({ label, options, value, onChange, placeholder = 'Todos' }) {
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const summary = value.length === 0 ? placeholder : value.length === 1 ? options.find((o) => o.value === value[0])?.label : `${value.length} seleccionados`;
  return (
    <div className="field">
      {label}
      <details className="multi">
        <summary>{summary}</summary>
        <div className="menu">
          <label><input type="checkbox" checked={value.length === 0} onChange={() => onChange([])} /> {placeholder}</label>
          {options.map((o) => (
            <label key={o.value}><input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} /> {o.label}</label>
          ))}
        </div>
      </details>
    </div>
  );
}

export function Select({ label, value, onChange, options }) {
  return (
    <label className="field">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

/** Tooltip de gráficos: texto en tintas de texto, el color solo en la muestra. */
export function ChartTooltip({ active, payload, label, labelFormatter, valueFormatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tooltip">
      <div className="t">{labelFormatter ? labelFormatter(label, payload) : label}</div>
      {payload.map((p) => (
        <div className="row" key={p.dataKey + p.name}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><i className="sw" style={{ background: p.color || p.fill }} />{p.name}</span>
          <span>{valueFormatter ? valueFormatter(p.value, p) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }) {
  return <div className="legend">{items.map((it) => <span key={it.label}><i className="sw" style={{ background: it.color }} />{it.label}</span>)}</div>;
}

export function Trend({ value }) {
  if (value === null || value === undefined) return <span className="badge muted">Nuevo</span>;
  if (value > 0) return <span className="up" title="Sube">▲ {value}</span>;
  if (value < 0) return <span className="down" title="Baja">▼ {Math.abs(value)}</span>;
  return <span className="muted" title="Se mantiene">= 0</span>;
}

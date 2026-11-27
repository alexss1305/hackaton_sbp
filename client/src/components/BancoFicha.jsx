import { useEffect, useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useApi, ErrorBox, Loading, ChartTooltip, SortableTable } from './ui.jsx';
import { Icon } from './brand.jsx';
import { fmtMoney, fmtMoneyCompact, fmtPct, fmtInt, fmtCorte, fmtMes, fmtRanking, SERIES } from '../format.js';
import './bancos.css';

const PASOS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'rankings', label: 'Posición en rankings' },
  { id: 'subactividades', label: 'Subactividades' },
  { id: 'calidad', label: 'Calidad de cartera' },
  { id: 'evolucion', label: 'Evolución' },
];

export const iniciales = (n) => n.replace(/^Banco (del |de )?/i, '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
/** Semáforo de morosidad frente al promedio del sistema (referencial, no regulatorio). */
export function semaforo(v, promedio) {
  if (v === null || v === undefined || !promedio) return { cls: 'neutro', label: 'Sin dato' };
  if (v <= promedio) return { cls: 'verde', label: 'Igual o menor al promedio' };
  if (v <= promedio * 1.25) return { cls: 'ambar', label: 'Algo mayor al promedio' };
  return { cls: 'rojo', label: 'Bastante mayor al promedio' };
}

/** Ficha del banco por pasos. modo "modal" (con fondo y cierre) o "pagina" (incrustada). */
export default function BancoFicha({ codigo, fecha, onClose, modo = 'modal', promedioMorosidad }) {
  const { data, error, loading } = useApi(codigo ? `/bancos/${codigo}?fecha=${fecha}` : null, [fecha]);
  const [paso, setPaso] = useState(0);
  useEffect(() => {
    if (modo !== 'modal') return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modo, onClose]);

  const cuerpo = (
    <div className={`bf ${modo}`} role={modo === 'modal' ? 'dialog' : undefined} aria-modal={modo === 'modal' || undefined} aria-label={data ? `Ficha de ${data.nombre}` : 'Ficha del banco'}>
      <div className="bf-head">
        {data && <span className="bf-avatar">{iniciales(data.nombre)}</span>}
        <div className="bf-title">
          <h2>{data?.nombre || 'Cargando…'}</h2>
          {data && <span className="muted">Código {data.codigo} · corte {fmtCorte(data.fecha)}</span>}
        </div>
        {modo === 'modal' && <button type="button" className="bf-close" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>}
      </div>
      <ol className="bf-steps">
        {PASOS.map((p, i) => (
          <li key={p.id}>
            <button type="button" className={i === paso ? 'on' : i < paso ? 'done' : ''} onClick={() => setPaso(i)}>
              <span className="bf-n">{i + 1}</span>{p.label}
            </button>
          </li>
        ))}
      </ol>
      <div className="bf-body">
        <ErrorBox error={error} />
        {loading || !data ? <Loading /> : <Paso id={PASOS[paso].id} d={data} promedioMorosidad={promedioMorosidad} />}
      </div>
      <div className="bf-foot">
        <button type="button" className="btn" disabled={paso === 0} onClick={() => setPaso(paso - 1)}><Icon name="back" />Anterior</button>
        <span className="muted">{paso + 1} de {PASOS.length}</span>
        {paso < PASOS.length - 1
          ? <button type="button" className="btn primary" onClick={() => setPaso(paso + 1)}>Siguiente<Icon name="chevron" /></button>
          : modo === 'modal' ? <button type="button" className="btn primary" onClick={onClose}>Cerrar</button> : <span />}
      </div>
    </div>
  );
  if (modo !== 'modal') return cuerpo;
  return <div className="bf-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>{cuerpo}</div>;
}

function Paso({ id, d, promedioMorosidad }) {
  const r = d.resumen;
  if (id === 'resumen') {
    const s = semaforo(r.morosidadPct, promedioMorosidad);
    return (
      <div className="bf-kpis">
        <div className="bf-kpi"><span>Cartera local válida</span><b>{fmtMoneyCompact(r.cartera)}</b><small>{fmtMoney(r.cartera)}</small></div>
        <div className="bf-kpi"><span>Puesto por tamaño</span><b>#{r.puestoCartera} de 12</b><small>{fmtPct(r.participacionSistemaPct, 2)} del sistema</small></div>
        <div className="bf-kpi"><span>Variación de cartera</span>
          <b className={r.varCarteraPct === null ? '' : Number(r.varCarteraPct) >= 0 ? 'up' : 'down'}>{r.varCarteraPct === null ? '—' : `${Number(r.varCarteraPct) >= 0 ? '+' : ''}${r.varCarteraPct}%`}</b>
          <small>{r.fechaAnterior ? `frente a ${fmtMes(r.fechaAnterior)}` : 'Es el primer corte cargado'}</small></div>
        <div className="bf-kpi"><span>Operaciones válidas</span><b>{fmtInt(r.operaciones)}</b><small>préstamos que suman su cartera</small></div>
        <div className="bf-kpi"><span>Morosidad</span><b><i className={`sem ${s.cls}`} />{fmtPct(r.morosidadPct, 2)}</b><small>{s.label}</small></div>
        <div className="bf-kpi"><span>Lidera</span><b className="bf-lidera">{r.lidera.length ? r.lidera.map(fmtRanking).join(', ') : 'Ninguna actividad'}</b><small>actividades donde ocupa el puesto 1</small></div>
      </div>
    );
  }
  if (id === 'rankings') {
    return (
      <div className="bf-rank">
        {r.posiciones.map((p) => (
          <div key={p.Ranking} className={`bf-rank-row ${p.Posicion === 1 ? 'lider' : ''}`}>
            <span className="bf-pos">#{p.Posicion}</span>
            <div className="bf-rank-info">
              <b>{fmtRanking(p.Ranking)}</b>
              <div className="bf-track"><i style={{ width: `${((13 - p.Posicion) / 12) * 100}%` }} /></div>
            </div>
            <div className="bf-rank-num"><b>{fmtMoneyCompact(p.Saldo_Actividad)}</b><small>{fmtPct(p.Ponderacion_Pct, 2)} de su cartera</small></div>
          </div>
        ))}
        <p className="muted" style={{ fontSize: 12 }}>La barra es más larga cuanto mejor es el puesto (1 = mayor saldo). La ponderación es la parte de la cartera del banco que va a esa actividad.</p>
      </div>
    );
  }
  if (id === 'subactividades') {
    return (
      <div className="bf-subs">
        {d.rankings.map((rk) => {
          const filas = d.subactividades.filter((s) => s.Ranking === rk);
          const total = filas.reduce((a, s) => a + Number(s.Saldo), 0);
          return (
            <div key={rk} className="bf-sub">
              <div className="bf-sub-h"><b>{fmtRanking(rk)}</b><span>{fmtMoney(total)}</span></div>
              <div className="bf-stack">
                {filas.map((s, i) => Number(s.Saldo) > 0 && <i key={s.Subactividad} title={`${s.Subactividad}: ${fmtMoney(s.Saldo)}`} style={{ flex: Number(s.Saldo), background: SERIES[i % SERIES.length] }} />)}
              </div>
              <div className="bf-sub-leg">
                {filas.map((s, i) => <span key={s.Subactividad}><i style={{ background: SERIES[i % SERIES.length] }} />{s.Subactividad} · {total ? fmtPct((Number(s.Saldo) / total) * 100, 1) : '—'}</span>)}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  if (id === 'calidad') {
    const s = semaforo(r.morosidadPct, promedioMorosidad);
    const tramos = Object.entries(r.porVencer || {}).map(([k, v]) => ({ tramo: k.replace('Monto_por_Vencer_', '').replaceAll('_', ' '), v }));
    return (
      <>
        <div className="bf-kpis">
          <div className="bf-kpi"><span>Morosidad</span><b><i className={`sem ${s.cls}`} />{fmtPct(r.morosidadPct, 2)}</b><small>% de la cartera con pagos atrasados · {s.label.toLowerCase()}</small></div>
          <div className="bf-kpi"><span>Saldo con atraso</span><b>{fmtMoneyCompact(r.saldoMoroso)}</b><small>{fmtMoney(r.saldoMoroso)}</small></div>
          <div className="bf-kpi"><span>Monto vencido</span><b>{fmtPct(r.vencidoPct, 2)}</b><small>{fmtMoney(r.montoVencido)} de cuotas impagas</small></div>
          <div className="bf-kpi"><span>Tasa promedio</span><b>{fmtPct(r.tasaPromedio, 2)}</b><small>ponderada por saldo</small></div>
        </div>
        <h3 style={{ marginTop: 16 }}>Vencimientos de la cartera (capital por vencer)</h3>
        <div className="chart" style={{ height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={tramos} margin={{ left: 10, right: 10, bottom: 30 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="tramo" interval={0} angle={-20} textAnchor="end" height={50} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtMoneyCompact} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip valueFormatter={fmtMoney} />} />
              <Bar dataKey="v" name="Por vencer" fill="var(--series-1)" radius={[4, 4, 0, 0]} animationDuration={700} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>Indicadores adicionales: no intervienen en el ranking.</p>
      </>
    );
  }
  // evolución
  const ev = d.evolucion.map((e) => ({ ...e, mes: fmtMes(e.Fecha), carteraN: Number(e.cartera) }));
  return (
    <div className="grid g2">
      <div>
        <h3>Cartera local por corte</h3>
        <div className="chart" style={{ height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={ev} margin={{ left: 10, right: 10 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="mes" axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtMoneyCompact} axisLine={false} tickLine={false} width={70} />
              <Tooltip content={<ChartTooltip valueFormatter={fmtMoney} />} />
              <Bar dataKey="carteraN" name="Cartera local" radius={[4, 4, 0, 0]} animationDuration={700}>
                {ev.map((e) => <Cell key={e.Fecha} fill={e.Fecha === d.fecha ? 'var(--gold)' : 'var(--series-1)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div>
        <h3>Posición en cada ranking</h3>
        <div className="chart" style={{ height: 240 }}>
          <ResponsiveContainer>
            <LineChart data={ev} margin={{ left: 0, right: 10 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="mes" axisLine={false} tickLine={false} />
              <YAxis reversed domain={[1, 12]} allowDecimals={false} axisLine={false} tickLine={false} width={30} />
              <Tooltip content={<ChartTooltip valueFormatter={(v) => `#${v}`} />} />
              {d.rankings.map((rk, i) => <Line key={rk} dataKey={`pos_${rk}`} name={fmtRanking(rk)} stroke={SERIES[i % SERIES.length]} strokeWidth={2} dot={{ r: 3 }} animationDuration={700} />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <SortableTable
          rows={ev}
          rowKey={(e) => e.Fecha}
          columns={[
            { key: 'Fecha', label: 'Corte', render: (e) => fmtCorte(e.Fecha) },
            { key: 'carteraN', label: 'Cartera local', num: true, render: (e) => fmtMoney(e.cartera) },
            { key: 'operaciones', label: 'Operaciones', num: true, render: (e) => fmtInt(e.operaciones) },
            { key: 'morosidadPct', label: 'Morosidad', num: true, render: (e) => fmtPct(e.morosidadPct, 2) },
            ...d.rankings.map((rk) => ({ key: `pos_${rk}`, label: fmtRanking(rk), num: true, render: (e) => `#${e[`pos_${rk}`]}` })),
          ]}
        />
      </div>
    </div>
  );
}

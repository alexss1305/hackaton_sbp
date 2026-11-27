import { useMemo, useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { useApi, ErrorBox, Loading, SortableTable, ChartTooltip, Select, MultiSelect, Legend, Trend, Badge } from '../components/ui.jsx';
import { download, qs } from '../api.js';
import { fmtMoney, fmtCompact, fmtPeriodo, fmtPeriodoCorto, fmtRanking, fmtPct, SERIES } from '../format.js';

export default function Comparar({ ctx }) {
  const { meta } = ctx;
  const fechas = meta.periodos.map((p) => p.fecha);
  const [desde, setDesde] = useState(fechas.at(-2) || fechas[0]);
  const [hasta, setHasta] = useState(fechas.at(-1));
  const [ranking, setRanking] = useState(meta.rankings[0]);
  const [solo, setSolo] = useState(false);
  const valid = desde && hasta && desde !== hasta;
  const cmp = useApi(valid ? `/compare${qs({ desde, hasta })}` : null);
  const movs = useMemo(() => cmp.data?.movimientos || [], [cmp.data]);
  const p = cmp.data?.params;

  const principales = useMemo(() => movs.filter((m) => m.Significativo)
    .sort((a, b) => Math.abs(b.Cambio_Posicion ?? 0) - Math.abs(a.Cambio_Posicion ?? 0) || Math.abs(Number(b.Var_Saldo_Pct ?? 0)) - Math.abs(Number(a.Var_Saldo_Pct ?? 0)))
    .slice(0, 8), [movs]);
  const delRanking = movs.filter((m) => m.Ranking === ranking);
  const tabla = movs.filter((m) => (ranking === '*' || m.Ranking === ranking) && (!solo || m.Significativo));
  const conteo = Object.fromEntries(meta.rankings.map((r) => [r, movs.filter((m) => m.Ranking === r && m.Significativo).length]));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Comparación entre períodos</h1>
          <p>Cambio_Posicion = posición anterior − posición actual (positivo = sube). Var_Saldo_Pct = (saldo actual − anterior) / anterior × 100.</p>
        </div>
        <div className="toolbar no-print">
          <button className="btn" disabled={!valid} onClick={() => download(`/export/movimientos.csv${qs({ desde, hasta, rankings: ranking === '*' ? [] : [ranking], solo: solo ? '1' : '' })}`)}>⬇ Reporte de movimientos (CSV)</button>
          <button className="btn" onClick={() => window.print()}>🖨 Imprimir / PDF</button>
        </div>
      </div>

      <div className="card toolbar no-print">
        <Select label="Período anterior" value={desde} onChange={setDesde} options={fechas.map((f) => ({ value: f, label: fmtPeriodo(f) }))} />
        <Select label="Período actual" value={hasta} onChange={setHasta} options={fechas.map((f) => ({ value: f, label: fmtPeriodo(f) }))} />
        <Select label="Ranking" value={ranking} onChange={setRanking} options={[...meta.rankings.map((r) => ({ value: r, label: `${fmtRanking(r)} (${conteo[r] ?? 0} significativos)` })), { value: '*', label: 'Todos (solo tabla)' }]} />
        <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 8 }}>
          <input type="checkbox" checked={solo} onChange={(e) => setSolo(e.target.checked)} /> Solo movimientos significativos
        </label>
      </div>
      {!valid && <div className="alert info">Seleccione dos períodos distintos.</div>}
      <ErrorBox error={cmp.error} />
      {p && (
        <div className="alert info">
          <b>Regla de movimiento significativo (configurable por el Administrador):</b> |Cambio_Posicion| ≥ {p.minCambioPosicion}
          {p.cambioLider ? ' · cambio de líder' : ''}{p.umbralVarSaldoPct ? ` · |Var_Saldo_Pct| ≥ ${p.umbralVarSaldoPct}%` : ''}
        </div>
      )}
      {cmp.loading ? <Loading /> : valid && (
        <>
          <div className="card">
            <h2>Principales movimientos · {fmtPeriodo(desde)} → {fmtPeriodo(hasta)}</h2>
            <p className="sub">Explicación automática generada por reglas a partir de los datos (identifica la subactividad que más explica cada cambio).</p>
            {principales.length === 0 ? <p className="muted">No hay movimientos significativos con la regla actual.</p> : (
              <ul className="explain">
                {principales.map((m) => (
                  <li key={m.Ranking + m.Codigo_Banco} className={(m.Cambio_Posicion ?? 0) < 0 ? 'down' : ''}>
                    <div className="r">{fmtRanking(m.Ranking)} · {m.Motivo_Significativo}</div>{m.Explicacion}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {ranking !== '*' && (
            <div className="grid g2">
              <div className="card">
                <h2>Cambio de posición · {fmtRanking(ranking)}</h2>
                <p className="sub">Azul = sube, rojo = baja.</p>
                <div className="chart">
                  <ResponsiveContainer>
                    <BarChart data={[...delRanking].sort((a, b) => a.Posicion_Actual - b.Posicion_Actual)} layout="vertical" margin={{ left: 10, right: 20 }} barCategoryGap={2}>
                      <CartesianGrid horizontal={false} />
                      <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="Banco" width={140} axisLine={false} tickLine={false} />
                      <ReferenceLine x={0} stroke="var(--neutral)" />
                      <Tooltip content={<ChartTooltip valueFormatter={(v, pl) => `${v > 0 ? '+' : ''}${v} (${pl.payload.Posicion_Anterior} → ${pl.payload.Posicion_Actual})`} />} />
                      <Bar dataKey="Cambio_Posicion" name="Cambio de posición" radius={4}>
                        {delRanking.map((m) => <Cell key={m.Codigo_Banco} fill={(m.Cambio_Posicion ?? 0) >= 0 ? 'var(--up)' : 'var(--down)'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <Evolucion ranking={ranking} meta={meta} />
            </div>
          )}

          <div className="card">
            <h2>Detalle de movimientos</h2>
            <SortableTable
              rows={tabla}
              rowKey={(m) => m.Ranking + m.Codigo_Banco}
              initialSort={{ key: 'Posicion_Actual', dir: 1 }}
              columns={[
                ...(ranking === '*' ? [{ key: 'Ranking', label: 'Ranking' }] : []),
                { key: 'Banco', label: 'Banco' },
                { key: 'Posicion_Anterior', label: `Pos. ${fmtPeriodoCorto(desde)}`, num: true },
                { key: 'Posicion_Actual', label: `Pos. ${fmtPeriodoCorto(hasta)}`, num: true },
                { key: 'Cambio_Posicion', label: 'Cambio', num: true, render: (m) => <Trend value={m.Cambio_Posicion} /> },
                { key: 'Saldo_Anterior', label: 'Saldo anterior', num: true, render: (m) => fmtMoney(m.Saldo_Anterior) },
                { key: 'Saldo_Actual', label: 'Saldo actual', num: true, render: (m) => fmtMoney(m.Saldo_Actual) },
                { key: 'Var_Saldo', label: 'Var. saldo', num: true, render: (m) => fmtMoney(m.Var_Saldo) },
                { key: 'Var_Saldo_Pct', label: 'Var. %', num: true, render: (m) => fmtPct(m.Var_Saldo_Pct, 2) },
                { key: 'Significativo', label: 'Significativo', render: (m) => (m.Significativo ? <Badge kind="warn">{m.Motivo_Significativo}</Badge> : '') },
              ]}
            />
          </div>
        </>
      )}
    </>
  );
}

/** Evolución de posiciones (bump chart) o saldos de hasta 4 bancos en todos los períodos. */
function Evolucion({ ranking, meta }) {
  const series = useApi(`/series${qs({ ranking })}`);
  const [metric, setMetric] = useState('Posicion');
  const [sel, setSel] = useState(null);
  const last = series.data?.at(-1)?.filas || [];
  const bancos = (sel ?? last.slice(0, 4).map((r) => r.Codigo_Banco)).slice(0, 4);
  const nombre = Object.fromEntries(meta.bancos.map((b) => [b.codigo, b.nombre]));
  const data = (series.data || []).map((p) => {
    const o = { fecha: fmtPeriodoCorto(p.fecha) };
    for (const r of p.filas) if (bancos.includes(r.Codigo_Banco)) o[r.Codigo_Banco] = r[metric];
    return o;
  });
  // Color por entidad: índice fijo del banco dentro del catálogo seleccionado, en el orden de selección
  const color = (c) => SERIES[bancos.indexOf(c)];
  return (
    <div className="card">
      <h2>Evolución · {fmtRanking(ranking)}</h2>
      <p className="sub">Compare hasta 4 entidades en todos los períodos cargados.</p>
      <div className="toolbar no-print" style={{ marginBottom: 8 }}>
        <MultiSelect label="Bancos (máx. 4)" options={meta.bancos.map((b) => ({ value: b.codigo, label: b.nombre }))} value={bancos} onChange={(v) => setSel(v.slice(0, 4))} placeholder="Top 4 actual" />
        <Select label="Métrica" value={metric} onChange={setMetric} options={[{ value: 'Posicion', label: 'Posición' }, { value: 'Saldo_Actividad', label: 'Saldo' }, { value: 'Ponderacion_Pct', label: 'Ponderación %' }]} />
      </div>
      <ErrorBox error={series.error} />
      <Legend items={bancos.map((c) => ({ label: nombre[c], color: color(c) }))} />
      <div className="chart" style={{ height: 260 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ left: 10, right: 20, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="fecha" axisLine={false} tickLine={false} />
            <YAxis reversed={metric === 'Posicion'} domain={metric === 'Posicion' ? [1, 12] : ['auto', 'auto']} allowDecimals={false}
              tickFormatter={metric === 'Saldo_Actividad' ? fmtCompact : undefined} axisLine={false} tickLine={false} width={60} />
            <Tooltip content={<ChartTooltip valueFormatter={(v) => (metric === 'Saldo_Actividad' ? fmtMoney(v) : metric === 'Ponderacion_Pct' ? fmtPct(v) : `#${v}`)} />} />
            {bancos.map((c) => <Line key={c} dataKey={c} name={nombre[c]} stroke={color(c)} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

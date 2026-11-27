import { useMemo, useState } from 'react';
import { usePublicarSeleccion } from '../asistenteContexto.js';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useApi, ErrorBox, Loading, SortableTable, ChartTooltip, Legend } from '../components/ui.jsx';
import { download, qs } from '../api.js';
import { fmtMoney, fmtMoneyCompact, fmtPct, fmtInt, fmtCorte, fmtRanking, sumMoney, SERIES } from '../format.js';

export default function Rankings({ ctx }) {
  const { meta, fecha } = ctx;
  const [ranking, setRanking] = useState(meta.rankings[0]);
  const [banco, setBanco] = useState('');
  const { data, error, loading } = useApi(`/periods/${fecha}/rankings?ranking=${ranking}`);
  const subs = useApi(`/periods/${fecha}/subactividades${qs({ rankings: [ranking] })}`);
  const rows = data?.[ranking] || [];
  const sel = banco || rows[0]?.Codigo_Banco;
  usePublicarSeleccion({ ranking, banco_codigo: sel || '', banco: rows.find((r) => r.Codigo_Banco === sel)?.Banco || '' });
  const selRow = rows.find((r) => r.Codigo_Banco === sel);
  const totalActividad = sumMoney(rows.map((r) => r.Saldo_Actividad));

  const subRows = useMemo(() => (subs.data || []).filter((s) => s.Codigo_Banco === sel), [subs.data, sel]);
  const chartData = rows.map((r) => ({ ...r, saldo: Number(r.Saldo_Actividad), label: `${r.Posicion}. ${r.Banco}` }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Consulta de rankings</h1>
          <p>Los bancos están ordenados de mayor a menor saldo. El primer lugar es el banco con mayor saldo en esta actividad.</p>
        </div>
        {ctx.puede('descargar_rankings') && <button className="btn" onClick={() => download(`/export/rankings.csv${qs({ fechas: [fecha], rankings: [ranking] })}`)}>Descargar CSV</button>}
      </div>

      <div className="toolbar">
        <div>
          <p className="cat-label">Categorías</p>
          <div className="tabs" role="tablist" aria-label="Categorías">
            {meta.rankings.map((r) => <button key={r} role="tab" aria-selected={r === ranking} className={r === ranking ? 'active' : ''} onClick={() => { setRanking(r); setBanco(''); }}>{fmtRanking(r)}</button>)}
          </div>
        </div>
      </div>

      <ErrorBox error={error} />
      {loading ? <Loading /> : (
        <div className="grid g2">
          <div className="card">
            <h2>{fmtRanking(ranking)} / {fmtCorte(fecha)}</h2>
            <p className="sub">Saldo de la actividad por banco. Elija una barra o una fila para ver su desglose.</p>
            <div className="chart tall">
              <ResponsiveContainer>
                <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }} barCategoryGap={2}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" tickFormatter={fmtMoneyCompact} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="label" width={170} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip valueFormatter={fmtMoney} />} />
                  <Bar dataKey="saldo" name="Saldo de la actividad" radius={[0, 4, 4, 0]} onClick={(d) => setBanco(d.Codigo_Banco)} cursor="pointer">
                    {chartData.map((d) => <Cell key={d.Codigo_Banco} fill={d.Codigo_Banco === sel ? 'var(--series-2)' : 'var(--series-1)'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <div className="card">
              <h2>Desglose por actividad</h2>
              <p className="sub">{selRow ? `${selRow.Banco} / puesto ${selRow.Posicion} / ${fmtPct(selRow.Ponderacion_Pct)} de su cartera` : ''}</p>
              {selRow && (
                <>
                  <SubBar rows={subRows} />
                  <SortableTable
                    rows={subRows}
                    rowKey={(r) => r.Subactividad}
                    columns={[
                      { key: 'Subactividad', label: 'Subactividad' },
                      { key: 'Saldo', label: 'Saldo', num: true, render: (r) => fmtMoney(r.Saldo) },
                      { key: 'pct', label: 'Parte del saldo', num: true, sortValue: (r) => Number(r.Saldo), render: (r) => fmtPct((Number(r.Saldo) / Number(selRow.Saldo_Actividad || 1)) * 100, 2) },
                      { key: 'Operaciones', label: 'Operaciones', num: true },
                    ]}
                  />
                  <p className="muted" style={{ fontSize: 12 }}>Suma de subactividades = {fmtMoney(sumMoney(subRows.map((s) => s.Saldo)))} / Saldo de la actividad = {fmtMoney(selRow.Saldo_Actividad)}</p>
                </>
              )}
            </div>
            <div className="card" style={{ marginTop: 16 }}>
              <h2>Total de la actividad</h2>
              <p className="sub">Suma de los saldos de los 12 bancos en esta actividad y corte. La ponderación se informa por banco, no para este total.</p>
              <p className="value" style={{ fontSize: 22, fontWeight: 700 }}>{fmtMoney(totalActividad)}</p>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Tabla del ranking</h2>
        <p className="sub">Ordene por cualquier columna haciendo clic en el encabezado.</p>
        <SortableTable
          rows={rows}
          rowKey={(r) => r.Codigo_Banco}
          selectedKey={sel}
          onRowClick={(r) => setBanco(r.Codigo_Banco)}
          initialSort={{ key: 'Posicion', dir: 1 }}
          columns={[
            { key: 'Posicion', label: 'Posición', num: true, render: (r) => <span className={`pos ${r.Posicion === 1 ? 'p1' : ''}`}>{r.Posicion}</span> },
            { key: 'Codigo_Banco', label: 'Código' },
            { key: 'Banco', label: 'Banco' },
            { key: 'Saldo_Actividad', label: 'Saldo de la actividad', num: true, render: (r) => fmtMoney(r.Saldo_Actividad) },
            { key: 'Total_Cartera_Local_Valida', label: 'Cartera local', num: true, render: (r) => fmtMoney(r.Total_Cartera_Local_Valida) },
            { key: 'Ponderacion_Pct', label: 'Ponderación', num: true, render: (r) => fmtPct(r.Ponderacion_Pct) },
            { key: 'Operaciones_Validas', label: 'Operaciones', num: true, render: (r) => fmtInt(r.Operaciones_Validas) },
          ]}
        />
      </div>
    </>
  );
}

function SubBar({ rows }) {
  const total = rows.reduce((a, r) => a + Number(r.Saldo), 0);
  if (!total) return <p className="muted">Este banco no tiene saldo en esta actividad.</p>;
  return (
    <div style={{ marginBottom: 12 }}>
      <Legend items={rows.map((r, i) => ({ label: r.Subactividad, color: SERIES[i] }))} />
      <div style={{ display: 'flex', gap: 2, height: 22, borderRadius: 4, overflow: 'hidden' }}>
        {rows.map((r, i) => Number(r.Saldo) > 0 && (
          <div key={r.Subactividad} title={`${r.Subactividad}: ${fmtMoney(r.Saldo)}`} style={{ flex: Number(r.Saldo), background: SERIES[i] }} />
        ))}
      </div>
    </div>
  );
}

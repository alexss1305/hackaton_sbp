import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useApi, ErrorBox, Loading, Kpi, ChartTooltip, SortableTable } from '../components/ui.jsx';
import { fmtMoney, fmtMoneyCompact, fmtInt, fmtCorte, fmtRanking, fmtPct } from '../format.js';

export default function Panel({ ctx }) {
  const { data, error, loading } = useApi(ctx.fecha ? `/periods/${ctx.fecha}/resumen` : null);
  const ranks = useApi(ctx.fecha ? `/periods/${ctx.fecha}/rankings` : null);
  if (error) return <ErrorBox error={error} />;
  if (loading || !data) return <Loading />;
  const q = data.quality;
  const conc = Object.fromEntries(data.indicadores.concentracion.map((c) => [c.Ranking, c]));
  const porBanco = new Map(data.carteraBancos.map((b) => [b.codigo, { ...b, lidera: [], posiciones: [] }]));
  if (ranks.data) {
    for (const [rk, rows] of Object.entries(ranks.data)) {
      for (const row of rows) {
        const b = porBanco.get(row.Codigo_Banco);
        if (!b) continue;
        b.posiciones.push(row);
        if (row.Posicion === 1) b.lidera.push(rk);
      }
    }
  }
  const bancos = [...porBanco.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Panel principal / {fmtCorte(ctx.fecha)}</h1>
          <p>Resumen de la cartera local válida y de los bancos que lideran cada actividad.</p>
        </div>
      </div>

      <div className="kpis">
        <Kpi label="Cartera local" value={fmtMoneyCompact(q.Saldo_Universo_Local_Valido)} hint={fmtMoney(q.Saldo_Universo_Local_Valido)} />
        <Kpi label="Bancos" value={data.carteraBancos.length} hint="Licencia general" />
        <Kpi label="Reconciliaciones" value={q.Reconciliacion_1 && q.Reconciliacion_2 && q.Reconciliacion_3 ? 'Cuadran' : 'Revisar'} hint="Al centavo" />
      </div>

      <div className="card">
        <h2>Bancos</h2>
        <p className="sub">Cada fila muestra el banco y las actividades en las que ocupa el puesto 1. Pase el cursor para ver su cartera, sus posiciones y su ponderación.</p>
        <div className="bank-list">
          {bancos.map((b) => (
            <div key={b.codigo} className="bank-row" tabIndex={0}>
              <b>{b.nombre}</b>
              <span>{b.lidera.length ? b.lidera.map(fmtRanking).join(' / ') : 'No lidera ninguna actividad en este corte'}</span>
              <div className="bank-detail">
                <p className="sub">Cartera local: {fmtMoney(b.cartera)}</p>
                <ul>
                  {b.posiciones.map((p) => (
                    <li key={p.Ranking}>
                      {fmtRanking(p.Ranking)}: puesto {p.Posicion}, saldo {fmtMoney(p.Saldo_Actividad)}, ponderación {fmtPct(p.Ponderacion_Pct)}
                      {conc[p.Ranking] ? ` / concentración ${fmtInt(Math.round(conc[p.Ranking].HHI))}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <h2>Cartera local por banco</h2>
          <p className="sub">Es el total de la cartera local válida de cada banco, el denominador de su ponderación.</p>
          <div className="chart tall">
            <ResponsiveContainer>
              <BarChart data={[...data.carteraBancos].sort((a, b) => b.cartera - a.cartera)} layout="vertical" margin={{ left: 10, right: 20 }} barCategoryGap={2}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" tickFormatter={fmtMoneyCompact} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="nombre" width={140} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip valueFormatter={fmtMoney} />} />
                <Bar dataKey="cartera" name="Cartera local" fill="var(--series-1)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <h2>Calidad de cartera por banco</h2>
          <p className="sub">Indicadores adicionales. La morosidad es el saldo de operaciones con días de mora mayores a cero. No entra en el ranking.</p>
          <SortableTable
            maxHeight={420}
            initialSort={{ key: 'Morosidad_Pct', dir: -1 }}
            rows={data.indicadores.bancos}
            rowKey={(r) => r.Codigo_Banco}
            columns={[
              { key: 'Banco', label: 'Banco' },
              { key: 'Saldo_Moroso', label: 'Saldo en mora', num: true, render: (r) => fmtMoney(r.Saldo_Moroso) },
              { key: 'Morosidad_Pct', label: 'Morosidad', num: true, render: (r) => fmtPct(r.Morosidad_Pct, 2) },
              { key: 'Vencido_Pct', label: 'Vencido / cartera', num: true, render: (r) => fmtPct(r.Vencido_Pct, 2) },
              { key: 'Tasa_Promedio_Ponderada', label: 'Tasa promedio', num: true, render: (r) => fmtPct(r.Tasa_Promedio_Ponderada, 2) },
            ]}
          />
        </div>
      </div>
    </>
  );
}

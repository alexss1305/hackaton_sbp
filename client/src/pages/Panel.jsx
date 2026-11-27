import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useApi, ErrorBox, Loading, Kpi, ChartTooltip, SortableTable } from '../components/ui.jsx';
import { fmtMoney, fmtInt, fmtCompact, fmtPeriodo, fmtRanking, fmtPct } from '../format.js';

export default function Panel({ ctx }) {
  const { data, error, loading } = useApi(ctx.fecha ? `/periods/${ctx.fecha}/resumen` : null);
  if (error) return <ErrorBox error={error} />;
  if (loading || !data) return <Loading />;
  const q = data.quality;
  const excluidas = q.Filas_Leidas - q.Universo_Local_Valido;
  const cartera = [...data.carteraBancos].sort((a, b) => b.cartera - a.cartera);
  const conc = Object.fromEntries(data.indicadores.concentracion.map((c) => [c.Ranking, c]));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Panel principal · {fmtPeriodo(ctx.fecha)}</h1>
          <p>Resumen del universo local válido y de los líderes de cada ranking de crédito por actividad económica.</p>
        </div>
      </div>

      <div className="kpis">
        <Kpi label="Cartera local válida" value={fmtCompact(q.Saldo_Universo_Local_Valido)} hint={fmtMoney(q.Saldo_Universo_Local_Valido)} />
        <Kpi label="Operaciones válidas" value={fmtInt(q.Universo_Local_Valido)} hint={`de ${fmtInt(q.Filas_Leidas)} filas leídas`} />
        <Kpi label="Filas excluidas (E1–E4)" value={fmtInt(excluidas)} hint={`${fmtPct((excluidas / q.Filas_Leidas) * 100, 2)} del archivo`} />
        <Kpi label="Bancos" value={data.carteraBancos.length} hint="Licencia general" />
        <Kpi label="Reconciliaciones" value={q.Reconciliacion_1 && q.Reconciliacion_2 && q.Reconciliacion_3 ? '✓ Cuadran' : '✕ Revisar'} hint="Al centavo" />
      </div>

      <div className="card">
        <h2>Líderes por ranking</h2>
        <p className="sub">Banco en la posición 1 de cada actividad. HHI = índice de concentración (0–10 000).</p>
        <div className="grid g3">
          {data.lideres.map((l) => (
            <button key={l.ranking} className="kpi" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => ctx.goTo('rankings')}>
              <div className="label">{fmtRanking(l.ranking)}</div>
              <div className="value" style={{ fontSize: 18 }}>{l.Banco}</div>
              <div className="hint">{fmtMoney(l.Saldo_Actividad)} · {fmtPct((Number(l.Saldo_Actividad) / l.total) * 100, 1)} del ranking</div>
              <div className="hint">Mercado {fmtCompact(l.total)} · HHI {fmtInt(Math.round(conc[l.ranking]?.HHI ?? 0))}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <h2>Cartera local válida por banco</h2>
          <p className="sub">Total_Cartera_Local_Valida: denominador de la ponderación de cada banco.</p>
          <div className="chart tall">
            <ResponsiveContainer>
              <BarChart data={cartera} layout="vertical" margin={{ left: 10, right: 20 }} barCategoryGap={2}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" tickFormatter={fmtCompact} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="nombre" width={140} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip valueFormatter={fmtMoney} />} />
                <Bar dataKey="cartera" name="Cartera válida" fill="var(--series-1)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <h2>Calidad de cartera por banco</h2>
          <p className="sub">Indicadores adicionales (no intervienen en los rankings): morosidad = saldo con Dias_Mora &gt; 0.</p>
          <SortableTable
            maxHeight={420}
            initialSort={{ key: 'Morosidad_Pct', dir: -1 }}
            rows={data.indicadores.bancos}
            rowKey={(r) => r.Codigo_Banco}
            columns={[
              { key: 'Banco', label: 'Banco' },
              { key: 'Morosidad_Pct', label: 'Morosidad', num: true, render: (r) => fmtPct(r.Morosidad_Pct, 2) },
              { key: 'Vencido_Pct', label: 'Vencido / cartera', num: true, render: (r) => fmtPct(r.Vencido_Pct, 2) },
              { key: 'Tasa_Promedio_Ponderada', label: 'Tasa prom.', num: true, render: (r) => fmtPct(r.Tasa_Promedio_Ponderada, 2) },
              { key: 'Operaciones', label: 'Operaciones', num: true, render: (r) => fmtInt(r.Operaciones) },
            ]}
          />
        </div>
      </div>
    </>
  );
}

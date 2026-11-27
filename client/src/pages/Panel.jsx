import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useApi, ErrorBox, Loading, Kpi, ChartTooltip } from '../components/ui.jsx';
import { Icon } from '../components/brand.jsx';
import BancoCard from '../components/BancoCard.jsx';
import BancoFicha, { semaforo } from '../components/BancoFicha.jsx';
import { fmtMoney, fmtMoneyCompact, fmtInt, fmtCorte, fmtMes, fmtPct } from '../format.js';

export default function Panel({ ctx }) {
  const { data, error, loading } = useApi(ctx.fecha ? `/periods/${ctx.fecha}/resumen` : null);
  const lista = useApi(ctx.fecha ? `/bancos?fecha=${ctx.fecha}` : null);
  const [abierto, setAbierto] = useState(null);
  if (error) return <ErrorBox error={error} />;
  if (loading || !data) return <Loading />;
  const q = data.quality;
  const bancos = lista.data?.bancos || [];
  const ind = data.indicadores.bancos;
  const promedioMorosidad = ind.length ? ind.reduce((a, b) => a + b.Morosidad_Pct * b.Cartera, 0) / ind.reduce((a, b) => a + b.Cartera, 0) : null;
  const sistemaAnt = bancos.length && bancos[0].carteraAnterior !== null ? bancos.reduce((a, b) => a + Number(b.carteraAnterior), 0) : null;
  const varSistema = sistemaAnt ? ((Number(q.Saldo_Universo_Local_Valido) - sistemaAnt) / sistemaAnt) * 100 : null;
  const verificado = q.Reconciliacion_1 && q.Reconciliacion_2 && q.Reconciliacion_3 && q.Cuadre_Cascada;
  const maxMor = Math.max(...ind.map((b) => b.Morosidad_Pct), 1);
  const maxVen = Math.max(...ind.map((b) => b.Vencido_Pct), 1);
  const maxTasa = Math.max(...ind.map((b) => b.Tasa_Promedio_Ponderada), 1);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Panel principal / {fmtCorte(ctx.fecha)}</h1>
          <p>Resumen de la cartera local válida y de cada banco. Haga clic en un banco para ver su ficha completa.</p>
        </div>
        <button type="button" className="verif" onClick={() => ctx.goTo('calidad')} title="Totales conciliados y conteos de exclusión cuadrados. Ver detalle en Calidad de datos.">
          <Icon name={verificado ? 'check' : 'info'} />{verificado ? 'Datos verificados' : 'Revisar calidad de datos'}
        </button>
      </div>

      <div className="kpis">
        <Kpi label="Cartera local válida" value={fmtMoneyCompact(q.Saldo_Universo_Local_Valido)} hint={fmtMoney(q.Saldo_Universo_Local_Valido)} />
        <Kpi label="Variación del sistema" value={varSistema === null ? '—' : `${varSistema >= 0 ? '+' : ''}${varSistema.toFixed(2)}%`}
          hint={lista.data?.fechaAnterior ? `frente a ${fmtMes(lista.data.fechaAnterior)}` : 'Primer corte cargado'} />
        <Kpi label="Operaciones válidas" value={fmtInt(q.Universo_Local_Valido)} hint={`de ${fmtInt(q.Filas_Leidas)} filas del archivo`} />
        <Kpi label="Morosidad del sistema" value={fmtPct(promedioMorosidad, 2)} hint="% de la cartera con pagos atrasados" />
      </div>

      <div className="card">
        <h2>Bancos</h2>
        <p className="sub">Cartera, variación frente al corte anterior, puesto en cada ranking (dorado = lidera) y morosidad frente al promedio del sistema.</p>
        <ErrorBox error={lista.error} />
        {lista.loading ? <Loading /> : (
          <div className="bk-grid">
            {bancos.map((b, i) => <BancoCard key={b.codigo} b={b} promedioMorosidad={promedioMorosidad} onOpen={setAbierto} style={{ animationDelay: `${i * 30}ms` }} />)}
          </div>
        )}
      </div>

      <div className="grid g2">
        <div className="card">
          <h2>Cartera local por banco</h2>
          <p className="sub">Total de la cartera local válida de cada banco (denominador de su ponderación). Haga clic en una barra para abrir la ficha.</p>
          <div className="chart tall">
            <ResponsiveContainer>
              <BarChart data={[...data.carteraBancos].sort((a, b) => b.cartera - a.cartera)} layout="vertical" margin={{ left: 10, right: 20 }} barCategoryGap={2}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" tickFormatter={fmtMoneyCompact} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="nombre" width={140} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip valueFormatter={fmtMoney} />} />
                <Bar dataKey="cartera" name="Cartera local" fill="var(--series-1)" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(d) => setAbierto(d.codigo)} animationDuration={700} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <h2>Calidad de cartera por banco</h2>
          <p className="sub">Morosidad: % de la cartera con pagos atrasados. Vencido: cuotas impagas sobre la cartera. No intervienen en el ranking. El color compara con el promedio del sistema ({fmtPct(promedioMorosidad, 2)}).</p>
          <div className="qc-list">
            {[...ind].sort((a, b) => b.Morosidad_Pct - a.Morosidad_Pct).map((b) => {
              const s = semaforo(b.Morosidad_Pct, promedioMorosidad);
              return (
                <button type="button" key={b.Codigo_Banco} className="qc-row" onClick={() => setAbierto(b.Codigo_Banco)} title={`${b.Banco}: ${s.label}. Clic para ver la ficha.`}>
                  <i className={`sem ${s.cls}`} />
                  <b>{b.Banco}</b>
                  <div className="qc-bars">
                    <div className="qc-bar">Morosidad<div><i style={{ width: `${(b.Morosidad_Pct / maxMor) * 100}%`, background: 'var(--down)' }} /></div></div>
                    <div className="qc-bar">Vencido<div><i style={{ width: `${(b.Vencido_Pct / maxVen) * 100}%`, background: 'var(--gold)' }} /></div></div>
                    <div className="qc-bar">Tasa {fmtPct(b.Tasa_Promedio_Ponderada, 1)}<div><i style={{ width: `${(b.Tasa_Promedio_Ponderada / maxTasa) * 100}%`, background: 'var(--series-1)' }} /></div></div>
                  </div>
                  <span className="qc-val">{fmtPct(b.Morosidad_Pct, 2)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {abierto && <BancoFicha codigo={abierto} fecha={ctx.fecha} promedioMorosidad={promedioMorosidad} onClose={() => setAbierto(null)} />}
    </>
  );
}

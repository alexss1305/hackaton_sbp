/**
 * Secciones del reporte ejecutivo. Reglas (ver .claude/skills/reportes-visuales/SKILL.md):
 * - Los valores oficiales vienen de la API tal cual; aquí solo se formatean y se ordenan.
 * - Gráficos con ancho fijo (REPORT_W) para que la impresión/PDF no se deforme.
 * - 12 bancos = un solo tono; los bancos destacados usan --series-2. Categorías (≤ 6) en orden fijo.
 */
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList, ReferenceLine } from 'recharts';
import { ChartTooltip, Legend } from '../ui.jsx';
import { fmtMoney, fmtCompact, fmtInt, fmtPct, fmtPeriodo, fmtRanking, SERIES } from '../../format.js';

export const REPORT_W = 700;

/** Rampa secuencial (azul, claro→oscuro) para mapas de calor. */
const SEQ = ['#cce3fd', '#b6d5f8', '#9dc8f7', '#84b9f3', '#6aabf1', '#519ced', '#338ced', '#257de0', '#2370cd', '#1b64be', '#1757ac', '#0f4a96', '#0e3d7e'];
const seqColor = (v, max) => {
  if (!max || v <= 0) return { bg: 'transparent', fg: 'var(--text-secondary)' };
  const i = Math.min(SEQ.length - 1, Math.floor((v / max) * (SEQ.length - 1)));
  return { bg: SEQ[i], fg: i >= 7 ? '#fff' : '#191919' };
};

export function Section({ n, title, subtitle, children }) {
  return (
    <section className="r-section">
      <h2><span className="r-num">{n}</span>{title}</h2>
      {subtitle && <p className="r-sub">{subtitle}</p>}
      {children}
    </section>
  );
}

export function ReportHeader({ titulo, fecha, desde, perfil, fuente }) {
  return (
    <header className="r-header">
      <div className="r-brand">
        <div>
          <div className="r-kicker">Hackathon SBP 2026 · Rankings de crédito por actividad económica</div>
          <h1>{titulo}</h1>
          <div className="r-meta">
            Período: <b>{fmtPeriodo(fecha)}</b> (Fecha {fecha}){desde ? <> · Comparado con <b>{fmtPeriodo(desde)}</b></> : null}
            {' '}· Generado: {new Date().toLocaleString('es-PA')} · Perfil: {perfil}
          </div>
        </div>
        <div className="r-stamp">DATOS<br />FICTICIOS</div>
      </div>
      <p className="r-disclaimer">{fuente}</p>
    </header>
  );
}

export function KpiSection({ n, resumen }) {
  const q = resumen.quality;
  const items = [
    ['Cartera local válida', fmtCompact(q.Saldo_Universo_Local_Valido), fmtMoney(q.Saldo_Universo_Local_Valido)],
    ['Operaciones válidas', fmtInt(q.Universo_Local_Valido), `de ${fmtInt(q.Filas_Leidas)} filas leídas`],
    ['Filas excluidas', fmtInt(q.Filas_Leidas - q.Universo_Local_Valido), 'E1 a E4 en cascada'],
    ['Reconciliaciones', q.Reconciliacion_1 && q.Reconciliacion_2 && q.Reconciliacion_3 ? 'Cuadran' : 'Revisar', 'R1 · R2 · R3 al centavo'],
  ];
  return (
    <Section n={n} title="Resumen del período">
      <div className="r-kpis">
        {items.map(([l, v, h]) => <div key={l} className="r-kpi"><span>{l}</span><b>{v}</b><small>{h}</small></div>)}
      </div>
    </Section>
  );
}

export function LideresSection({ n, resumen, rankings }) {
  const conc = Object.fromEntries(resumen.indicadores.concentracion.map((c) => [c.Ranking, c]));
  const lideres = resumen.lideres.filter((l) => rankings.includes(l.ranking));
  return (
    <Section n={n} title="Líderes por ranking" subtitle="Banco en la posición 1, su participación en el ranking y la concentración del mercado (HHI: < 1 500 baja, 1 500–2 500 moderada, > 2 500 alta).">
      <table className="r-table">
        <thead><tr><th>Ranking</th><th>Líder</th><th className="num">Saldo</th><th className="num">Participación</th><th className="num">Top 3</th><th className="num">HHI</th></tr></thead>
        <tbody>
          {lideres.map((l) => (
            <tr key={l.ranking}>
              <td><b>{fmtRanking(l.ranking)}</b></td>
              <td>{l.Banco}</td>
              <td className="num">{fmtMoney(l.Saldo_Actividad)}</td>
              <td className="num"><ShareBar pct={(Number(l.Saldo_Actividad) / l.total) * 100} /></td>
              <td className="num">{fmtPct(conc[l.ranking]?.Top3_Pct, 1)}</td>
              <td className="num">{fmtInt(Math.round(conc[l.ranking]?.HHI ?? 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function ShareBar({ pct }) {
  return (
    <span className="r-share">
      <span className="r-share-track"><span style={{ width: `${Math.min(100, pct)}%` }} /></span>
      {fmtPct(pct, 1)}
    </span>
  );
}

/** Mapa de calor: Ponderacion_Pct de cada banco (filas) en cada ranking (columnas). */
export function HeatmapSection({ n, rankingsData, rankings, bancos, destacados }) {
  const rows = bancos.map((b) => ({
    ...b,
    vals: rankings.map((r) => Number(rankingsData[r]?.find((x) => x.Codigo_Banco === b.codigo)?.Ponderacion_Pct ?? 0)),
  }));
  const max = Math.max(...rows.flatMap((r) => r.vals));
  return (
    <Section n={n} title="Perfil de cartera por banco" subtitle="Ponderación (% de la cartera local válida de cada banco destinada a cada actividad). Más oscuro = mayor peso.">
      <table className="r-table r-heat">
        <thead><tr><th>Banco</th>{rankings.map((r) => <th key={r} className="num">{fmtRanking(r)}</th>)}</tr></thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.codigo} className={destacados.includes(b.codigo) ? 'r-hl' : ''}>
              <td>{b.nombre}</td>
              {b.vals.map((v, i) => { const c = seqColor(v, max); return <td key={rankings[i]} className="num" style={{ background: c.bg, color: c.fg }}>{v.toFixed(2)}%</td>; })}
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

/** Ranking: barras horizontales (un tono, destacados en naranja) + tabla compacta + composición del mercado por subactividad. */
export function RankingSection({ n, ranking, rows, subs, subactividades, destacados, topN }) {
  const data = rows.map((r) => ({ ...r, saldo: Number(r.Saldo_Actividad), label: `${r.Posicion}. ${r.Banco}` }));
  const total = data.reduce((a, r) => a + r.saldo, 0);
  const visibles = rows.filter((r) => r.Posicion <= topN || destacados.includes(r.Codigo_Banco));
  const mercado = subactividades.map((s, i) => ({
    s, color: SERIES[i % SERIES.length],
    v: subs.filter((x) => x.Subactividad === s).reduce((a, x) => a + Number(x.Saldo), 0),
  }));
  return (
    <Section n={n} title={`Ranking ${fmtRanking(ranking)}`} subtitle={`Mercado total: ${fmtMoney(total)} · ${rows.filter((r) => Number(r.Saldo_Actividad) > 0).length} bancos con saldo`}>
      <BarChart width={REPORT_W} height={24 * data.length + 30} data={data} layout="vertical" margin={{ left: 0, right: 70, top: 4 }} barCategoryGap={3}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickFormatter={fmtCompact} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="label" width={170} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltip valueFormatter={fmtMoney} />} />
        <Bar dataKey="saldo" name="Saldo de la actividad" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {data.map((d) => <Cell key={d.Codigo_Banco} fill={destacados.includes(d.Codigo_Banco) ? 'var(--series-2)' : 'var(--series-1)'} />)}
          <LabelList dataKey="saldo" position="right" formatter={fmtCompact} className="r-barlabel" />
        </Bar>
      </BarChart>

      <div className="r-composition">
        <div className="r-label">Composición del mercado por subactividad</div>
        <div className="r-stack">
          {mercado.filter((m) => m.v > 0).map((m) => <span key={m.s} title={`${m.s}: ${fmtMoney(m.v)}`} style={{ flex: m.v, background: m.color }} />)}
        </div>
        <Legend items={mercado.map((m) => ({ label: `${m.s} ${fmtPct(total ? (m.v / total) * 100 : 0, 1)}`, color: m.color }))} />
      </div>

      <table className="r-table">
        <thead><tr><th className="num">Pos.</th><th>Banco</th><th className="num">Saldo actividad</th><th className="num">Cartera total</th><th className="num">Ponderación</th><th className="num">Operaciones</th></tr></thead>
        <tbody>
          {visibles.map((r) => (
            <tr key={r.Codigo_Banco} className={destacados.includes(r.Codigo_Banco) ? 'r-hl' : ''}>
              <td className="num"><b>{r.Posicion}</b></td><td>{r.Banco}</td>
              <td className="num">{fmtMoney(r.Saldo_Actividad)}</td><td className="num">{fmtMoney(r.Total_Cartera_Local_Valida)}</td>
              <td className="num">{fmtPct(r.Ponderacion_Pct)}</td><td className="num">{fmtInt(r.Operaciones_Validas)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {visibles.length < rows.length && <p className="r-foot">Se muestran los {topN} primeros{destacados.length ? ' y los bancos destacados' : ''}. El ranking completo de 12 bancos está en la exportación CSV.</p>}
    </Section>
  );
}

/** Movimientos: explicación automática + gráfico divergente de cambio de posición por ranking. */
export function MovimientosSection({ n, cmp, rankings, destacados, params }) {
  const movs = cmp.movimientos.filter((m) => rankings.includes(m.Ranking));
  const sig = movs.filter((m) => m.Significativo)
    .sort((a, b) => Math.abs(b.Cambio_Posicion ?? 0) - Math.abs(a.Cambio_Posicion ?? 0) || Math.abs(Number(b.Var_Saldo_Pct ?? 0)) - Math.abs(Number(a.Var_Saldo_Pct ?? 0)));
  const porRanking = rankings.map((r) => ({
    ranking: fmtRanking(r),
    sube: movs.filter((m) => m.Ranking === r && m.Cambio_Posicion > 0).length,
    baja: -movs.filter((m) => m.Ranking === r && m.Cambio_Posicion < 0).length,
  }));
  return (
    <Section n={n} title={`Movimientos: ${fmtPeriodo(cmp.desde)} → ${fmtPeriodo(cmp.hasta)}`}
      subtitle={`Regla de significancia: |cambio de posición| ≥ ${params.minCambioPosicion}${params.cambioLider ? ', cambio de líder' : ''}${params.umbralVarSaldoPct ? `, |variación de saldo| ≥ ${params.umbralVarSaldoPct}%` : ''}. ${sig.length} movimientos significativos.`}>
      <div className="r-label">Bancos que suben y bajan por ranking</div>
      <BarChart width={REPORT_W} height={40 + 28 * porRanking.length} data={porRanking} layout="vertical" stackOffset="sign" margin={{ left: 0, right: 20 }} barCategoryGap={4}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" allowDecimals={false} tickFormatter={(v) => Math.abs(v)} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="ranking" width={110} axisLine={false} tickLine={false} />
        <ReferenceLine x={0} stroke="var(--neutral)" />
        <Tooltip content={<ChartTooltip valueFormatter={(v) => Math.abs(v)} />} />
        <Bar dataKey="sube" name="Suben" stackId="m" fill="var(--up)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
        <Bar dataKey="baja" name="Bajan" stackId="m" fill="var(--down)" radius={[4, 0, 0, 4]} isAnimationActive={false} />
      </BarChart>
      <Legend items={[{ label: 'Suben', color: 'var(--up)' }, { label: 'Bajan', color: 'var(--down)' }]} />
      {sig.length === 0 ? <p className="r-foot">No hay movimientos significativos con la regla vigente.</p> : (
        <ol className="r-explain">
          {sig.slice(0, 10).map((m) => (
            <li key={m.Ranking + m.Codigo_Banco} className={`${(m.Cambio_Posicion ?? 0) < 0 ? 'neg' : 'r-up'} ${destacados.includes(m.Codigo_Banco) ? 'r-hl' : ''}`}>
              <span className="r-tag">{fmtRanking(m.Ranking)} · {m.Motivo_Significativo}</span>
              {m.Explicacion}
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

/** Calidad: embudo de la cascada E1–E4 y estado de las reconciliaciones. */
export function CalidadSection({ n, q }) {
  const steps = [
    ['Filas leídas', q.Filas_Leidas, null],
    ['E1 Duplicados', q.E1_Duplicados, 'Numero_Prestamo repetido'],
    ['E2 Destino extranjero', q.E2_Destino_Extranjero, "Destino <> 'L'"],
    ['E3 Saldo no positivo', q.E3_Saldo_No_Positivo, 'Saldo <= 0'],
    ['E4 Actividad no catalogada', q.E4_Actividad_No_Catalogada, 'CINU fuera del catálogo'],
  ];
  let quedan = q.Filas_Leidas;
  const funnel = steps.map(([l, v], i) => { if (i > 0) quedan -= v; return { l, v, quedan }; });
  const excluidas = q.Filas_Leidas - q.Universo_Local_Valido;
  const maxExcl = Math.max(...funnel.slice(1).map((f) => f.v), 1);
  return (
    <Section n={n} title="Calidad de datos" subtitle={`Exclusiones en cascada: cada fila se cuenta una sola vez, en el primer filtro que incumple. Se excluyó el ${fmtPct((excluidas / q.Filas_Leidas) * 100, 2)} de las filas; las barras comparan cada filtro con el mayor.`}>
      <div className="r-funnel">
        <div className="r-funnel-row r-head"><span /><span>Filas excluidas por filtro</span><span className="num">Excluidas</span><span className="num">Quedan</span></div>
        {funnel.map((f, i) => (
          <div key={f.l} className="r-funnel-row">
            <span className="r-funnel-l">{f.l}{steps[i][2] && <small>{steps[i][2]}</small>}</span>
            {i === 0 ? <span className="muted">Punto de partida</span> : <span className="r-funnel-bar"><span style={{ width: `${(f.v / maxExcl) * 100}%` }} /></span>}
            <span className="num">{i === 0 ? '' : fmtInt(f.v)}</span>
            <span className="num muted">{fmtInt(f.quedan)}</span>
          </div>
        ))}
        <div className="r-funnel-row r-total">
          <span className="r-funnel-l">Universo local válido</span><span className="muted">{fmtPct((q.Universo_Local_Valido / q.Filas_Leidas) * 100, 2)} de las filas leídas</span><span className="num">{fmtInt(excluidas)}</span><span className="num"><b>{fmtInt(q.Universo_Local_Valido)}</b></span>
        </div>
      </div>
      <div className="r-checks">
        {[['Cascada cuadra', q.Cuadre_Cascada], ['Préstamos únicos', q.Prestamos_Unicos_En_Universo], ['R1 subactividades = actividad', q.Reconciliacion_1], ['R2 actividades = cartera', q.Reconciliacion_2], ['R3 bancos = universo', q.Reconciliacion_3]].map(([l, ok]) => (
          <span key={l} className={`r-check ${ok ? 'ok' : 'bad'}`}>{ok ? '✓' : '✕'} {l}</span>
        ))}
        <span className="r-check">{fmtInt(q.Reclasificadas_Tarjeta_SB21)} reclasificadas a Tarjeta (SB21)</span>
      </div>
    </Section>
  );
}

/** Indicadores adicionales: morosidad por banco (un tono) y tasa promedio. */
export function IndicadoresSection({ n, indicadores, destacados }) {
  const data = [...indicadores.bancos].sort((a, b) => b.Morosidad_Pct - a.Morosidad_Pct);
  return (
    <Section n={n} title="Indicadores complementarios" subtitle="Morosidad = saldo con días de mora > 0 sobre la cartera válida. No intervienen en los rankings.">
      <BarChart width={REPORT_W} height={24 * data.length + 30} data={data} layout="vertical" margin={{ left: 0, right: 60, top: 4 }} barCategoryGap={3}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="Banco" width={170} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltip valueFormatter={(v) => fmtPct(v, 2)} />} />
        <Bar dataKey="Morosidad_Pct" name="Morosidad" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {data.map((d) => <Cell key={d.Codigo_Banco} fill={destacados.includes(d.Codigo_Banco) ? 'var(--series-2)' : 'var(--series-1)'} />)}
          <LabelList dataKey="Morosidad_Pct" position="right" formatter={(v) => fmtPct(v, 2)} className="r-barlabel" />
        </Bar>
      </BarChart>
    </Section>
  );
}

export function NotaMetodologica({ n }) {
  return (
    <Section n={n} title="Nota metodológica">
      <ul className="r-notes">
        <li>Fuente: archivos AT03 sintéticos y catálogos CINU/SB109, SB21 y bancos suministrados por la SBP. El período se toma del campo Fecha.</li>
        <li>Universo local válido: filas que superan E1 (duplicados), E2 (Destino = L), E3 (Saldo &gt; 0) y E4 (actividad catalogada), en cascada.</li>
        <li>Posición por saldo de la actividad descendente; empate por código de banco. Ponderación = saldo de la actividad / cartera local válida total del banco, redondeada a 4 decimales.</li>
        <li>CONSUMO: crédito personal con facilidad 07 se reclasifica a Tarjeta (SB21) sin alterar el total de la actividad.</li>
        <li>Todos los cálculos son deterministas y se realizan con aritmética exacta. Uso informativo; no constituye opinión formal de la SBP.</li>
      </ul>
    </Section>
  );
}

import { useEffect, useState } from 'react';
import { api, download, qs } from '../api.js';
import { ErrorBox, Loading, MultiSelect, Select } from '../components/ui.jsx';
import { fmtPeriodo, fmtRanking } from '../format.js';
import {
  ReportHeader, KpiSection, LideresSection, HeatmapSection, RankingSection,
  MovimientosSection, CalidadSection, IndicadoresSection, NotaMetodologica,
} from '../components/report/sections.jsx';

/** Secciones disponibles; `min` = nivel de perfil requerido (1 público, 2 analista). */
const SECCIONES = [
  { id: 'kpis', label: 'Resumen del período', min: 1 },
  { id: 'lideres', label: 'Líderes y concentración', min: 1 },
  { id: 'heatmap', label: 'Perfil de cartera (mapa de calor)', min: 1 },
  { id: 'rankings', label: 'Rankings con gráfico y composición', min: 1 },
  { id: 'movimientos', label: 'Movimientos y explicación automática', min: 2 },
  { id: 'calidad', label: 'Calidad de datos y reconciliaciones', min: 1 },
  { id: 'indicadores', label: 'Indicadores complementarios (morosidad)', min: 1 },
  { id: 'nota', label: 'Nota metodológica', min: 1 },
];

const PLANTILLAS = {
  ejecutivo: { label: 'Reporte ejecutivo', titulo: 'Reporte ejecutivo de rankings de crédito', secciones: ['kpis', 'lideres', 'heatmap', 'movimientos', 'calidad', 'nota'], topN: 5 },
  rankings: { label: 'Rankings detallados', titulo: 'Rankings de crédito por actividad económica', secciones: ['kpis', 'rankings', 'nota'], topN: 12 },
  comparacion: { label: 'Comparación de períodos', titulo: 'Movimientos de posición entre períodos', secciones: ['kpis', 'movimientos', 'heatmap', 'nota'], topN: 5, min: 2 },
  calidad: { label: 'Calidad de datos', titulo: 'Reporte de calidad de datos AT03', secciones: ['kpis', 'calidad', 'indicadores', 'nota'], topN: 5 },
};

export default function Reportes({ ctx }) {
  const { meta, nivel, fecha: fechaGlobal } = ctx;
  const fechas = meta.periodos.map((p) => p.fecha);
  const perfilNombre = { 1: 'Público', 2: 'Analista', 3: 'Administrador' }[nivel];

  const [plantilla, setPlantilla] = useState('ejecutivo');
  const [titulo, setTitulo] = useState(PLANTILLAS.ejecutivo.titulo);
  const [secciones, setSecciones] = useState(PLANTILLAS.ejecutivo.secciones);
  const [fecha, setFecha] = useState(fechaGlobal);
  const [desde, setDesde] = useState(fechas[fechas.indexOf(fechaGlobal) - 1] || '');
  const [rankings, setRankings] = useState([]);
  const [destacados, setDestacados] = useState([]);
  const [topN, setTopN] = useState(5);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const aplicarPlantilla = (k) => {
    const p = PLANTILLAS[k];
    setPlantilla(k); setTitulo(p.titulo); setSecciones(p.secciones); setTopN(p.topN);
  };
  const permitidas = SECCIONES.filter((s) => nivel >= s.min);
  const activas = permitidas.filter((s) => secciones.includes(s.id)).map((s) => s.id);
  const rks = rankings.length ? meta.rankings.filter((r) => rankings.includes(r)) : meta.rankings;
  const conMovs = activas.includes('movimientos') && desde && desde !== fecha;

  useEffect(() => {
    let alive = true;
    setError(null);
    Promise.all([
      api(`/periods/${fecha}/resumen`),
      api(`/periods/${fecha}/rankings`),
      api(`/periods/${fecha}/subactividades`),
      conMovs ? api(`/compare${qs({ desde, hasta: fecha })}`) : Promise.resolve(null),
    ]).then(([resumen, rankingsData, subs, cmp]) => alive && setData({ resumen, rankingsData, subs, cmp, fecha }))
      .catch((e) => alive && setError(e));
    return () => { alive = false; };
  }, [fecha, desde, conMovs]);

  const ready = data && data.fecha === fecha;
  const secs = (() => {
    if (!ready) return [];
    const out = [];
    let n = 0;
    const next = () => ++n;
    for (const id of activas) {
      if (id === 'kpis') out.push(<KpiSection key={id} n={next()} resumen={data.resumen} />);
      if (id === 'lideres') out.push(<LideresSection key={id} n={next()} resumen={data.resumen} rankings={rks} />);
      if (id === 'heatmap') out.push(<HeatmapSection key={id} n={next()} rankingsData={data.rankingsData} rankings={rks} bancos={meta.bancos} destacados={destacados} />);
      if (id === 'rankings') {
        for (const r of rks) {
          out.push(<RankingSection key={`rk-${r}`} n={next()} ranking={r} rows={data.rankingsData[r]} subs={data.subs.filter((s) => s.Ranking === r)}
            subactividades={meta.subactividades[r]} destacados={destacados} topN={topN} />);
        }
      }
      if (id === 'movimientos' && data.cmp) out.push(<MovimientosSection key={id} n={next()} cmp={data.cmp} rankings={rks} destacados={destacados} params={data.cmp.params} />);
      if (id === 'calidad') out.push(<CalidadSection key={id} n={next()} q={data.resumen.quality} />);
      if (id === 'indicadores') out.push(<IndicadoresSection key={id} n={next()} indicadores={data.resumen.indicadores} destacados={destacados} />);
      if (id === 'nota') out.push(<NotaMetodologica key={id} n={next()} />);
    }
    return out;
  })();

  const run = (path) => { setError(null); download(path).catch(setError); };
  const toggleSec = (id) => setSecciones((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <>
      <div className="page-head no-print">
        <div>
          <h1>Reportes</h1>
          <p>Arme un reporte con plantillas o eligiendo secciones, revise la vista previa y descárguelo como PDF. Los datos oficiales también se descargan en CSV.</p>
        </div>
        <button className="btn primary" onClick={() => window.print()} disabled={!ready}>🖨 Descargar PDF / Imprimir</button>
      </div>
      <ErrorBox error={error} />

      <div className="report-layout">
        <aside className="card report-builder no-print">
          <h3>1. Plantilla</h3>
          <div className="tpl-grid">
            {Object.entries(PLANTILLAS).filter(([, p]) => nivel >= (p.min || 1)).map(([k, p]) => (
              <button key={k} className={`tpl ${plantilla === k ? 'on' : ''}`} onClick={() => aplicarPlantilla(k)}>{p.label}</button>
            ))}
          </div>

          <h3>2. Contenido</h3>
          <label className="field">Título<input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} /></label>
          <Select label="Período" value={fecha} onChange={(f) => { setFecha(f); setDesde(fechas[fechas.indexOf(f) - 1] || ''); }} options={fechas.map((f) => ({ value: f, label: fmtPeriodo(f) }))} />
          {nivel >= 2 && (
            <Select label="Comparar contra" value={desde} onChange={setDesde}
              options={[{ value: '', label: 'Sin comparación' }, ...fechas.filter((f) => f !== fecha).map((f) => ({ value: f, label: fmtPeriodo(f) }))]} />
          )}
          <MultiSelect label="Rankings" options={meta.rankings.map((r) => ({ value: r, label: fmtRanking(r) }))} value={rankings} onChange={setRankings} placeholder="Los 6 rankings" />
          <MultiSelect label="Bancos a destacar" options={meta.bancos.map((b) => ({ value: b.codigo, label: b.nombre }))} value={destacados} onChange={setDestacados} placeholder="Ninguno" />
          <Select label="Filas por tabla de ranking" value={String(topN)} onChange={(v) => setTopN(Number(v))} options={[3, 5, 10, 12].map((v) => ({ value: String(v), label: v === 12 ? 'Los 12 bancos' : `Top ${v}` }))} />

          <h3>3. Secciones</h3>
          <div className="sec-list">
            {SECCIONES.map((s) => (
              <label key={s.id} className={nivel < s.min ? 'disabled' : ''} title={nivel < s.min ? 'Disponible para Analista' : ''}>
                <input type="checkbox" disabled={nivel < s.min} checked={activas.includes(s.id)} onChange={() => toggleSec(s.id)} />
                {s.label}{nivel < s.min && <small> · Analista</small>}
              </label>
            ))}
          </div>
          {activas.includes('movimientos') && !conMovs && <p className="muted" style={{ fontSize: 12 }}>Elija un período de comparación para incluir los movimientos.</p>}

          <details className="downloads">
            <summary>Datos oficiales en CSV</summary>
            <div className="dl-list">
              <button className="btn" onClick={() => run(`/export/rankings.csv${qs({ fechas: [fecha], rankings, bancos: [] })}`)}>⬇ Rankings ({fmtPeriodo(fecha)})</button>
              <button className="btn" onClick={() => run(`/export/subactividades.csv${qs({ fechas: [fecha], rankings })}`)}>⬇ Subactividades</button>
              <button className="btn" onClick={() => run('/export/calidad.csv')}>⬇ Calidad (todos los períodos)</button>
              <button className="btn" onClick={() => run('/export/rankings.csv')}>⬇ Rankings (todos los períodos)</button>
              {nivel >= 2 && <>
                <button className="btn" onClick={() => run('/export/movimientos.csv')}>⬇ Movimientos (todos)</button>
                <button className="btn" onClick={() => run('/export/excluidas.csv')}>⬇ Filas excluidas</button>
                <button className="btn" onClick={() => run('/export/alertas.csv')}>⬇ Alertas</button>
              </>}
            </div>
          </details>
        </aside>

        <div className="report-stage">
          {!ready ? <Loading /> : (
            <article className="report" aria-label="Vista previa del reporte">
              <ReportHeader titulo={titulo} fecha={fecha} desde={conMovs ? desde : null} perfil={perfilNombre} fuente={meta.fuente} />
              {secs.length ? secs : <p className="r-foot">Seleccione al menos una sección.</p>}
              <footer className="r-footer">Rankings de Crédito · Hackathon SBP 2026 · Datos ficticios · Cálculo reproducible desde archivos AT03</footer>
            </article>
          )}
        </div>
      </div>
    </>
  );
}

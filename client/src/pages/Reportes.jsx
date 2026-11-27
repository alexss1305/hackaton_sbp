import { useEffect, useState } from 'react';
import { api, download, qs } from '../api.js';
import { ErrorBox, Loading, MultiSelect, Select } from '../components/ui.jsx';
import { fmtMoney, fmtPeriodo, fmtRanking } from '../format.js';
import {
  ReportHeader, KpiSection, LideresSection, HeatmapSection, RankingSection,
  MovimientosSection, CalidadSection, IndicadoresSection, NotaMetodologica,
} from '../components/report/sections.jsx';

/** Secciones disponibles; `permiso` = permiso requerido (configurable por el Administrador). */
const SECCIONES = [
  { id: 'kpis', label: 'Resumen del período' },
  { id: 'lideres', label: 'Líderes y concentración' },
  { id: 'heatmap', label: 'Perfil de cartera (mapa de calor)' },
  { id: 'rankings', label: 'Rankings con gráfico y composición' },
  { id: 'movimientos', label: 'Movimientos y explicación automática', permiso: 'comparar_periodos' },
  { id: 'calidad', label: 'Calidad de datos y reconciliaciones' },
  { id: 'indicadores', label: 'Indicadores complementarios (morosidad)' },
  { id: 'nota', label: 'Nota metodológica' },
];

const PLANTILLAS = {
  ejecutivo: { label: 'Reporte ejecutivo', titulo: 'Reporte ejecutivo de rankings de crédito', secciones: ['kpis', 'lideres', 'heatmap', 'movimientos', 'calidad', 'nota'], topN: 5 },
  rankings: { label: 'Rankings detallados', titulo: 'Rankings de crédito por actividad económica', secciones: ['kpis', 'rankings', 'nota'], topN: 12 },
  comparacion: { label: 'Comparación de períodos', titulo: 'Movimientos de posición entre períodos', secciones: ['kpis', 'movimientos', 'heatmap', 'nota'], topN: 5, permiso: 'comparar_periodos' },
  calidad: { label: 'Calidad de datos', titulo: 'Reporte de calidad de datos AT03', secciones: ['kpis', 'calidad', 'indicadores', 'nota'], topN: 5 },
};

/** Descargas CSV oficiales y el permiso que exige cada una. */
const DESCARGAS = [
  { label: 'Rankings ({periodo})', permiso: 'descargar_rankings', path: (f, rk) => `/export/rankings.csv${qs({ fechas: [f], rankings: rk })}` },
  { label: 'Subactividades ({periodo})', permiso: 'descargar_subactividades', path: (f, rk) => `/export/subactividades.csv${qs({ fechas: [f], rankings: rk })}` },
  { label: 'Rankings (todos los períodos)', permiso: 'descargar_rankings', path: () => '/export/rankings.csv' },
  { label: 'Subactividades (todos los períodos)', permiso: 'descargar_subactividades', path: () => '/export/subactividades.csv' },
  { label: 'Calidad (todos los períodos)', permiso: 'descargar_calidad', path: () => '/export/calidad.csv' },
  { label: 'Movimientos (todos)', permiso: 'descargar_movimientos', path: () => '/export/movimientos.csv' },
  { label: 'Filas excluidas', permiso: 'descargar_excluidas', path: () => '/export/excluidas.csv' },
  { label: 'Alertas de calidad', permiso: 'descargar_alertas', path: () => '/export/alertas.csv' },
];

export default function Reportes({ ctx }) {
  const { meta, puede, perfilNombre, fecha: fechaGlobal } = ctx;
  const ok = (x) => !x.permiso || puede(x.permiso);
  const fechas = meta.periodos.map((p) => p.fecha);

  const [plantilla, setPlantilla] = useState('ejecutivo');
  const [titulo, setTitulo] = useState(PLANTILLAS.ejecutivo.titulo);
  const [secciones, setSecciones] = useState(PLANTILLAS.ejecutivo.secciones);
  const [fecha, setFecha] = useState(fechaGlobal);
  const [desde, setDesde] = useState(fechas[fechas.indexOf(fechaGlobal) - 1] || '');
  const [rankings, setRankings] = useState([]);
  const [destacados, setDestacados] = useState([]);
  const [topN, setTopN] = useState(5);
  const [tipoDescarga, setTipoDescarga] = useState(DESCARGAS[0].label);
  const [data, setData] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [error, setError] = useState(null);
  const verComplemento = puede('comparar_periodos');

  const aplicarPlantilla = (k) => {
    const p = PLANTILLAS[k];
    setPlantilla(k); setTitulo(p.titulo); setSecciones(p.secciones); setTopN(p.topN);
  };
  const permitidas = SECCIONES.filter(ok);
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

  useEffect(() => {
    if (!verComplemento) return undefined;
    let alive = true;
    Promise.all(fechas.map((f) => api(`/periods/${f}/rankings`).then((rk) => ({ fecha: f, rk }))))
      .then((rows) => { if (alive) setHistorial(rows); })
      .catch(() => { if (alive) setHistorial([]); });
    return () => { alive = false; };
  }, [fechas.join(','), verComplemento]);

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
  const descargarPersonalizado = () => {
    if (!ready) return;
    const cols = ['Fecha', 'Actividad', 'Banco', 'Saldo', 'Ponderacion', 'Posicion', 'Cartera_local', 'Subactividad_lider'];
    const lines = [cols.join(',')];
    const bancosOk = destacados.length ? destacados : null;
    for (const rk of rks) {
      for (const row of data.rankingsData[rk] || []) {
        if (bancosOk && !bancosOk.includes(row.Codigo_Banco)) continue;
        const lider = data.subs.filter((s) => s.Ranking === rk && s.Codigo_Banco === row.Codigo_Banco).sort((a, b) => Number(b.Saldo) - Number(a.Saldo))[0];
        lines.push([fecha, rk, row.Banco, row.Saldo_Actividad, row.Ponderacion_Pct, row.Posicion, row.Total_Cartera_Local_Valida, lider?.Subactividad || ''].map((v) => `"${String(v ?? '').replaceAll('"', '""')}"`).join(','));
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'reporte_personalizado.csv';
    a.click();
  };
  const toggleSec = (id) => setSecciones((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const filasComplemento = (() => {
    if (!ready || !verComplemento) return [];
    const bancosOk = destacados.length ? destacados : null;
    const out = [];
    for (const rk of rks) {
      for (const row of data.rankingsData[rk] || []) {
        if (bancosOk && !bancosOk.includes(row.Codigo_Banco)) continue;
        const lider = data.subs.filter((s) => s.Ranking === rk && s.Codigo_Banco === row.Codigo_Banco).sort((a, b) => Number(b.Saldo) - Number(a.Saldo))[0];
        const posiciones = fechas.map((f) => {
          const pack = historial.find((h) => h.fecha === f)?.rk;
          return pack?.[rk]?.find((x) => x.Codigo_Banco === row.Codigo_Banco)?.Posicion ?? '';
        });
        out.push({ key: `${rk}-${row.Codigo_Banco}`, rk, banco: row.Banco, posiciones, cartera: row.Total_Cartera_Local_Valida, pond: row.Ponderacion_Pct, lider: lider?.Subactividad || '' });
      }
    }
    return out;
  })();

  return (
    <>
      <div className="page-head no-print">
        <div>
          <h1>Reportes</h1>
          <p>Arme un reporte con plantillas o eligiendo secciones, revise la vista previa y descárguelo como PDF. Los datos oficiales también se descargan en CSV.</p>
        </div>
        <button className="btn primary" onClick={() => window.print()} disabled={!ready}>Descargar PDF / Imprimir</button>
      </div>
      <ErrorBox error={error} />

      <div className="report-layout">
        <aside className="card report-builder no-print">
          <h3>1. Plantilla</h3>
          <div className="tpl-grid">
            {Object.entries(PLANTILLAS).filter(([, p]) => ok(p)).map(([k, p]) => (
              <button key={k} className={`tpl ${plantilla === k ? 'on' : ''}`} onClick={() => aplicarPlantilla(k)}>{p.label}</button>
            ))}
          </div>

          <h3>2. Contenido</h3>
          <label className="field">Título<input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} /></label>
          <Select label="Período" value={fecha} onChange={(f) => { setFecha(f); setDesde(fechas[fechas.indexOf(f) - 1] || ''); }} options={fechas.map((f) => ({ value: f, label: fmtPeriodo(f) }))} />
          {puede('comparar_periodos') && (
            <Select label="Comparar contra" value={desde} onChange={setDesde}
              options={[{ value: '', label: 'Sin comparación' }, ...fechas.filter((f) => f !== fecha).map((f) => ({ value: f, label: fmtPeriodo(f) }))]} />
          )}
          <MultiSelect label="Rankings" options={meta.rankings.map((r) => ({ value: r, label: fmtRanking(r) }))} value={rankings} onChange={setRankings} placeholder="Los 6 rankings" />
          <MultiSelect label="Bancos a destacar" options={meta.bancos.map((b) => ({ value: b.codigo, label: b.nombre }))} value={destacados} onChange={setDestacados} placeholder="Ninguno" />
          <Select label="Filas por tabla de ranking" value={String(topN)} onChange={(v) => setTopN(Number(v))} options={[3, 5, 10, 12].map((v) => ({ value: String(v), label: v === 12 ? 'Los 12 bancos' : `Top ${v}` }))} />

          <h3>3. Secciones</h3>
          <div className="sec-list">
            {SECCIONES.map((s) => (
              <label key={s.id} className={ok(s) ? '' : 'disabled'} title={ok(s) ? '' : 'Su perfil no tiene este permiso'}>
                <input type="checkbox" disabled={!ok(s)} checked={activas.includes(s.id)} onChange={() => toggleSec(s.id)} />
                {s.label}{!ok(s) && <small> / sin permiso</small>}
              </label>
            ))}
          </div>
          {activas.includes('movimientos') && !conMovs && <p className="muted" style={{ fontSize: 12 }}>Elija un período de comparación para incluir los movimientos.</p>}

          <h3>4. Descarga</h3>
          <p className="sub">Elija el tipo. Solo aparecen las descargas de su perfil. El archivo oficial no cambia de columnas.</p>
          <Select label="Tipo de archivo" value={tipoDescarga} onChange={setTipoDescarga} options={DESCARGAS.filter((d) => puede(d.permiso)).map((d) => ({ value: d.label, label: d.label.replace('{periodo}', fmtPeriodo(fecha)) }))} />
          <p className="muted" style={{ fontSize: 12 }}>Vista previa: corte {fmtPeriodo(fecha)}{rankings.length ? `, actividades elegidas: ${rankings.length}` : ', las seis actividades'}.</p>
          <button className="btn" disabled={!tipoDescarga} onClick={() => { const d = DESCARGAS.find((x) => x.label === tipoDescarga); if (d) run(d.path(fecha, rankings)); }}>Descargar selección</button>
          {puede('comparar_periodos') && ready && <button className="btn" onClick={descargarPersonalizado}>Descargar reporte personalizado</button>}
        </aside>

        <div className="report-stage">
          {!ready ? <Loading /> : (
            <article className="report" aria-label="Vista previa del reporte">
              <ReportHeader titulo={titulo} fecha={fecha} desde={conMovs ? desde : null} perfil={perfilNombre} fuente={meta.fuente} />
              {secs.length ? secs : <p className="r-foot">Seleccione al menos una sección.</p>}
              <footer className="r-footer">Ranking de Créditos / Superintendencia de Bancos de Panamá / Cálculo reproducible desde archivos AT03 / Datos sintéticos, uso informativo</footer>
            </article>
          )}
        </div>
      </div>
      {verComplemento && ready && (
        <section className="card no-print" style={{ marginTop: 16 }}>
          <h3>Información complementaria</h3>
          <p className="sub">Cartera local, ponderación y subactividad líder del corte {fmtPeriodo(fecha)}, y la posición de cada banco en los cortes cargados. Estas cifras salen de los rankings ya calculados.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Actividad</th>
                  <th>Banco</th>
                  {fechas.map((f) => <th key={f}>Posición {fmtPeriodo(f)}</th>)}
                  <th>Cartera local</th>
                  <th>Ponderación</th>
                  <th>Subactividad líder</th>
                </tr>
              </thead>
              <tbody>
                {filasComplemento.map((row) => (
                  <tr key={row.key}>
                    <td>{fmtRanking(row.rk)}</td>
                    <td>{row.banco}</td>
                    {row.posiciones.map((p, i) => <td key={fechas[i]}>{p}</td>)}
                    <td>{fmtMoney(row.cartera)}</td>
                    <td>{row.pond}</td>
                    <td>{row.lider}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

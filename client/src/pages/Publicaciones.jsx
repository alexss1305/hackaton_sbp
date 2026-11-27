import { useState } from 'react';
import { useApi, ErrorBox, Loading } from '../components/ui.jsx';
import { Icon } from '../components/brand.jsx';
import { download, qs } from '../api.js';
import { fmtInt, fmtMoney, fmtMoneyCompact, fmtCorte, fmtFechaHora, fmtRankingSBP } from '../format.js';
import '../components/admin.css';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Publicaciones: una fila por período, como la lista de reportes de la SBP, con acceso directo a cada ranking. */
export default function Publicaciones({ ctx }) {
  const { meta, setFecha, goTo, puede, perfil } = ctx;
  const { data, error, loading } = useApi('/publicaciones', [meta.calculadoEn]);
  const [anio, setAnio] = useState('');
  const anios = [...new Set((data || []).map((p) => p.fecha.slice(0, 4)))];
  const lista = (data || []).filter((p) => !anio || p.fecha.startsWith(anio));
  const abrir = (fecha, pagina) => { setFecha(fecha); goTo(pagina); };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Publicaciones</h1>
          <p>Reportes de ranking de crédito por actividad económica publicados en la plataforma, del más reciente al más antiguo. Cada corte se calcula desde su archivo AT03.</p>
        </div>
        {anios.length > 1 && (
          <label className="field">Año
            <select value={anio} onChange={(e) => setAnio(e.target.value)}><option value="">Todos</option>{anios.map((a) => <option key={a} value={a}>{a}</option>)}</select>
          </label>
        )}
      </div>
      <ErrorBox error={error} />
      {loading ? <Loading /> : (
        <div className="pub-list">
          {lista.map((p, i) => (
            <article key={p.fecha} className="pub" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="pub-fecha"><b>{p.fecha.slice(6, 8)}</b><span>{MESES[Number(p.fecha.slice(4, 6)) - 1]} {p.fecha.slice(0, 4)}</span></div>
              <div className="pub-info">
                <h3>Ranking de crédito por actividad · corte {fmtCorte(p.fecha)} {i === 0 && <span className="badge ok" style={{ marginLeft: 6 }}>Más reciente</span>}</h3>
                <div className="pub-meta">
                  <span className={`pub-estado ${p.estado === 'Publicado' ? 'ok' : 'obs'}`}><Icon name={p.estado === 'Publicado' ? 'check' : 'info'} />{p.estado}</span>
                  <span>Cartera {fmtMoneyCompact(p.saldo)} <span title={fmtMoney(p.saldo)}>ⓘ</span></span>
                  <span>{fmtInt(p.universo)} operaciones válidas de {fmtInt(p.filas)}</span>
                  {p.verificado && <span>Totales conciliados</span>}
                  {perfil === 'administrador' && <span>{p.cargadoPor ? `${p.accion} por ${p.cargadoPor} · ${fmtFechaHora(p.cargadoEn)}` : 'Archivo inicial'}</span>}
                  {perfil === 'administrador' && <span>{p.versiones} versión(es) anterior(es) · {p.archivos.join(', ')}</span>}
                </div>
                <div className="pub-meta" style={{ marginTop: 6 }}>
                  {meta.rankings.map((r) => <span key={r}>{fmtRankingSBP(r)}</span>)}
                </div>
              </div>
              <div className="pub-acc">
                <button className="btn primary" onClick={() => abrir(p.fecha, 'rankings')}>Ver rankings</button>
                <button className="btn" onClick={() => abrir(p.fecha, 'calidad')}>Calidad</button>
                {puede('descargar_rankings') && <button className="btn" onClick={() => download(`/export/rankings.csv${qs({ fechas: [p.fecha] })}`)}><Icon name="download" />CSV</button>}
              </div>
            </article>
          ))}
          {!lista.length && <p className="muted">No hay períodos publicados.</p>}
        </div>
      )}
    </>
  );
}

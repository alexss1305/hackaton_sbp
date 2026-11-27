import { fmtMoneyCompact, fmtPct, fmtRanking } from '../format.js';
import { iniciales, semaforo } from './BancoFicha.jsx';
import './bancos.css';

const CORTO = { HIPOTECARIO: 'Hip', CONSTRUCCION: 'Cons', INDUSTRIA: 'Ind', AGROPECUARIO: 'Agro', COMERCIO: 'Com', CONSUMO: 'Cons.' };

/** Tarjeta tipo contacto de un banco: cartera, variación, posiciones en los 6 rankings y morosidad. */
export default function BancoCard({ b, promedioMorosidad, onOpen, style }) {
  const s = semaforo(b.morosidadPct, promedioMorosidad);
  const v = b.varCarteraPct === null ? null : Number(b.varCarteraPct);
  return (
    <button type="button" className="bk-card" onClick={() => onOpen(b.codigo)} style={style} aria-label={`Abrir ficha de ${b.nombre}`}>
      <div className="bk-top">
        <span className="bk-avatar">{iniciales(b.nombre)}</span>
        <div className="bk-name"><b>{b.nombre}</b><span>Código {b.codigo} · #{b.puestoCartera} por tamaño</span></div>
      </div>
      <div className="bk-cartera">
        <b>{fmtMoneyCompact(b.cartera)}</b>
        {v !== null && <span className={v >= 0 ? 'up' : 'down'}>{v >= 0 ? '▲' : '▼'} {Math.abs(v).toFixed(2)}%</span>}
      </div>
      <div className="bk-pos" title="Puesto en cada ranking">
        {b.posiciones.map((p) => (
          <span key={p.Ranking} className={p.Posicion === 1 ? 'p1' : ''} title={`${fmtRanking(p.Ranking)}: puesto ${p.Posicion}`}>
            <b>#{p.Posicion}</b>{CORTO[p.Ranking] || p.Ranking.slice(0, 4)}
          </span>
        ))}
      </div>
      <div className="bk-foot">
        <span title={`Morosidad: ${s.label}`}><i className={`sem ${s.cls}`} />Morosidad {fmtPct(b.morosidadPct, 2)}</span>
        <span>{fmtPct(b.participacionSistemaPct, 2)} del sistema</span>
      </div>
      {b.lidera.length > 0 && <div className="bk-lider">{b.lidera.map((r) => <em key={r}>Lidera {fmtRanking(r)}</em>)}</div>}
    </button>
  );
}

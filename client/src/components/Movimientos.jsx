import { useState } from 'react';
import { fmtMoney, fmtPct, fmtCorte, fmtMes, fmtRanking } from '../format.js';
import { etiquetaMotivo } from '../labels.js';

function sentido(m) {
  if (String(m.Motivo_Significativo || '').toLowerCase().includes('líder') || String(m.Motivo_Significativo || '').toLowerCase().includes('lider')) return 'lider';
  if ((m.Cambio_Posicion ?? 0) < 0) return 'baja';
  if ((m.Cambio_Posicion ?? 0) > 0) return 'sube';
  return 'lider';
}

function nota(m) {
  const cambio = m.Cambio_Posicion ?? 0;
  const saldo = Number(m.Var_Saldo);
  if (cambio < 0 && saldo > 0) return `Su saldo aumenta en ${fmtMoney(m.Var_Saldo)} (${fmtPct(m.Var_Saldo_Pct, 2)}), pero otro banco crece más rápido.`;
  if (cambio > 0 && saldo < 0) return `Su saldo disminuye en ${fmtMoney(m.Var_Saldo)} (${fmtPct(m.Var_Saldo_Pct, 2)}), y aun así mejora de puesto.`;
  return '';
}

function Fila({ m }) {
  const s = sentido(m);
  const palabra = s === 'baja' ? 'Baja' : 'Sube';
  return (
    <article className={`mov-row ${s}`}>
      <div>
        <b>{palabra}</b>
        <div className="mov-k">{etiquetaMotivo(m.Motivo_Significativo)}</div>
      </div>
      <div>
        <b>{m.Banco}</b>
        <span className="mov-k"> / {fmtRanking(m.Ranking)}</span>
        <div>Del puesto {m.Posicion_Anterior} al {m.Posicion_Actual}</div>
        <div>Variación de saldo: {fmtMoney(m.Var_Saldo)} ({fmtPct(m.Var_Saldo_Pct, 2)})</div>
        {m.Subactividad_Driver && <div>Subactividad que más explica el cambio: {m.Subactividad_Driver} ({fmtMoney(m.Var_Subactividad)})</div>}
        {nota(m) && <div>{nota(m)}</div>}
      </div>
    </article>
  );
}

/** Lista de movimientos significativos, agrupada por actividad. */
export default function Movimientos({ movimientos, desde, hasta }) {
  const [abiertos, setAbiertos] = useState({});
  const sig = (movimientos || []).filter((m) => m.Significativo);
  const grupos = [];
  for (const m of sig) {
    let g = grupos.find((x) => x.ranking === m.Ranking);
    if (!g) { g = { ranking: m.Ranking, items: [] }; grupos.push(g); }
    g.items.push(m);
  }
  for (const g of grupos) {
    g.items.sort((a, b) => Math.abs(b.Cambio_Posicion ?? 0) - Math.abs(a.Cambio_Posicion ?? 0) || Math.abs(Number(b.Var_Saldo)) - Math.abs(Number(a.Var_Saldo)));
  }
  grupos.sort((a, b) => a.ranking.localeCompare(b.ranking, 'es'));

  return (
    <section>
      <h2>Principales movimientos: {fmtMes(desde)} a {fmtMes(hasta)}</h2>
      <p className="sub">Corte {fmtCorte(desde)} vs corte {fmtCorte(hasta)}. La explicación sale de reglas fijas: cambio de posición de 2 o más puestos, cambio de líder o variación de saldo. No usa inteligencia artificial.</p>
      {grupos.length === 0 && <p className="muted">No hay movimientos significativos entre estos cortes.</p>}
      {grupos.map((g) => {
        const abierto = abiertos[g.ranking];
        const visibles = abierto ? g.items : g.items.slice(0, 4);
        return (
          <div key={g.ranking} style={{ marginTop: 14 }}>
            <h3>{fmtRanking(g.ranking)}</h3>
            <div className="mov-list">
              {visibles.map((m) => <Fila key={m.Ranking + m.Codigo_Banco} m={m} />)}
            </div>
            {g.items.length > 4 && (
              <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => setAbiertos((s) => ({ ...s, [g.ranking]: !s[g.ranking] }))}>
                {abierto ? 'Ver menos' : 'Ver todos'}
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}

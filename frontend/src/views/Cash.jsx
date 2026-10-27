import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../utils/api';
import { money, fdt } from '../utils/format';
import { Wallet } from '../utils/icons';
import Modal from '../components/Modal';

const KINDS = [
  ['cadena', 'Cadena / gasto operativo'],
  ['propina', 'Propina / se sacó'],
  ['proveedor', 'Pago proveedor'],
  ['otro', 'Otro'],
];

export default function Cash() {
  const { cash, refreshCash, toast, fail } = useApp();
  const [showOpen, setShowOpen] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [base, setBase] = useState('');
  const [moveForm, setMoveForm] = useState({ kind: 'cadena', amount: '', concept: '' });
  const [summary, setSummary] = useState(null);

  const load = () => {
    api('/cash/current').then(setSummary).catch(() => setSummary(null));
  };

  useEffect(() => { load(); }, [cash]);

  const openCash = async () => {
    try {
      await api('/cash/open', { method: 'POST', body: { base: Number(base) || 0 } });
      toast('Caja abierta');
      setShowOpen(false);
      await refreshCash();
      load();
    } catch (e) { fail(e); }
  };

  const addMove = async () => {
    try {
      await api('/cash/movements', {
        method: 'POST',
        body: {
          kind: moveForm.kind,
          amount: Number(moveForm.amount),
          concept: moveForm.concept || '',
        },
      });
      toast('Salida registrada');
      setShowMove(false);
      setMoveForm({ kind: 'cadena', amount: '', concept: '' });
      await refreshCash();
      load();
    } catch (e) { fail(e); }
  };

  const moves = summary?.movements || [];

  return (
    <>
      {!cash ? (
        <div className="card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Wallet size={20} strokeWidth={2} /> Abrir caja del día
          </h3>
          <p className="muted mb">
            Registra la base de efectivo (la que dejaron ayer o la que traes hoy). Admin y vendedora pueden abrir.
          </p>
          <button className="btn primary big" onClick={() => setShowOpen(true)}>Abrir caja</button>
        </div>
      ) : (
        <>
          <div className="grid g3 mb">
            <div className="card stat">
              <div className="lbl">Base inicial</div>
              <div className="val">{money(summary?.base ?? cash.base)}</div>
            </div>
            <div className="card stat">
              <div className="lbl">Salidas</div>
              <div className="val">{money(summary?.gastos ?? 0)}</div>
            </div>
            <div className="card stat">
              <div className="lbl">Efectivo esperado</div>
              <div className="val">{money(summary?.efectivo_esperado ?? 0)}</div>
            </div>
          </div>
          <div className="spread mb">
            <p className="muted">Registra propinas, cadenas o pagos (como en el cuaderno).</p>
            <button className="btn primary" onClick={() => setShowMove(true)}>+ Registrar salida</button>
          </div>
          <div className="card">
            <table className="table">
              <thead>
                <tr><th>Tipo</th><th>Monto</th><th>Nota</th><th>Hora</th></tr>
              </thead>
              <tbody>
                {moves.map(m => (
                  <tr key={m.id}>
                    <td>{m.kind}</td>
                    <td>{money(m.amount)}</td>
                    <td>{m.concept || '—'}</td>
                    <td>{fdt(m.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!moves.length && <p className="muted">Sin salidas aún</p>}
          </div>
          <p className="muted mt">Al terminar el turno ve a <b>Cierre de caja</b> para contar efectivo y dejar base del otro día.</p>
        </>
      )}

      {showOpen && (
        <Modal title="Abrir caja" onClose={() => setShowOpen(false)}>
          <div className="field">
            <label>Base en efectivo</label>
            <input className="input" type="number" value={base} onChange={e => setBase(e.target.value)} placeholder="80000" />
          </div>
          <div className="foot">
            <button className="btn" onClick={() => setShowOpen(false)}>Cancelar</button>
            <button className="btn primary" onClick={openCash}>Abrir</button>
          </div>
        </Modal>
      )}

      {showMove && (
        <Modal title="Registrar salida" onClose={() => setShowMove(false)}>
          <div className="field">
            <label>Tipo</label>
            <select className="input" value={moveForm.kind} onChange={e => setMoveForm(f => ({ ...f, kind: e.target.value }))}>
              {KINDS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Monto</label>
            <input className="input" type="number" value={moveForm.amount} onChange={e => setMoveForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <div className="field">
            <label>Nota</label>
            <input className="input" value={moveForm.concept} onChange={e => setMoveForm(f => ({ ...f, concept: e.target.value }))} placeholder="Ej. propina, mercado…" />
          </div>
          <div className="foot">
            <button className="btn" onClick={() => setShowMove(false)}>Cancelar</button>
            <button className="btn primary" onClick={addMove}>Guardar</button>
          </div>
        </Modal>
      )}
    </>
  );
}

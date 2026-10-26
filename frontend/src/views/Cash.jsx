import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../utils/api';
import { money, KINDS, METHODS, fdt } from '../utils/format';
import Modal from '../components/Modal';

export default function Cash() {
  const { cash, refreshCash, toast, fail, isAdmin } = useApp();
  const [moves, setMoves] = useState([]);
  const [showOpen, setShowOpen] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [base, setBase] = useState('');
  const [moveForm, setMoveForm] = useState({ kind: 'cadena', amount: '', note: '', method: 'efectivo' });

  const loadMoves = async () => {
    if (!cash) { setMoves([]); return; }
    try {
      const m = await api(`/cash/${cash.id}/movements`);
      setMoves(m);
    } catch {}
  };

  useEffect(() => { loadMoves(); }, [cash]);

  const openCash = async () => {
    try {
      await api('/cash/open', { method: 'POST', body: { base: Number(base) || 0 } });
      toast('Caja abierta');
      setShowOpen(false);
      await refreshCash();
    } catch (e) { fail(e); }
  };

  const addMove = async () => {
    try {
      await api('/cash/movements', {
        method: 'POST',
        body: {
          kind: moveForm.kind,
          amount: Number(moveForm.amount),
          note: moveForm.note || null,
          method: moveForm.method,
        },
      });
      toast('Salida registrada');
      setShowMove(false);
      setMoveForm({ kind: 'cadena', amount: '', note: '', method: 'efectivo' });
      await refreshCash();
      loadMoves();
    } catch (e) { fail(e); }
  };

  if (!isAdmin()) {
    return <div className="empty"><div className="big">🔒</div><p>Solo la administradora puede gestionar la caja</p></div>;
  }

  return (
    <>
      {!cash ? (
        <div className="card">
          <h3>💰 Abrir caja del día</h3>
          <p className="muted mb">Registra la base inicial de efectivo antes de empezar a vender.</p>
          <button className="btn primary big" onClick={() => setShowOpen(true)}>Abrir caja</button>
        </div>
      ) : (
        <>
          <div className="grid g3 mb">
            <div className="card stat">
              <div className="lbl">Base inicial</div>
              <div className="val">{money(cash.base)}</div>
            </div>
            <div className="card stat">
              <div className="lbl">Salidas</div>
              <div className="val">{money(cash.gastos || 0)}</div>
            </div>
            <div className="card stat">
              <div className="lbl">Efectivo esperado</div>
              <div className="val">{money(cash.efectivo_esperado || 0)}</div>
            </div>
          </div>
          <div className="spread mb">
            <h3>Movimientos de salida</h3>
            <button className="btn primary" onClick={() => setShowMove(true)}>+ Registrar salida</button>
          </div>
          <div className="card">
            {moves.length ? (
              <table className="table">
                <thead>
                  <tr><th>Hora</th><th>Tipo</th><th>Método</th><th>Nota</th><th>Monto</th></tr>
                </thead>
                <tbody>
                  {moves.map(m => (
                    <tr key={m.id}>
                      <td>{fdt(m.created_at)}</td>
                      <td>{KINDS[m.kind]?.[0]} {KINDS[m.kind]?.[1] || m.kind}</td>
                      <td>{METHODS[m.method]?.[1] || m.method}</td>
                      <td>{m.note || '—'}</td>
                      <td><b>{money(m.amount)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty"><div className="big">🧾</div><p>Sin salidas registradas hoy</p></div>
            )}
          </div>
        </>
      )}

      {showOpen && (
        <Modal title="Abrir caja" onClose={() => setShowOpen(false)}>
          <div className="field">
            <label>Base inicial (efectivo en caja)</label>
            <input className="input" type="number" value={base} onChange={e => setBase(e.target.value)} autoFocus />
          </div>
          <div className="foot">
            <button className="btn" onClick={() => setShowOpen(false)}>Cancelar</button>
            <button className="btn primary" onClick={openCash}>Abrir</button>
          </div>
        </Modal>
      )}

      {showMove && (
        <Modal title="Registrar salida de dinero" onClose={() => setShowMove(false)}>
          <div className="field">
            <label>Tipo</label>
            <select className="input" value={moveForm.kind} onChange={e => setMoveForm(f => ({ ...f, kind: e.target.value }))}>
              {Object.entries(KINDS).map(([k, [em, name]]) => <option key={k} value={k}>{em} {name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Monto</label>
            <input className="input" type="number" value={moveForm.amount} onChange={e => setMoveForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <div className="field">
            <label>Método</label>
            <select className="input" value={moveForm.method} onChange={e => setMoveForm(f => ({ ...f, method: e.target.value }))}>
              {Object.entries(METHODS).map(([k, [em, name]]) => <option key={k} value={k}>{em} {name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Nota</label>
            <input className="input" value={moveForm.note} onChange={e => setMoveForm(f => ({ ...f, note: e.target.value }))} />
          </div>
          <div className="foot">
            <button className="btn" onClick={() => setShowMove(false)}>Cancelar</button>
            <button className="btn primary" onClick={addMove}>Registrar</button>
          </div>
        </Modal>
      )}
    </>
  );
}

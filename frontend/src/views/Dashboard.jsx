import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { api } from '../utils/api';
import { money } from '../utils/format';
import {
  Heart,
  ShoppingCart,
  Calculator,
  Wallet,
  Gift,
  Banknote,
  FileText,
  AlertTriangle,
  CheckCircle2,
  ShoppingBag,
} from '../utils/icons';

function dayLabel(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' });
}

function BarChart({ data }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="bars">
      {data.map((d, i) => (
        <div className="b" key={i}>
          <em>{d.value ? money(d.value).replace('$', '') : ''}</em>
          <i style={{ height: `${Math.max((d.value / max) * 100, 2) * 0.78}%` }} />
          <span>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { user, cash, fail } = useApp();
  const [d, setD] = useState(null);

  useEffect(() => {
    api('/reports/dashboard')
      .then(setD)
      .catch(fail);
  }, [fail, cash]);

  if (!d) return (
    <div className="empty">
      <div className="big"><Heart size={42} strokeWidth={1.5} style={{ color: 'var(--rose-400)' }} /></div>
      <p>Cargando…</p>
    </div>
  );

  const hr = new Date().getHours();
  const greet = hr < 12 ? 'Buenos días' : hr < 19 ? 'Buenas tardes' : 'Buenas noches';
  const cashBox = d.cash || null;
  const cajaAbierta = cashBox ? (cashBox.status === 'abierta' || cashBox.is_open === true) : false;

  return (
    <>
      <div className="hello mb">
        <div>
          <h1>
            {greet}, {user?.full_name?.split(' ')[0]}{' '}
            <Heart size={22} fill="var(--rose-400)" stroke="var(--rose-400)" style={{ display: 'inline', verticalAlign: 'middle' }} />
          </h1>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })} ·{' '}
            {cajaAbierta ? 'La caja está abierta, ¡a vender!' : 'Aún no has abierto la caja de hoy.'}
          </p>
        </div>
        <div className="gap">
          <Link className="btn primary big" to="/pos">
            <ShoppingCart size={18} strokeWidth={2} style={{ marginRight: 6 }} /> Nueva venta
          </Link>
          {cajaAbierta ? (
            <Link className="btn ghost big" to="/close">
              <Calculator size={18} strokeWidth={2} style={{ marginRight: 6 }} /> Cerrar caja
            </Link>
          ) : (
            <Link className="btn ghost big" to="/cash">
              <Wallet size={18} strokeWidth={2} style={{ marginRight: 6 }} /> Abrir caja
            </Link>
          )}
        </div>
      </div>
      <div className="grid g4 mb">
        <div className="card stat hot">
          <span className="em"><Gift size={28} strokeWidth={1.75} /></span>
          <div className="lbl">Ventas de hoy</div>
          <div className="val">{money(d.today_total)}</div>
          <div className="sub">{d.today_count} venta{d.today_count === 1 ? '' : 's'}</div>
        </div>
        <div className="card stat">
          <span className="em"><Banknote size={28} strokeWidth={1.75} /></span>
          <div className="lbl">Efectivo esperado</div>
          <div className="val">{cashBox ? money(cashBox.efectivo_esperado) : '—'}</div>
          <div className="sub">
            {cashBox
              ? (cajaAbierta
                  ? `Base ${money(cashBox.base)} + efectivo − salidas`
                  : `Última caja · base ${money(cashBox.base)} · cerrada`)
              : 'Sin sesión de caja aún'}
          </div>
        </div>
        <div className="card stat">
          <span className="em"><FileText size={28} strokeWidth={1.75} /></span>
          <div className="lbl">Salidas de hoy</div>
          <div className="val">{cashBox ? money(cashBox.gastos ?? 0) : money(0)}</div>
          <div className="sub">
            {cashBox
              ? (cajaAbierta ? 'Cadenas, ahorros y gastos' : 'Salidas de la última caja')
              : 'Cadenas, ahorros y gastos'}
          </div>
        </div>
        <div className="card stat">
          <span className="em"><AlertTriangle size={28} strokeWidth={1.75} /></span>
          <div className="lbl">Por agotarse</div>
          <div className="val" style={{ color: d.low_count ? 'var(--danger)' : 'var(--ok)' }}>{d.low_count}</div>
          <div className="sub">productos en stock mínimo</div>
        </div>
      </div>
      <div className="grid g-main">
        <div className="card">
          <h3>Ventas de los últimos 7 días</h3>
          <BarChart data={d.week.map(w => ({ label: dayLabel(w.day), value: w.total }))} />
        </div>
        <div className="card">
          <div className="spread">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={18} strokeWidth={2} style={{ color: 'var(--danger)' }} /> Por surtir
            </h3>
            <Link className="btn sm" to="/inventory">Ver pedido</Link>
          </div>
          {d.low?.length ? (
            d.low.map(p => (
              <div className="gap" key={p.id} style={{ padding: '8px 0', borderBottom: '1px dashed var(--rose-200)' }}>
                <div className="thumb">
                  {p.image ? <img src={p.image} alt="" /> : <ShoppingBag size={20} strokeWidth={1.5} style={{ color: 'var(--plum-soft)' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 14 }}>{p.name}</b>
                  <div className="small muted">{p.sku} · mín. {p.min_stock}</div>
                </div>
                <span className="badge red">{p.stock} und</span>
              </div>
            ))
          ) : (
            <div className="empty">
              <div className="big"><CheckCircle2 size={42} strokeWidth={1.5} style={{ color: 'var(--ok)' }} /></div>
              <p>Todo el inventario está bien surtido</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

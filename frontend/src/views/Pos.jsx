import { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { api } from '../utils/api';
import { money, METHODS } from '../utils/format';
import Modal from '../components/Modal';

const REASONS = ['Producto dañado', 'Cliente frecuente', 'Promoción', 'Regateo', 'Otro'];

export default function Pos() {
  const { cash, categories, settings, toast, fail, isAdmin } = useApp();
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState(new Map());
  const [cat, setCat] = useState(0);
  const [q, setQ] = useState('');
  const [showPay, setShowPay] = useState(false);
  const [payData, setPayData] = useState({ method: 'efectivo', received: '', discount: 0, reason: '', customer_name: '', customer_phone: '' });
  const scanRef = useRef(null);
  const rate = parseFloat(settings.tax_rate || 0);

  useEffect(() => {
    api('/products').then(setProducts).catch(fail);
  }, [fail]);

  const focusScan = () => {
    if (window.matchMedia('(hover:hover)').matches) scanRef.current?.focus();
  };

  const add = useCallback((p) => {
    if (!cash) {
      toast('La caja está cerrada', 'err');
      return;
    }
    setCart(prev => {
      const next = new Map(prev);
      const cur = next.get(p.id);
      const qty = (cur?.qty || 0) + 1;
      if (qty > p.stock) {
        toast(`Solo hay ${p.stock} unidades de ${p.name}`, 'err');
        return prev;
      }
      next.set(p.id, { p, qty });
      return next;
    });
    focusScan();
  }, [cash, toast]);

  const filtered = products.filter(p => {
    if (cat && p.category_id !== cat) return false;
    if (q) {
      const ql = q.toLowerCase();
      return p.name.toLowerCase().includes(ql) || p.sku?.toLowerCase().includes(ql) || p.barcode?.toLowerCase().includes(ql);
    }
    return true;
  });

  const lines = [...cart.values()];
  const sub = lines.reduce((a, l) => a + l.qty * l.p.price, 0);
  const disc = Math.min(Number(payData.discount) || 0, sub);
  const tax = Math.round((sub - disc) * rate / 100);
  const total = sub - disc + tax;

  const onScanKey = e => {
    if (e.key !== 'Enter') return;
    const code = e.target.value.trim();
    if (!code) return;
    let p = products.find(x => x.sku === code || x.barcode === code);
    if (!p) {
      const hits = products.filter(x => x.name.toLowerCase().includes(code.toLowerCase()));
      if (hits.length === 1) p = hits[0];
    }
    if (p) {
      add(p);
      setQ('');
      e.target.value = '';
    } else {
      toast(`Código «${code}» no encontrado`, 'err');
    }
  };

  const doPay = async () => {
    if (!cash) return toast('La caja está cerrada', 'err');
    if (!lines.length) return;
    if (payData.discount > 0 && !payData.reason) return toast('Indica el motivo del descuento', 'err');
    try {
      const body = {
        items: lines.map(l => ({ product_id: l.p.id, qty: l.qty })),
        method: payData.method,
        discount: disc,
        discount_reason: payData.reason || null,
        received: payData.method === 'efectivo' ? (Number(payData.received) || total) : null,
        customer_name: payData.customer_name || null,
        customer_phone: payData.customer_phone || null,
      };
      const sale = await api('/sales', { method: 'POST', body });
      toast('Venta registrada 💖');
      setCart(new Map());
      setShowPay(false);
      setPayData({ method: 'efectivo', received: '', discount: 0, reason: '', customer_name: '', customer_phone: '' });
      // Refresh products stock
      const prods = await api('/products');
      setProducts(prods);
      // Show simple receipt toast
      if (sale) {
        const text = `Comprobante Nº ${String(sale.number).padStart(5, '0')} · ${money(sale.total)}`;
        toast(text, 'ok');
      }
    } catch (e) {
      fail(e);
    }
  };

  return (
    <>
      {!cash && (
        <div className="card mb" style={{ background: 'var(--danger-bg)', borderColor: '#ffc3ca' }}>
          <b>🔒 La caja está cerrada.</b>{' '}
          {isAdmin() ? <Link to="/cash"><u>Ábrela aquí</u></Link> : 'Pídele al administrador que la abra para poder vender.'}
        </div>
      )}
      <div className="pos">
        <div>
          <div className="scanbar">
            <div className="search" style={{ flex: 1 }}>
              <input
                className="input"
                ref={scanRef}
                placeholder="Escanea el código de barras o escribe el nombre…"
                autoComplete="off"
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={onScanKey}
              />
            </div>
            <button className="btn ghost" onClick={() => { setQ(''); focusScan(); }} title="Limpiar">✕</button>
          </div>
          <div className="chips">
            <button className={`chip ${!cat ? 'on' : ''}`} onClick={() => setCat(0)}>✨ Todo</button>
            {categories.map(c => (
              <button key={c.id} className={`chip ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>
                {c.emoji} {c.name}
              </button>
            ))}
          </div>
          <div className="catalog">
            {filtered.map(p => (
              <button
                key={p.id}
                className={`pcard ${p.low ? 'low' : ''} ${p.stock <= 0 ? 'out' : ''}`}
                onClick={() => p.stock > 0 && add(p)}
                disabled={p.stock <= 0}
              >
                <div className="thumb">{p.image ? <img src={p.image} alt="" /> : (p.emoji || '🛍️')}</div>
                <div className="info">
                  <b>{p.name}</b>
                  <span className="muted small">{p.sku}</span>
                  <span className="price">{money(p.price)}</span>
                  <span className={`stock ${p.low ? 'red' : ''}`}>{p.stock} und</span>
                </div>
              </button>
            ))}
            {!filtered.length && <div className="empty"><div className="big">🔍</div><p>Sin productos que coincidan</p></div>}
          </div>
        </div>
        <div className="card cart">
          <div className="spread">
            <h3>🛍️ Carrito</h3>
            <button className="btn sm danger" onClick={() => setCart(new Map())}>Vaciar</button>
          </div>
          <div className="cart-lines">
            {lines.length ? lines.map(l => (
              <div className="line" key={l.p.id}>
                <div>
                  <div className="nm">{l.p.name}</div>
                  <div className="small muted">{money(l.p.price)} c/u</div>
                </div>
                <div className="right"><b>{money(l.qty * l.p.price)}</b></div>
                <div className="qty">
                  <button onClick={() => {
                    setCart(prev => {
                      const next = new Map(prev);
                      const cur = next.get(l.p.id);
                      if (cur.qty <= 1) next.delete(l.p.id);
                      else next.set(l.p.id, { ...cur, qty: cur.qty - 1 });
                      return next;
                    });
                  }}>−</button>
                  <span>{l.qty}</span>
                  <button onClick={() => add(l.p)}>+</button>
                </div>
                <div className="right">
                  <button className="btn sm danger" onClick={() => {
                    setCart(prev => {
                      const next = new Map(prev);
                      next.delete(l.p.id);
                      return next;
                    });
                  }}>✕</button>
                </div>
              </div>
            )) : (
              <div className="empty"><div className="big">🛒</div><p>Toca un producto o escanea un código para empezar</p></div>
            )}
          </div>
          <div className="totals">
            <div className="r muted"><span>Artículos</span><span>{lines.reduce((a, l) => a + l.qty, 0)}</span></div>
            <div className="r"><span>Subtotal</span><span>{money(sub)}</span></div>
            {rate > 0 && <div className="r muted"><span>Impuesto {rate}%</span><span>{money(tax)}</span></div>}
            <div className="r grand"><span>Total</span><span>{money(total)}</span></div>
          </div>
          <button className="btn primary big mt" style={{ width: '100%' }} disabled={!lines.length || !cash} onClick={() => setShowPay(true)}>
            Cobrar 💖
          </button>
        </div>
      </div>

      {showPay && (
        <Modal title="Cobrar venta" onClose={() => setShowPay(false)} wide>
          <div className="field">
            <label>Método de pago</label>
            <div className="chips">
              {Object.entries(METHODS).map(([k, [em, name]]) => (
                <button key={k} type="button" className={`chip ${payData.method === k ? 'on' : ''}`} onClick={() => setPayData(d => ({ ...d, method: k }))}>
                  {em} {name}
                </button>
              ))}
            </div>
          </div>
          {payData.method === 'efectivo' && (
            <div className="field">
              <label>Recibido</label>
              <input className="input" type="number" value={payData.received} onChange={e => setPayData(d => ({ ...d, received: e.target.value }))} placeholder={String(total)} />
            </div>
          )}
          <div className="field">
            <label>Descuento (opcional)</label>
            <input className="input" type="number" value={payData.discount} onChange={e => setPayData(d => ({ ...d, discount: e.target.value }))} />
          </div>
          {Number(payData.discount) > 0 && (
            <div className="field">
              <label>Motivo del descuento</label>
              <select className="input" value={payData.reason} onChange={e => setPayData(d => ({ ...d, reason: e.target.value }))}>
                <option value="">Selecciona…</option>
                {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}
          <div className="field">
            <label>Cliente (opcional)</label>
            <input className="input" value={payData.customer_name} onChange={e => setPayData(d => ({ ...d, customer_name: e.target.value }))} placeholder="Nombre" />
          </div>
          <div className="field">
            <label>Celular (WhatsApp)</label>
            <input className="input" value={payData.customer_phone} onChange={e => setPayData(d => ({ ...d, customer_phone: e.target.value }))} placeholder="3001234567" />
          </div>
          <div className="foot">
            <button className="btn" onClick={() => setShowPay(false)}>Cancelar</button>
            <button className="btn primary" onClick={doPay}>Confirmar · {money(total)}</button>
          </div>
        </Modal>
      )}
    </>
  );
}

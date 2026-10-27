import { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { api } from '../utils/api';
import { money, METHODS, FINANCE_METHODS, FINANCE_RATE } from '../utils/format';
import { Sparkles, ShoppingCart, ShoppingBag } from '../utils/icons';
import Modal from '../components/Modal';

const REASONS = ['Cliente lista 5%', 'Promoción', 'Ajuste', 'Otro']; // fallback if not below
const REASONS_UNUSED = ['Producto dañado', 'Cliente frecuente', 'Promoción', 'Regateo', 'Otro'];

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
  const net = sub - disc;
  const tax = Math.round(net * rate / 100);
  const finance = FINANCE_METHODS.includes(payData.method) ? Math.round(net * FINANCE_RATE) : 0;
  const total = net + tax + finance;

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
    const discountCheck = Math.max(0, Number(payData.discount) || 0);
    if (discountCheck > 0 && !(payData.reason || '').trim()) {
      return toast('Si hay descuento, indica el motivo', 'err');
    }
    try {
      const discountVal = Math.max(0, Math.min(Number(payData.discount) || 0, sub));
      const body = {
        items: lines.map(l => ({ product_id: l.p.id, qty: l.qty })),
        method: payData.method,
        discount: discountVal,
        discount_reason: discountVal > 0 ? (payData.reason || '') : '',
        // Nunca enviar null: el backend exige número (0 si no es efectivo)
        received: payData.method === 'efectivo'
          ? (Number(payData.received) > 0 ? Number(payData.received) : total)
          : total,
        customer_name: (payData.customer_name || '').trim(),
        customer_phone: (payData.customer_phone || '').trim(),
      };
      const sale = await api('/sales', { method: 'POST', body });
      const phone = payData.customer_phone;
      toast(`Venta #${sale.number} registrada · stock descontado 💖`);
      if (sale.low_stock?.length) {
        const names = sale.low_stock.map(x => `${x.name} (quedan ${x.stock})`).join(', ');
        setTimeout(() => toast(`Avisar surtido al admin: ${names}`, 'err'), 600);
      }
      setCart(new Map());
      setShowPay(false);
      setPayData({ method: 'efectivo', received: '', discount: 0, reason: '', customer_name: '', customer_phone: '' });
      // Refresh products stock
      const prods = await api('/products');
      setProducts(prods);
      if (sale) {
        const text = `Comprobante Nº ${String(sale.number).padStart(5, '0')} · ${money(sale.total)}`;
        toast(text, 'ok');
        // Envío por WhatsApp en 1 clic (propuesta)
        if (phone) {
          let p = String(phone).replace(/\D/g, '');
          if (p.length === 10) p = '57' + p;
          const itemsTxt = (sale.items || []).map(i =>
            `• ${i.name} x${i.qty} = ${money(i.line_total ?? i.qty * i.unit_price)}`
          ).join('\n');
          const msg = [
            `*Comprobante Nº ${String(sale.number).padStart(5, '0')}*`,
            itemsTxt,
            '',
            sale.discount ? `Descuento: -${money(sale.discount)}${sale.discount_reason ? ` (${sale.discount_reason})` : ''}` : null,
            sale.finance_fee ? `Recargo ${METHODS[sale.method]?.[1] || sale.method} 8%: +${money(sale.finance_fee)}` : null,
            `*TOTAL: ${money(sale.total)}*`,
            `Pago: ${METHODS[sale.method]?.[1] || sale.method}`,
            '',
            '_Documento interno · Gracias por tu compra 💖_',
          ].filter(Boolean).join('\n');
          window.open(`https://wa.me/${p}?text=${encodeURIComponent(msg)}`, '_blank');
          try {
            await api(`/sales/${sale.id}/whatsapp-sent`, { method: 'POST', body: { phone } });
          } catch (_) {}
        }
      }
    } catch (e) {
      fail(e);
    }
  };

  return (
    <>
      {!cash && (
        <div className="card mb" style={{ background: 'var(--danger-bg)', borderColor: '#ffc3ca' }}>
          <b>La caja está cerrada.</b>{' '}
          Ábrela para poder registrar las ventas de hoy. No olvides cerrarla al final del día.{' '}
          <Link to="/cash"><u>Abrir caja</u></Link>
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
            <button className={`chip ${!cat ? 'on' : ''}`} onClick={() => setCat(0)}><Sparkles size={14} strokeWidth={2} style={{marginRight:4}} /> Todo</button>
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
                <div className="thumb">{p.image ? <img src={p.image} alt="" /> : (p.emoji || <ShoppingBag size={20} strokeWidth={1.5} style={{color:'var(--plum-soft)'}} />)}</div>
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
            <h3 style={{display:"flex",alignItems:"center",gap:8}}><ShoppingCart size={18} strokeWidth={2} /> Carrito</h3>
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
              <div className="empty"><div className="big"><ShoppingCart size={42} strokeWidth={1.5} style={{color:"var(--plum-soft)"}} /></div><p>Toca un producto o escanea un código para empezar</p></div>
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
              {Object.entries(METHODS).map(([k, [_, name]]) => (
                <button key={k} type="button" className={`chip ${payData.method === k ? 'on' : ''}`} onClick={() => setPayData(d => ({ ...d, method: k }))}>
                  {name}
                </button>
              ))}
            </div>
          </div>
          {FINANCE_METHODS.includes(payData.method) && (
            <p className="muted" style={{ fontSize: 13 }}>
              <b>Recargo 8%</b> por {METHODS[payData.method]?.[1] || payData.method}: {money(finance)}
              {disc > 0 ? ' (sobre el valor ya con descuento de lista).' : '.'}
              {' '}Total a cobrar: <b>{money(total)}</b>
            </p>
          )}
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

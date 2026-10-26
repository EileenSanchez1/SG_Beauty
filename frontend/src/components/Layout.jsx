import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { NAV, TITLES, money } from '../utils/format';
import { NavIcon, LogOut } from '../utils/icons';

export default function Layout() {
  const { user, cash, logout, isAdmin } = useApp();
  const [sideOpen, setSideOpen] = useState(false);
  const location = useLocation();
  const path = location.pathname.replace(/^\//, '') || (isAdmin() ? 'dashboard' : 'pos');
  const title = TITLES[path] || 'SG BEAUTY';

  const items = NAV.filter(n => {
    if (n[0] === 'sep') return n[2] ? isAdmin() : true;
    return n[3] ? isAdmin() : true;
  });

  return (
    <div className="shell">
      <aside className={`side ${sideOpen ? 'open' : ''}`} id="side">
        <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img 
            src="/logosg.jpg" 
            alt="SG Beauty Logo" 
            style={{ 
              width: '38px', 
              height: '38px', 
              borderRadius: '50%', 
              objectFit: 'cover',
              flexShrink: 0
            }} 
          />
          <div>
            <b>SG BEAUTY</b>
            <small>Gestión · Caja · Ventas</small>
          </div>
        </div>
        <nav className="nav">
          {items.map((n, i) =>
            n[0] === 'sep' ? (
              <div key={i} className="sep">{n[1]}</div>
            ) : (
              <NavLink
                key={n[0]}
                to={`/${n[0]}`}
                className={({ isActive }) => (isActive ? 'active' : '')}
                onClick={() => setSideOpen(false)}
              >
                <span className="ic"><NavIcon name={n[1]} size={18} /></span> {n[2]}
              </NavLink>
            )
          )}
        </nav>
        <div className="userbox">
          <div className="avatar">{user?.full_name?.[0] || '?'}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ display: 'block', fontSize: 14 }}>{user?.full_name}</b>
            <small className="muted">{isAdmin() ? 'Administrador' : 'Vendedor'}</small>
          </div>
          <button className="x" onClick={logout} title="Salir">
            <LogOut size={18} strokeWidth={2} />
          </button>
        </div>
      </aside>
      {sideOpen && <div className="overlay" onClick={() => setSideOpen(false)} style={{ zIndex: 40 }} />}
      <main className="main">
        <div className="topbar">
          <div className="gap">
            <button className="btn menu-btn" onClick={() => setSideOpen(o => !o)}>☰</button>
            <h1>{title}</h1>
          </div>
          <div className="gap">
            {cash ? (
              <span className="pill open">● Caja abierta · base {money(cash.base)}</span>
            ) : (
              <span className="pill closed">● Caja cerrada</span>
            )}
          </div>
        </div>
        <Outlet />
      </main>
    </div>
  );
}

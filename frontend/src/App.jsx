import { Routes, Route, Navigate } from 'react-router-dom';
import { useApp } from './context/AppContext';
import Login from './components/Login';
import Layout from './components/Layout';
import Toast from './components/Toast';
import Dashboard from './views/Dashboard';
import Pos from './views/Pos';
import Products from './views/Products';
import Categories from './views/Categories';
import Inventory from './views/Inventory';
import Labels from './views/Labels';
import Cash from './views/Cash';
import Close from './views/Close';
import Sales from './views/Sales';
import Reports from './views/Reports';
import Users from './views/Users';
import Settings from './views/Settings';
import Suppliers from './views/Suppliers';
import Movements from './views/Movements';
import Audit from './views/Audit';

function PrivateRoutes() {
  const { isAdmin } = useApp();
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/dashboard" element={isAdmin() ? <Dashboard /> : <Navigate to="/pos" replace />} />
        <Route path="/pos" element={<Pos />} />
        <Route path="/products" element={<Products />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/movements" element={<Movements />} />
        <Route path="/suppliers" element={<Suppliers />} />
        <Route path="/labels" element={<Labels />} />
        <Route path="/cash" element={<Cash />} />
        <Route path="/close" element={<Close />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="/users" element={<Users />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to={isAdmin() ? '/dashboard' : '/pos'} replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  const { user, loading } = useApp();

  if (loading) {
    return (
      <div className="login">
        <div className="login-card">
          <div className="logo">💖</div>
          <p className="muted">Cargando…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Toast />
      {user ? <PrivateRoutes /> : <Login />}
    </>
  );
}

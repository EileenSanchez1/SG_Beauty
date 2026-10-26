import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, getToken, setToken } from '../utils/api';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState({});
  const [categories, setCategories] = useState([]);
  const [cash, setCash] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((msg, type = '') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3800);
  }, []);

  const fail = useCallback(e => toast(e.message || 'Error', 'err'), [toast]);

  const loadCategories = useCallback(async () => {
    try {
      const cats = await api('/categories');
      setCategories(cats);
    } catch {}
  }, []);

  const refreshCash = useCallback(async () => {
    try {
      const c = await api('/cash/current');
      setCash(c);
      return c;
    } catch {
      setCash(null);
      return null;
    }
  }, []);

  const start = useCallback(async () => {
    try {
      const me = await api('/auth/me');
      setUser(me);
      const [sets] = await Promise.all([api('/settings'), loadCategories()]);
      setSettings(sets);
      await refreshCash();
      return true;
    } catch {
      setToken(null);
      setUser(null);
      return false;
    }
  }, [loadCategories, refreshCash]);

  useEffect(() => {
    (async () => {
      if (getToken()) {
        await start();
      }
      setLoading(false);
    })();
  }, [start]);

  const login = async (username, password) => {
    const r = await api('/auth/login', { method: 'POST', body: { username, password } });
    setToken(r.token);
    setUser(r.user);
    const [sets] = await Promise.all([api('/settings'), loadCategories()]);
    setSettings(sets);
    await refreshCash();
    return r.user;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setCash(undefined);
    setSettings({});
  };

  const isAdmin = () => user?.role === 'admin';

  return (
    <AppContext.Provider
      value={{
        user,
        settings,
        setSettings,
        categories,
        setCategories,
        cash,
        setCash,
        loading,
        toast,
        fail,
        login,
        logout,
        start,
        refreshCash,
        loadCategories,
        isAdmin,
        toasts,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}

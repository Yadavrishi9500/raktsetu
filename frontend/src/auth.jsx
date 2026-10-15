import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, profile: null, loading: Boolean(tokenStore.get()) });

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) return setState({ user: null, profile: null, loading: false });
    try {
      const { user, profile } = await api('/auth/me');
      setState({ user, profile, loading: false });
    } catch {
      tokenStore.clear();
      setState({ user: null, profile: null, loading: false });
    }
  }, []);

  useEffect(() => {
    refresh();
    const onLogout = () => setState({ user: null, profile: null, loading: false });
    window.addEventListener('raktsetu:logout', onLogout);
    return () => window.removeEventListener('raktsetu:logout', onLogout);
  }, [refresh]);

  const signIn = useCallback(async (path, body) => {
    const { token } = await api(path, { method: 'POST', body, auth: false });
    tokenStore.set(token);
    const me = await api('/auth/me');
    setState({ ...me, loading: false });
    return me.user;
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      refresh,
      login: (email, password) => signIn('/auth/login', { email, password }),
      registerDonor: (data) => signIn('/auth/register/donor', data),
      registerHospital: (data) => signIn('/auth/register/hospital', data),
      logout: () => {
        tokenStore.clear();
        setState({ user: null, profile: null, loading: false });
      },
    }),
    [state, refresh, signIn],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
export const homeFor = (role) => ({ donor: '/donor', hospital: '/hospital', admin: '/admin' })[role] || '/';

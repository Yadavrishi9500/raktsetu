import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { homeFor, useAuth } from '../auth.jsx';
import { Field, Notice } from '../components/ui.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={homeFor(user.role)} replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const u = await login(form.email, form.password);
      navigate(location.state?.from || homeFor(u.role), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel" style={{ maxWidth: 420, margin: '0 auto' }}>
      <h1>Sign in</h1>
      <Notice kind="error">{error}</Notice>
      <form onSubmit={submit} noValidate>
        <Field label="Email">
          <input type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </Field>
        <Field label="Password">
          <input type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        </Field>
        <button className="btn wide" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="small muted" style={{ marginTop: 16 }}>
        New here? <Link to="/register/donor">Register as a donor</Link> or <Link to="/register/hospital">register a hospital</Link>.
      </p>
    </div>
  );
}

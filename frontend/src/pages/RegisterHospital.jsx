import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import LocationField from '../components/LocationField.jsx';
import { Field, Notice } from '../components/ui.jsx';

export default function RegisterHospital() {
  const { registerHospital } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState({ hospitalName: '', licenseNo: '', address: '', city: '', lat: '', lng: '', name: '', phone: '+91', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setErrors({});
    try {
      await registerHospital({ ...f, lat: Number(f.lat), lng: Number(f.lng) });
      navigate('/hospital', { replace: true });
    } catch (err) {
      setError(err.message);
      setErrors(err.fields || {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel" style={{ maxWidth: 680, margin: '0 auto' }}>
      <h1>Register your hospital</h1>
      <p className="muted">An administrator checks your blood bank licence before you can raise requests. This usually takes one working day.</p>
      <Notice kind="error">{error}</Notice>
      <form onSubmit={submit} noValidate>
        <div className="row">
          <Field label="Hospital name" error={errors.hospitalName}><input value={f.hospitalName} onChange={set('hospitalName')} required /></Field>
          <Field label="Blood bank licence number" error={errors.licenseNo}><input value={f.licenseNo} onChange={set('licenseNo')} required /></Field>
        </div>
        <Field label="Address" error={errors.address}><input value={f.address} onChange={set('address')} required /></Field>
        <Field label="City" error={errors.city}><input value={f.city} onChange={set('city')} required /></Field>
        <LocationField lat={f.lat} lng={f.lng} errors={errors} label="Blood bank location (donors are matched by distance from here)" onChange={(p) => setF({ ...f, ...p })} />
        <h3 style={{ marginTop: 8 }}>Blood bank contact</h3>
        <div className="row">
          <Field label="Contact name" error={errors.name}><input value={f.name} onChange={set('name')} required /></Field>
          <Field label="Mobile number" error={errors.phone}><input type="tel" value={f.phone} onChange={set('phone')} required /></Field>
        </div>
        <div className="row">
          <Field label="Email" error={errors.email}><input type="email" autoComplete="email" value={f.email} onChange={set('email')} required /></Field>
          <Field label="Password" hint="8+ characters" error={errors.password}><input type="password" autoComplete="new-password" value={f.password} onChange={set('password')} required /></Field>
        </div>
        <button className="btn wide" disabled={busy}>{busy ? 'Submitting…' : 'Submit for verification'}</button>
      </form>
      <p className="small muted" style={{ marginTop: 16 }}>Already registered? <Link to="/login">Sign in</Link>.</p>
    </div>
  );
}

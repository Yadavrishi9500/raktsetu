import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import LocationField from '../components/LocationField.jsx';
import { Field, GroupPicker, Notice, Segmented } from '../components/ui.jsx';

const today = new Date().toISOString().slice(0, 10);

export default function RegisterDonor() {
  const { registerDonor } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState({
    name: '', email: '', password: '', phone: '+91', bloodGroup: '', sex: 'male', dateOfBirth: '',
    lat: '', lng: '', city: '', pincode: '', lastDonationDate: '', emailAlerts: true,
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function submit(e) {
    e.preventDefault();
    if (!f.bloodGroup) return setErrors({ bloodGroup: 'Choose your blood group' });
    setBusy(true);
    setError('');
    setErrors({});
    try {
      await registerDonor({ ...f, lat: Number(f.lat), lng: Number(f.lng) });
      navigate('/donor', { replace: true });
    } catch (err) {
      setError(err.message);
      setErrors(err.fields || {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel" style={{ maxWidth: 680, margin: '0 auto' }}>
      <h1>Become a donor</h1>
      <p className="muted">
        We only text you when a hospital near you needs your blood group and you are eligible to donate. You can pause alerts any time.
      </p>
      <Notice kind="error">{error}</Notice>
      <form onSubmit={submit} noValidate>
        <Field label="Blood group" error={errors.bloodGroup}>
          <GroupPicker value={f.bloodGroup} onChange={(g) => setF({ ...f, bloodGroup: g })} />
        </Field>
        <div className="row">
          <Field label="Full name" error={errors.name}><input autoComplete="name" value={f.name} onChange={set('name')} required /></Field>
          <Field label="Mobile number" hint="for SMS alerts" error={errors.phone}>
            <input type="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} placeholder="+919876543210" required />
          </Field>
        </div>
        <div className="row">
          <Field label="Email" error={errors.email}><input type="email" autoComplete="email" value={f.email} onChange={set('email')} required /></Field>
          <Field label="Password" hint="8+ characters" error={errors.password}>
            <input type="password" autoComplete="new-password" value={f.password} onChange={set('password')} required />
          </Field>
        </div>
        <div className="row">
          <Field label="Date of birth" hint="donors must be 18 to 65" error={errors.dateOfBirth}>
            <input type="date" max={today} value={f.dateOfBirth} onChange={set('dateOfBirth')} required />
          </Field>
          <Field label="Sex" hint="sets the donation gap" error={errors.sex}>
            <Segmented label="Sex" value={f.sex} onChange={(sex) => setF({ ...f, sex })} options={[['male', 'Male'], ['female', 'Female']]} />
          </Field>
        </div>
        <Field label="Last donation" hint="leave empty if never" error={errors.lastDonationDate}>
          <input type="date" max={today} value={f.lastDonationDate} onChange={set('lastDonationDate')} />
        </Field>
        <LocationField lat={f.lat} lng={f.lng} errors={errors} label="Where should we measure distance from? Usually home." onChange={(p) => setF({ ...f, ...p })} />
        <div className="row">
          <Field label="City" error={errors.city}><input value={f.city} onChange={set('city')} required /></Field>
          <Field label="PIN code" hint="optional" error={errors.pincode}><input inputMode="numeric" maxLength={6} value={f.pincode} onChange={set('pincode')} /></Field>
        </div>
        <label className="check">
          <input type="checkbox" checked={f.emailAlerts} onChange={set('emailAlerts')} />
          <span>Also email me alerts. You will get one email from AWS asking you to confirm.</span>
        </label>
        <button className="btn blood wide" disabled={busy}>{busy ? 'Creating your donor card…' : 'Register as a donor'}</button>
      </form>
      <p className="small muted" style={{ marginTop: 16 }}>Already registered? <Link to="/login">Sign in</Link>.</p>
    </div>
  );
}

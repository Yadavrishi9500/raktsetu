import { useState } from 'react';
import { Field } from './ui.jsx';

/** Browser geolocation with a manual fallback. Matching distance is measured from these coordinates. */
export default function LocationField({ lat, lng, onChange, errors = {}, label = 'Location' }) {
  const [status, setStatus] = useState('');

  function locate() {
    if (!navigator.geolocation) return setStatus('This browser cannot share location. Enter coordinates below.');
    setStatus('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({ lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) });
        setStatus(`Location set (accurate to about ${Math.round(pos.coords.accuracy)} m).`);
      },
      () => setStatus('Location permission was denied. Enter coordinates below, or allow location and try again.'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <fieldset style={{ border: 0, padding: 0, margin: '0 0 8px' }}>
      <legend className="small" style={{ fontWeight: 600, marginBottom: 6 }}>{label}</legend>
      <div className="toolbar" style={{ marginBottom: 8 }}>
        <button type="button" className="btn ghost small" onClick={locate}>Use my current location</button>
        <span className="small muted" aria-live="polite">{status}</span>
      </div>
      <div className="row">
        <Field label="Latitude" error={errors.lat}>
          <input inputMode="decimal" value={lat} onChange={(e) => onChange({ lat: e.target.value, lng })} required />
        </Field>
        <Field label="Longitude" error={errors.lng}>
          <input inputMode="decimal" value={lng} onChange={(e) => onChange({ lat, lng: e.target.value })} required />
        </Field>
      </div>
    </fieldset>
  );
}

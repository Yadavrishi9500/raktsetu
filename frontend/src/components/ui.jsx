import { ALERT_LABEL, REQUEST_LABEL, URGENCY_LABEL } from '../format.js';
import { BLOOD_GROUPS } from '../constants.js';

export function Field({ label, hint, error, children }) {
  return (
    <label className="field">
      <span>
        {label} {hint && <span className="hint">{hint}</span>}
      </span>
      {children}
      {error && <span className="err">{Array.isArray(error) ? error[0] : error}</span>}
    </label>
  );
}

export function Notice({ kind = 'warn', children }) {
  if (!children) return null;
  return (
    <div className={`notice ${kind === 'warn' ? '' : kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <p>{children}</p>
    </div>
  );
}

export const UrgencyPill = ({ urgency }) => <span className={`pill ${urgency}`}>{URGENCY_LABEL[urgency]}</span>;
export const AlertPill = ({ status }) => <span className={`pill ${status}`}>{ALERT_LABEL[status]}</span>;
export const RequestPill = ({ status }) => <span className={`pill ${status}`}>{REQUEST_LABEL[status]}</span>;

export function GroupPicker({ value, onChange }) {
  return (
    <div className="group-picker" role="radiogroup" aria-label="Blood group">
      {BLOOD_GROUPS.map((g) => (
        <button key={g} type="button" role="radio" aria-checked={value === g} aria-pressed={value === g} onClick={() => onChange(g)}>
          {g.replace('-', '\u2212')}
        </button>
      ))}
    </div>
  );
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

export function UnitsBar({ needed, accepted = 0, donated = 0 }) {
  return (
    <div className="units" aria-label={`${donated} donated, ${accepted} on the way, ${needed} needed`}>
      {Array.from({ length: needed }, (_, i) => (
        <span key={i} className={`unit ${i < donated ? 'donated' : i < donated + accepted ? 'accepted' : ''}`} />
      ))}
    </div>
  );
}

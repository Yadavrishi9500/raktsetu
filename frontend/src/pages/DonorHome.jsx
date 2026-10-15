import { useState } from 'react';
import { api } from '../api.js';
import BloodTag from '../components/BloodTag.jsx';
import { AlertPill, Notice, UrgencyPill } from '../components/ui.jsx';
import { fmtDate, fmtGroup, mapsLink, timeAgo } from '../format.js';
import { usePolling } from '../hooks.js';

const ETAS = [15, 30, 45, 60];

function AlertItem({ a, onRespond }) {
  const [eta, setEta] = useState(30);
  const [busy, setBusy] = useState(false);
  const live = a.request_status === 'open';
  const act = async (response) => {
    setBusy(true);
    try { await onRespond(a.id, response, eta); } finally { setBusy(false); }
  };
  return (
    <li>
      <div className="request-row" style={{ alignItems: 'flex-start' }}>
        <BloodTag group={a.blood_group} size="sm" />
        <div className="meta">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <strong>{a.hospital_name}</strong>
            <UrgencyPill urgency={a.urgency} />
            <AlertPill status={a.status} />
            {!live && <span className="pill">{a.request_status === 'fulfilled' ? 'Filled' : 'Closed'}</span>}
          </div>
          <div className="small muted">
            {fmtGroup(a.blood_group)}, {a.units_needed} unit{a.units_needed > 1 ? 's' : ''}. {a.distance_km} km away. Alerted {timeAgo(a.sent_at)}.
          </div>
          {a.note && <div className="small">“{a.note}”</div>}
          {live && a.status === 'sent' && (
            <div style={{ marginTop: 10 }}>
              <div className="small" style={{ fontWeight: 600 }}>When can you get there?</div>
              <div className="eta" style={{ maxWidth: 360 }}>
                {ETAS.map((m) => (
                  <button key={m} type="button" aria-pressed={eta === m} onClick={() => setEta(m)}>{m} min</button>
                ))}
              </div>
              <div className="toolbar">
                <button className="btn blood small" disabled={busy} onClick={() => act('accept')}>I'm coming</button>
                <button className="btn ghost small" disabled={busy} onClick={() => act('decline')}>I can't make it</button>
              </div>
            </div>
          )}
          {live && a.status === 'accepted' && (
            <div className="toolbar" style={{ marginTop: 8 }}>
              <a className="btn small" href={mapsLink(a.lat, a.lng)} target="_blank" rel="noreferrer">Directions</a>
              <span className="small muted">{a.address}, {a.city}</span>
              <button className="btn ghost small" disabled={busy} onClick={() => act('decline')}>I can no longer come</button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

export default function DonorHome() {
  const profile = usePolling(() => api('/donors/me'), 0);
  const alerts = usePolling(() => api('/donors/me/alerts'), 15_000);
  const [error, setError] = useState('');
  const p = profile.data;

  async function patch(body) {
    setError('');
    try { profile.setData(await api('/donors/me', { method: 'PATCH', body })); } catch (err) { setError(err.message); }
  }

  async function respond(id, response, etaMinutes) {
    setError('');
    try {
      await api(`/donors/me/alerts/${id}/respond`, { method: 'POST', body: { response, etaMinutes } });
    } catch (err) {
      setError(err.message);
    }
    alerts.reload();
  }

  if (profile.error) return <Notice kind="error">{profile.error.message}</Notice>;
  if (!p) return <p className="muted">Loading your donor card…</p>;

  const eligibilityText = p.eligible
    ? 'You can donate now.'
    : p.eligibilityReason === 'cooldown'
      ? `You can donate again from ${fmtDate(p.nextEligibleDate)}. We won't alert you before then.`
      : 'You are outside the 18 to 65 donor age range, so we will not send alerts.';

  return (
    <div className="grid-2">
      <aside>
        <div className="panel">
          <BloodTag group={p.bloodGroup} size="lg" caption={p.eligible ? 'Ready to donate' : 'Resting'} />
          <p style={{ marginTop: 16 }}>{eligibilityText}</p>
          <div className="stat-row" style={{ marginBottom: 16 }}>
            <div className="stat"><strong>{p.totalDonations}</strong><span>donations</span></div>
            {p.lastDonationDate && <div className="stat"><strong style={{ fontSize: 'var(--step-1)' }}>{fmtDate(p.lastDonationDate)}</strong><span>last donation</span></div>}
          </div>
          <label className="check">
            <input type="checkbox" checked={p.available} onChange={(e) => patch({ available: e.target.checked })} />
            <span><strong>Send me alerts</strong><br /><span className="small muted">Turn off while travelling or unwell.</span></span>
          </label>
          <label className="check">
            <input type="checkbox" checked={p.emailAlerts} onChange={(e) => patch({ emailAlerts: e.target.checked })} />
            <span>
              <strong>Email alerts</strong>
              <br />
              <span className="small muted">{p.emailStatus === 'pending' ? 'Check your inbox and confirm the AWS email.' : 'SMS is always on.'}</span>
            </span>
          </label>
          <p className="small muted" style={{ margin: 0 }}>Matching from {p.city}{p.pincode ? ` ${p.pincode}` : ''}.</p>
        </div>
      </aside>
      <section className="panel">
        <h2>Requests sent to you</h2>
        <Notice kind="error">{error}</Notice>
        {alerts.data?.length === 0 && (
          <p className="muted">No requests yet. When a hospital near you needs {fmtGroup(p.bloodGroup)} or a compatible group, it will appear here and on your phone.</p>
        )}
        <ul className="list">
          {alerts.data?.map((a) => <AlertItem key={a.id} a={a} onRespond={respond} />)}
        </ul>
      </section>
    </div>
  );
}

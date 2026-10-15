import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import BloodTag from '../components/BloodTag.jsx';
import { Field, GroupPicker, Notice, RequestPill, Segmented, UnitsBar, UrgencyPill } from '../components/ui.jsx';
import { plural, timeAgo } from '../format.js';
import { usePolling } from '../hooks.js';

function NewRequest({ onCreated }) {
  const [f, setF] = useState({ bloodGroup: '', unitsNeeded: 1, urgency: 'urgent', note: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!f.bloodGroup) return setError('Choose the blood group you need.');
    setBusy(true);
    setError('');
    try {
      await api('/requests', { method: 'POST', body: f });
      setF({ bloodGroup: '', unitsNeeded: 1, urgency: 'urgent', note: '' });
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit} noValidate>
      <h2>Raise a request</h2>
      <Notice kind="error">{error}</Notice>
      <Field label="Blood group needed">
        <GroupPicker value={f.bloodGroup} onChange={(bloodGroup) => setF({ ...f, bloodGroup })} />
      </Field>
      <Field label="Units">
        <input type="number" min={1} max={20} value={f.unitsNeeded} onChange={(e) => setF({ ...f, unitsNeeded: Number(e.target.value) })} />
      </Field>
      <Field label="Urgency" hint="sets how fast the search widens">
        <Segmented label="Urgency" value={f.urgency} onChange={(urgency) => setF({ ...f, urgency })} options={[['critical', 'Critical'], ['urgent', 'Urgent'], ['scheduled', 'Scheduled']]} />
      </Field>
      <Field label="Note for donors" hint="optional, no patient names">
        <textarea maxLength={280} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. Come to the blood bank on the ground floor, Gate 2" />
      </Field>
      <button className="btn blood wide" disabled={busy}>{busy ? 'Alerting donors…' : 'Alert matching donors'}</button>
    </form>
  );
}

export default function HospitalHome() {
  const { profile } = useAuth();
  const requests = usePolling(() => api('/requests'), 10_000);
  const verified = profile?.verified;

  return (
    <div className="grid-2">
      <aside>
        {verified ? (
          <NewRequest onCreated={requests.reload} />
        ) : (
          <div className="panel">
            <h2>Awaiting verification</h2>
            <p>An administrator is checking licence {profile?.licenseNo}. You can raise requests as soon as {profile?.hospitalName} is verified, and we'll text you when it is.</p>
          </div>
        )}
      </aside>
      <section className="panel">
        <div className="toolbar">
          <h2 style={{ margin: 0 }}>{profile?.hospitalName || 'Requests'}</h2>
          <span className="spacer" />
          <span className="small muted">Updates every 10 seconds</span>
        </div>
        <Notice kind="error">{requests.error?.message}</Notice>
        {requests.data?.length === 0 && <p className="muted">No requests yet. Raised requests and donor responses will appear here.</p>}
        <ul className="list">
          {requests.data?.map((r) => (
            <li key={r.id}>
              <div className="request-row">
                <BloodTag group={r.blood_group} size="sm" />
                <div className="meta">
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Link className="title" to={`/hospital/requests/${r.id}`}>Request #{r.id}</Link>
                    <UrgencyPill urgency={r.urgency} />
                    <RequestPill status={r.status} />
                  </div>
                  <div className="small muted">
                    Raised {timeAgo(r.created_at)}. {plural(r.alerted, 'donor')} alerted, {r.accepted} coming, {r.donated} donated.
                    {r.status === 'open' && r.radius_km > 0 && ` Searching within ${r.radius_km} km.`}
                  </div>
                </div>
                <UnitsBar needed={r.units_needed} accepted={r.accepted} donated={r.donated} />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

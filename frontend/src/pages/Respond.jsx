import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import BloodTag from '../components/BloodTag.jsx';
import { Notice, UrgencyPill } from '../components/ui.jsx';
import { fmtGroup, mapsLink, plural, timeAgo } from '../format.js';

const ETAS = [15, 30, 45, 60];

export default function Respond() {
  const { token } = useParams();
  const [a, setA] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [eta, setEta] = useState(30);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/alerts/${token}`, { auth: false }).then(setA).catch((err) => setLoadError(err.message));
  }, [token]);

  async function respond(response) {
    setBusy(true);
    setError('');
    try {
      setA(await api(`/alerts/${token}/respond`, { method: 'POST', auth: false, body: { response, etaMinutes: eta } }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="respond panel">
        <h1>This link does not work</h1>
        <p>It may be mistyped or incomplete. Open the link from your SMS again, or sign in to see requests sent to you.</p>
      </div>
    );
  }
  if (!a) return <p className="muted respond">Loading…</p>;

  const { request: r, hospital: h } = a;
  const open = r.status === 'open';

  return (
    <div className="respond">
      <div className="panel respond-card">
        <div className="respond-head">
          <BloodTag group={r.bloodGroup} size="md" caption={`${a.distanceKm} km from you`} />
          <div>
            <UrgencyPill urgency={r.urgency} />
            <h1 style={{ fontSize: 'var(--step-2)', margin: '8px 0 4px' }}>{h.name}</h1>
            <div className="small muted">{h.address}, {h.city}</div>
          </div>
        </div>

        {a.status === 'accepted' && open ? (
          <>
            <Notice kind="ok">Thank you, {a.donorFirstName}. The blood bank knows you are coming{a.etaMinutes ? ` in about ${a.etaMinutes} minutes` : ''}.</Notice>
            <div className="stack">
              <a className="btn blood wide" href={mapsLink(h.lat, h.lng)} target="_blank" rel="noreferrer">Get directions</a>
              <p className="small muted" style={{ margin: 0 }}>Carry a photo ID. Eat a light meal and drink water before you donate.</p>
              <button className="btn ghost wide" disabled={busy} onClick={() => respond('decline')}>I can no longer come</button>
            </div>
          </>
        ) : a.status === 'declined' && open ? (
          <>
            <p>Thanks for letting the hospital know, {a.donorFirstName}. We'll keep looking for other donors.</p>
            <button className="btn ghost wide" disabled={busy} onClick={() => respond('accept')}>Actually, I can come</button>
          </>
        ) : a.status === 'donated' ? (
          <Notice kind="ok">You donated for this request. Thank you, {a.donorFirstName}.</Notice>
        ) : !open ? (
          <p>This request is {r.status === 'fulfilled' ? 'already covered by other donors' : r.status}. You don't need to go. Thank you for checking, {a.donorFirstName}.</p>
        ) : (
          <>
            <p>
              Hi {a.donorFirstName}, {h.name} needs {r.unitsNeeded} unit{r.unitsNeeded > 1 ? 's' : ''} of {fmtGroup(r.bloodGroup)} blood
              {r.committed > 0 && ` (${plural(r.committed, 'donor')} already on the way)`}. Raised {timeAgo(r.createdAt)}.
            </p>
            {r.note && <p className="small">Note from the hospital: {r.note}</p>}
            <Notice kind="error">{error}</Notice>
            <div className="small" style={{ fontWeight: 600 }}>When can you get there?</div>
            <div className="eta">
              {ETAS.map((m) => (
                <button key={m} type="button" aria-pressed={eta === m} onClick={() => setEta(m)}>{m} min</button>
              ))}
            </div>
            <div className="stack">
              <button className="btn blood wide" disabled={busy} onClick={() => respond('accept')}>I'm coming</button>
              <button className="btn ghost wide" disabled={busy} onClick={() => respond('decline')}>I can't make it</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

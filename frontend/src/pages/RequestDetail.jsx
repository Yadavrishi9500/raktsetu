import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import BloodTag from '../components/BloodTag.jsx';
import { AlertPill, Notice, RequestPill, UnitsBar, UrgencyPill } from '../components/ui.jsx';
import { fmtGroup, timeAgo } from '../format.js';
import { usePolling } from '../hooks.js';

export default function RequestDetail() {
  const { id } = useParams();
  const { data: r, error, reload } = usePolling(() => api(`/requests/${id}`), 5_000, [id]);
  const [actionError, setActionError] = useState('');

  async function act(path, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return;
    setActionError('');
    try {
      await api(`/requests/${id}${path}`, { method: 'POST', body: {} });
      reload();
    } catch (err) {
      setActionError(err.message);
    }
  }

  if (error) return <Notice kind="error">{error.message}</Notice>;
  if (!r) return <p className="muted">Loading request…</p>;

  const open = r.status === 'open';
  const maxRounds = r.radiiKm.length;
  const remaining = Math.max(r.units_needed - r.accepted - r.donated, 0);

  return (
    <>
      <p className="small"><Link to="/hospital">All requests</Link></p>
      <div className="panel">
        <div className="request-row" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <BloodTag group={r.blood_group} size="md" caption={`${r.units_needed} unit${r.units_needed > 1 ? 's' : ''}`} />
          <div className="meta">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
              <h1 style={{ margin: 0, fontSize: 'var(--step-2)' }}>Request #{r.id}</h1>
              <UrgencyPill urgency={r.urgency} />
              <RequestPill status={r.status} />
            </div>
            <p className="muted" style={{ marginBottom: 12 }}>
              {fmtGroup(r.blood_group)} raised {timeAgo(r.created_at)}.
              {open && r.round > 0 && ` Search round ${r.round} of ${maxRounds}, within ${r.radius_km} km.`}
              {open && r.round === 0 && ' Finding donors…'}
              {open && r.admin_notified && ' Every eligible donor in range has been alerted; our team is following up.'}
            </p>
            <UnitsBar needed={r.units_needed} accepted={r.accepted} donated={r.donated} />
            <div className="stat-row" style={{ marginTop: 16 }}>
              <div className="stat"><strong>{r.alerted}</strong><span>alerted</span></div>
              <div className="stat"><strong>{r.accepted}</strong><span>on the way</span></div>
              <div className="stat"><strong>{r.donated}</strong><span>donated</span></div>
              {open && <div className="stat"><strong>{remaining}</strong><span>still needed</span></div>}
            </div>
            {r.note && <p className="small" style={{ marginTop: 12 }}>Note to donors: {r.note}</p>}
          </div>
          {open && <button className="btn ghost small" onClick={() => act('/cancel', 'Cancel this request? Donors who said they are coming will be told to stand down.')}>Cancel request</button>}
        </div>
      </div>

      <div className="panel">
        <h2>Donors</h2>
        <Notice kind="error">{actionError}</Notice>
        {r.alerts.length === 0 && <p className="muted">No donors alerted yet. The first round goes out within a few seconds.</p>}
        {r.alerts.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Donor</th><th>Group</th><th>Distance</th><th>Status</th><th>Arriving</th><th>Contact</th><th><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {r.alerts.map((a) => (
                  <tr key={a.id} className={a.status === 'accepted' ? 'pulse' : ''}>
                    <td>{a.name}<div className="muted">round {a.round}</div></td>
                    <td><strong>{fmtGroup(a.blood_group)}</strong></td>
                    <td>{a.distance_km} km</td>
                    <td><AlertPill status={a.status} /></td>
                    <td>{a.status === 'accepted' && a.eta_minutes ? `in ~${a.eta_minutes} min (${timeAgo(a.responded_at)})` : ''}</td>
                    <td>{a.phone ? <a href={`tel:${a.phone}`}>{a.phone}</a> : <span className="muted">shown after they accept</span>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {a.status === 'accepted' && (
                        <>
                          <button className="btn small" onClick={() => act(`/alerts/${a.id}/donated`)}>Mark donated</button>{' '}
                          {open && <button className="btn ghost small" onClick={() => act(`/alerts/${a.id}/no-show`, `Mark ${a.name} as not arrived? The search will continue.`)}>Did not arrive</button>}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

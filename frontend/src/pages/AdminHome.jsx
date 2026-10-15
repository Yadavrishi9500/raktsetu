import { useState } from 'react';
import { api } from '../api.js';
import { Notice } from '../components/ui.jsx';
import { fmtGroup, timeAgo } from '../format.js';
import { usePolling } from '../hooks.js';

function Linkified({ text }) {
  return text.split(/(https?:\/\/\S+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? <a key={i} href={part} target="_blank" rel="noreferrer">{part}</a> : part,
  );
}

export default function AdminHome() {
  const stats = usePolling(() => api('/admin/stats'), 30_000);
  const pending = usePolling(() => api('/admin/hospitals?status=pending'), 30_000);
  const log = usePolling(() => api('/admin/notifications?limit=40'), 5_000);
  const [error, setError] = useState('');

  async function verify(id) {
    setError('');
    try {
      await api(`/admin/hospitals/${id}/verify`, { method: 'POST', body: {} });
      pending.reload();
    } catch (err) {
      setError(err.message);
    }
  }

  const s = stats.data;
  return (
    <>
      <h1>Admin</h1>
      <Notice kind="error">{error}</Notice>
      {s && (
        <div className="panel">
          <div className="stat-row">
            <div className="stat"><strong>{s.requests.open}</strong><span>open requests</span></div>
            <div className="stat"><strong>{s.requests.fulfilled_30d}</strong><span>fulfilled, 30 days</span></div>
            <div className="stat"><strong>{s.requests.expired_30d}</strong><span>expired, 30 days</span></div>
            <div className="stat"><strong>{s.median_minutes_to_first_accept ?? 'n/a'}</strong><span>median minutes to first donor</span></div>
          </div>
          <div className="stat-row" style={{ marginTop: 20 }}>
            {s.bloodGroups.map((g) => (
              <div className="stat" key={g.blood_group}>
                <strong>{fmtGroup(g.blood_group)}</strong>
                <span>{g.available} of {g.donors} available</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <h2>Hospitals awaiting verification</h2>
        {pending.data?.length === 0 && <p className="muted">No hospitals are waiting.</p>}
        <ul className="list">
          {pending.data?.map((h) => (
            <li key={h.user_id} className="request-row">
              <div className="meta">
                <strong>{h.hospital_name}</strong>, {h.city}
                <div className="small muted">Licence {h.license_no}. {h.contact_name}, {h.phone}, {h.email}. Registered {timeAgo(h.created_at)}.</div>
              </div>
              <button className="btn small" onClick={() => verify(h.user_id)}>Verify hospital</button>
            </li>
          ))}
        </ul>
      </div>

      <div className="panel">
        <div className="toolbar">
          <h2 style={{ margin: 0 }}>Notification log</h2>
          <span className="spacer" />
          <span className="small muted">Every SMS, email and admin alert. In log mode, open the links here to act as a donor.</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Channel</th><th>To</th><th>Message</th><th>Result</th></tr></thead>
            <tbody>
              {log.data?.map((n) => (
                <tr key={n.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{timeAgo(n.created_at)}</td>
                  <td>{n.channel}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{n.recipient}</td>
                  <td>{n.subject && <strong>{n.subject}<br /></strong>}<Linkified text={n.body} /></td>
                  <td>{n.error ? <span style={{ color: 'var(--blood)' }}>{n.error}</span> : n.mode === 'sns' ? 'Sent via SNS' : 'Logged'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

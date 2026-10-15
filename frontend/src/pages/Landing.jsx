import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api.js';
import { homeFor, useAuth } from '../auth.jsx';
import BloodTag from '../components/BloodTag.jsx';

export default function Landing() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  useEffect(() => {
    api('/public/stats', { auth: false }).then(setStats).catch(() => {});
  }, []);
  if (user) return <Navigate to={homeFor(user.role)} replace />;

  return (
    <>
      <section className="hero">
        <div>
          <h1>When a hospital needs blood, nearby donors know in minutes.</h1>
          <p className="hero-lede">
            RaktSetu texts compatible, eligible donors close to the hospital. One tap tells the blood bank who is coming.
            If too few respond, the search widens on its own.
          </p>
          <div className="hero-actions">
            <Link className="btn blood" to="/register/donor">Register as a donor</Link>
            <Link className="btn ghost" to="/register/hospital">Register your hospital</Link>
          </div>
          {stats && (
            <div className="stat-row" style={{ marginTop: 36 }}>
              <div className="stat"><strong>{stats.donors}</strong><span>registered donors</span></div>
              <div className="stat"><strong>{stats.fulfilled}</strong><span>requests fulfilled</span></div>
              <div className="stat"><strong>{stats.units_donated}</strong><span>units donated</span></div>
            </div>
          )}
        </div>
        <div className="hero-alert" aria-hidden="true">
          <BloodTag group="O-" size="lg" caption="Needed 3.2 km away" />
          <div className="sms">
            <b>RaktSetu</b>
            URGENT: O- blood needed at City Care Hospital, 3.2 km away. Can you donate? raktsetu.app/r/…
          </div>
        </div>
      </section>

      <section aria-labelledby="how">
        <h2 id="how">How a request reaches you</h2>
        <ol className="steps">
          <li><h3>The hospital raises a request</h3><p>Blood group, units and urgency. Only verified hospitals can post.</p></li>
          <li><h3>Matched donors get an SMS</h3><p>Compatible blood group, past the donation cooldown, nearest first.</p></li>
          <li><h3>You tap to answer</h3><p>Say you are coming and when. The blood bank sees it instantly.</p></li>
          <li><h3>The search widens if needed</h3><p>5 km, then 10, 25 and 50, until enough donors say yes.</p></li>
        </ol>
      </section>
    </>
  );
}

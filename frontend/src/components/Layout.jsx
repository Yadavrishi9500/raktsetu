import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { homeFor, useAuth } from '../auth.jsx';

function Drop() {
  return (
    <svg width="20" height="20" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 3c5 7 9 11.5 9 16.5a9 9 0 0 1-18 0C7 14.5 11 10 16 3z" fill="#A3112A" />
      <path d="M12 19.5h8M16 15.5v8" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <>
      <div className="topband" />
      <header className="header">
        <div className="header-inner">
          <Link to={user ? homeFor(user.role) : '/'} className="wordmark">
            <Drop /> RaktSetu
          </Link>
          <nav className="nav" aria-label="Main">
            {!user && (
              <>
                <NavLink to="/register/donor">Become a donor</NavLink>
                <NavLink to="/register/hospital">For hospitals</NavLink>
                <NavLink to="/login">Sign in</NavLink>
              </>
            )}
            {user && (
              <>
                <NavLink to={homeFor(user.role)} end>
                  {user.role === 'donor' ? 'My donor card' : user.role === 'hospital' ? 'Blood requests' : 'Admin'}
                </NavLink>
                <span className="small muted">{user.name}</span>
                <button type="button" className="btn ghost small" onClick={() => { logout(); navigate('/'); }}>
                  Sign out
                </button>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="page" id="main">
        <Outlet />
      </main>
    </>
  );
}

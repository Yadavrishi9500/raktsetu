import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { homeFor, useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import AdminHome from './pages/AdminHome.jsx';
import DonorHome from './pages/DonorHome.jsx';
import HospitalHome from './pages/HospitalHome.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import RegisterDonor from './pages/RegisterDonor.jsx';
import RegisterHospital from './pages/RegisterHospital.jsx';
import RequestDetail from './pages/RequestDetail.jsx';
import Respond from './pages/Respond.jsx';

function RequireRole({ role, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p className="muted">Loading…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.role !== role && !(role === 'hospital' && user.role === 'admin')) return <Navigate to={homeFor(user.role)} replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        <Route path="login" element={<Login />} />
        <Route path="register/donor" element={<RegisterDonor />} />
        <Route path="register/hospital" element={<RegisterHospital />} />
        <Route path="r/:token" element={<Respond />} />
        <Route path="donor" element={<RequireRole role="donor"><DonorHome /></RequireRole>} />
        <Route path="hospital" element={<RequireRole role="hospital"><HospitalHome /></RequireRole>} />
        <Route path="hospital/requests/:id" element={<RequireRole role="hospital"><RequestDetail /></RequireRole>} />
        <Route path="admin" element={<RequireRole role="admin"><AdminHome /></RequireRole>} />
        <Route path="*" element={<div className="panel"><h1>Page not found</h1><p>Check the address, or go back to the <a href="/">home page</a>.</p></div>} />
      </Route>
    </Routes>
  );
}

import { useMemo, useState } from 'react';
import { API_BASE_URL, sendOtp, verifyOtp } from './api';
import LoginScreen from './components/LoginScreen';
import RegisterSalesTab from './components/RegisterSalesTab';
import RegisterWasherTab from './components/RegisterWasherTab';
import PlanManagementTab from './components/PlanManagementTab';
import VerifyOtpScreen from './components/VerifyOtpScreen';
import WasherMonthlyCountsTab from './components/WasherMonthlyCountsTab';
import OperationsDashboardTab from './components/OperationsDashboardTab';
import type { AuthUser } from './types';

const TOKEN_KEY = 'admin_access_token';
const USER_KEY = 'admin_user';

type Page = 'landing' | 'login' | 'verify' | 'ops' | 'washer' | 'sales' | 'plans' | 'counts';

function getStoredToken(): string {
  return sessionStorage.getItem(TOKEN_KEY) || '';
}

function getStoredUser(): AuthUser | null {
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export default function App() {
  const [token, setToken] = useState<string>(getStoredToken);
  const [user, setUser] = useState<AuthUser | null>(getStoredUser);
  const [page, setPage] = useState<Page>(() => (getStoredToken() ? 'washer' : 'landing'));

  const [phone, setPhone] = useState<string>('');
  const [otp, setOtp] = useState<string>('');
  const [authMessage, setAuthMessage] = useState<string>('');

  const isAdmin = user?.role === 'ADMIN';

  const authHint = useMemo(() => {
    if (!token) return 'Authenticate with admin OTP, or paste an admin JWT token.';
    if (!user) return 'Token is set. If actions fail, verify token belongs to ADMIN.';
    if (!isAdmin) return `Logged in as ${user.role}. ADMIN role is required.`;
    return `Logged in as ADMIN (${user.phone}).`;
  }, [token, user, isAdmin]);

  const onSendOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthMessage('');
    try {
      await sendOtp(phone.trim());
      setAuthMessage('OTP sent. Please verify.');
      setPage('verify');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAuthMessage(`Send OTP failed: ${message}`);
    }
  };

  const onVerifyOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthMessage('');
    try {
      const data = await verifyOtp(phone.trim(), otp.trim(), 'admin-web-ts');
      sessionStorage.setItem(TOKEN_KEY, data.accessToken);
      sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
      setToken(data.accessToken);
      setUser(data.user);
      setAuthMessage('Authenticated successfully.');
      setPage('washer');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAuthMessage(`Verify OTP failed: ${message}`);
    }
  };

  const onTokenChange = (value: string) => {
    const next = value.trim();
    setToken(next);
    if (next) {
      sessionStorage.setItem(TOKEN_KEY, next);
      if (page === 'landing' || page === 'login' || page === 'verify') setPage('washer');
    } else {
      sessionStorage.removeItem(TOKEN_KEY);
      setPage('landing');
    }
  };

  const logout = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    setToken('');
    setUser(null);
    setAuthMessage('Logged out.');
    setPage('landing');
  };

  return (
    <div className="page">
      <main className="container">
        <h1>Car Wash Admin (TypeScript)</h1>
        <p className="muted">API base: {API_BASE_URL}</p>

        {!(page === 'landing' || page === 'login' || page === 'verify') ? (
          <section className="card">
            <h2>Navigation</h2>
            <div className="tabs">
              <button type="button" className={page === 'washer' ? 'tab active' : 'tab'} onClick={() => setPage('washer')}>
                Biker Registration
              </button>
              <button type="button" className={page === 'ops' ? 'tab active' : 'tab'} onClick={() => setPage('ops')}>
                Live Operations
              </button>
              <button type="button" className={page === 'sales' ? 'tab active' : 'tab'} onClick={() => setPage('sales')}>
                Sales Registration
              </button>
              <button type="button" className={page === 'plans' ? 'tab active' : 'tab'} onClick={() => setPage('plans')}>
                Plan Management
              </button>
              <button type="button" className={page === 'counts' ? 'tab active' : 'tab'} onClick={() => setPage('counts')}>
                Biker Monthly Counts
              </button>
              <button className="secondary" type="button" onClick={logout}>
                Logout
              </button>
            </div>
          </section>
        ) : null}

        {page === 'landing' ? (
          <section className="card">
            <h2>Welcome</h2>
            <p className="hint">Admin portal for biker, sales, and plan management.</p>
            <div className="actions">
              <button type="button" onClick={() => setPage('login')}>
                Login
              </button>
            </div>
            {authMessage ? <p className="status">{authMessage}</p> : null}
          </section>
        ) : null}

        {page === 'login' ? (
          <LoginScreen
            phone={phone}
            authMessage={authMessage}
            onPhoneChange={setPhone}
            onSendOtp={onSendOtp}
            onBack={() => setPage('landing')}
          />
        ) : null}

        {page === 'verify' ? (
          <VerifyOtpScreen
            phone={phone}
            otp={otp}
            token={token}
            authHint={authHint}
            authMessage={authMessage}
            isAdmin={isAdmin}
            onPhoneChange={setPhone}
            onOtpChange={setOtp}
            onTokenChange={onTokenChange}
            onVerifyOtp={onVerifyOtp}
            onBackToLogin={() => setPage('login')}
          />
        ) : null}

        {page === 'washer' ? (
          <section className="card">
            <RegisterWasherTab token={token} isAdmin={isAdmin} />
          </section>
        ) : null}

        {page === 'ops' ? (
          <section className="card">
            <OperationsDashboardTab token={token} isAdmin={isAdmin} />
          </section>
        ) : null}

        {page === 'sales' ? (
          <section className="card">
            <RegisterSalesTab token={token} isAdmin={isAdmin} />
          </section>
        ) : null}

        {page === 'plans' ? (
          <section className="card">
            <PlanManagementTab token={token} isAdmin={isAdmin} />
          </section>
        ) : null}

        {page === 'counts' ? (
          <section className="card">
            <WasherMonthlyCountsTab token={token} isAdmin={isAdmin} />
          </section>
        ) : null}
      </main>
    </div>
  );
}

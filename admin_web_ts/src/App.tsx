import { useEffect, useMemo, useState } from 'react';
import {
  getOperationsDashboard,
  getSalesMonthlyCommissions,
  listPlans,
  sendOtp,
  verifyOtp,
} from './api';
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

type Page = 'landing' | 'login' | 'verify' | 'dashboard' | 'ops' | 'washer' | 'sales' | 'plans' | 'counts';

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
  const [page, setPage] = useState<Page>(() => (getStoredToken() ? 'dashboard' : 'landing'));

  const [phone, setPhone] = useState<string>('');
  const [otp, setOtp] = useState<string>('');
  const [authMessage, setAuthMessage] = useState<string>('');
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState('');
  const [dashboardStats, setDashboardStats] = useState({
    totalPlans: 0,
    activePlans: 0,
    salesPeople: 0,
    revenueThisMonth: 0,
    activeWashRequests: 0,
    onlineBikers: 0,
    pendingOwnerConfirmations: 0,
    failedJobs: 0,
  });

  const isAdmin = user?.role === 'ADMIN';
  const isAuthPage = page === 'landing' || page === 'login' || page === 'verify';

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
      setPage('dashboard');
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
      if (page === 'landing' || page === 'login' || page === 'verify') setPage('dashboard');
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

  useEffect(() => {
    if (!token || isAuthPage || !isAdmin) return;

    let alive = true;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const loadDashboardStats = async () => {
      setDashboardLoading(true);
      setDashboardError('');
      try {
        const [ops, sales, plans] = await Promise.all([
          getOperationsDashboard(token),
          getSalesMonthlyCommissions(token, year, month),
          listPlans(token),
        ]);

        if (!alive) return;
        setDashboardStats({
          totalPlans: plans.length,
          activePlans: plans.filter((p) => p.isActive).length,
          salesPeople: sales.summary.totalSalesPeople,
          revenueThisMonth: sales.summary.totalPaidAmount + sales.summary.totalPendingAmount,
          activeWashRequests: ops.summary.activeWashRequests,
          onlineBikers: ops.summary.onlineBikers,
          pendingOwnerConfirmations: ops.summary.waitingOwnerConfirmations,
          failedJobs: ops.summary.failedJobs,
        });
      } catch (error) {
        if (!alive) return;
        const message = error instanceof Error ? error.message : String(error);
        setDashboardError(`Failed to load live stats: ${message}`);
      } finally {
        if (alive) setDashboardLoading(false);
      }
    };

    void loadDashboardStats();
    const interval = window.setInterval(() => {
      void loadDashboardStats();
    }, 30000);

    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, [token, isAuthPage, isAdmin]);

  const navItems: Array<{ key: Exclude<Page, 'landing' | 'login' | 'verify'>; label: string; section: 'menu' | 'support' | 'others' }> = [
    { key: 'dashboard', label: 'Dashboard', section: 'menu' },
    { key: 'washer', label: 'Biker Registration', section: 'menu' },
    { key: 'ops', label: 'Live Operations', section: 'menu' },
    { key: 'sales', label: 'Sales Registration', section: 'support' },
    { key: 'plans', label: 'Plan Management', section: 'support' },
    { key: 'counts', label: 'Biker Monthly Counts', section: 'others' },
  ];

  const activePanel = (() => {
    if (page === 'dashboard') {
      return (
        <div className="dash-content-grid">
          <section className="kpi-grid">
            <article className="kpi-card">
              <p className="kpi-label">Active Washes</p>
              <strong className="kpi-value">{dashboardStats.activeWashRequests}</strong>
              <span className="kpi-trend up">Live active requests</span>
            </article>
            <article className="kpi-card">
              <p className="kpi-label">Online Bikers</p>
              <strong className="kpi-value">{dashboardStats.onlineBikers}</strong>
              <span className="kpi-trend up">Ready now</span>
            </article>
            <article className="kpi-card">
              <p className="kpi-label">Sales Team</p>
              <strong className="kpi-value">{dashboardStats.salesPeople}</strong>
              <span className="kpi-trend">{dashboardStats.pendingOwnerConfirmations} waiting confirmations</span>
            </article>
            <article className="kpi-card">
              <p className="kpi-label">Monthly Revenue</p>
              <strong className="kpi-value">ETB {dashboardStats.revenueThisMonth.toLocaleString()}</strong>
              <span className={dashboardStats.failedJobs > 0 ? 'kpi-trend down' : 'kpi-trend up'}>
                {dashboardStats.failedJobs} failed jobs
              </span>
            </article>
          </section>

          <section className="analytics-row">
            <article className="card analytics-main">
              <div className="analytics-head">
                <h3>Total Revenue</h3>
                <div className="range-tabs">
                  <span className="range-tab active">Day</span>
                  <span className="range-tab">Week</span>
                  <span className="range-tab">Month</span>
                </div>
              </div>
              <div className="line-chart">
                <div className="line line-a"></div>
                <div className="line line-b"></div>
              </div>
            </article>

            <article className="card analytics-side">
              <div className="analytics-head">
                <h3>Profit This Week</h3>
              </div>
              <div className="bar-chart">
                <span style={{ height: `${Math.max(18, dashboardStats.activePlans * 8)}%` }}></span>
                <span style={{ height: `${Math.max(22, dashboardStats.totalPlans * 7)}%` }}></span>
                <span style={{ height: `${Math.max(30, dashboardStats.salesPeople * 6)}%` }}></span>
                <span style={{ height: `${Math.max(26, dashboardStats.pendingOwnerConfirmations * 7)}%` }}></span>
                <span style={{ height: `${Math.max(28, dashboardStats.onlineBikers * 5)}%` }}></span>
                <span style={{ height: `${Math.max(20, dashboardStats.failedJobs * 7)}%` }}></span>
                <span style={{ height: `${Math.max(32, dashboardStats.activeWashRequests * 4)}%` }}></span>
              </div>
            </article>
          </section>
        </div>
      );
    }
    if (page === 'washer') return <RegisterWasherTab token={token} isAdmin={isAdmin} />;
    if (page === 'ops') return <OperationsDashboardTab token={token} isAdmin={isAdmin} />;
    if (page === 'sales') return <RegisterSalesTab token={token} isAdmin={isAdmin} />;
    if (page === 'plans') return <PlanManagementTab token={token} isAdmin={isAdmin} />;
    if (page === 'counts') return <WasherMonthlyCountsTab token={token} isAdmin={isAdmin} />;
    return null;
  })();

  const pageTitle = (() => {
    if (page === 'dashboard') return 'Dashboard';
    if (page === 'washer') return 'Biker Registration';
    if (page === 'ops') return 'Live Operations';
    if (page === 'sales') return 'Sales Registration';
    if (page === 'plans') return 'Plan Management';
    if (page === 'counts') return 'Biker Monthly Counts';
    return 'Dashboard';
  })();

  const isAuthFlowPage = page === 'login' || page === 'verify';

  return (
    <div className={`page ${page === 'landing' ? 'page-landing' : ''} ${isAuthFlowPage ? 'page-auth' : ''}`}>
      <main
        className={`container ${!isAuthPage ? 'container-dashboard' : ''} ${page === 'landing' ? 'container-landing' : ''} ${isAuthFlowPage ? 'container-auth' : ''}`}
      >
        {page === 'landing' ? (
          <>
            <section className="marketing-landing">
              <div className="lp-shell">
                <header className="lp-nav">
                  <div className="lp-brand">
                    <span className="lp-brand-mark">CW</span>
                    <strong>CarWash Pro</strong>
                  </div>
                  <nav className="lp-menu">
                    <a href="#services">Wash Services</a>
                    <a href="#fleet">Biker Fleet</a>
                    <a href="#plans">Wash Plans</a>
                  </nav>
                  <button type="button" className="marketing-cta" onClick={() => setPage('login')}>
                    Open Admin
                  </button>
                </header>

                <div className="lp-hero">
                  <div className="lp-copy">
                    <p className="hero-eyebrow">All-In-One Car Wash Command Center</p>
                    <h2>Manage Wash Requests, Bikers, and Monthly Wash Plans</h2>
                    <p className="hero-copy">Built for real car wash operations in one live dashboard.</p>
                    <div className="actions">
                      <button type="button" className="marketing-cta" onClick={() => setPage('login')}>
                        Start Managing
                      </button>
                      <button type="button" className="secondary" onClick={() => setPage('verify')}>
                        Verify Admin OTP
                      </button>
                    </div>
                    {authMessage ? <p className="status">{authMessage}</p> : null}
                  </div>

                  <div className="lp-visual">
                    <div className="hero-image-card">
                      <img src="/assets/images/wash-car.png" alt="Car wash service" className="hero-image" />
                    </div>
                    <div className="lp-float lp-float-a">Live Wash Queue</div>
                    <div className="lp-float lp-float-b">Biker Dispatch</div>
                  </div>
                </div>

                <footer className="lp-trust">
                  <div className="lp-metrics">
                    <article>
                      <strong>10K+</strong>
                      <span>Car Wash Jobs Tracked</span>
                    </article>
                    <article>
                      <strong>500+</strong>
                      <span>Owners Served</span>
                    </article>
                    <article>
                      <strong>24/7</strong>
                      <span>Car Wash Operations Visibility</span>
                    </article>
                  </div>
                </footer>
              </div>
            </section>
          </>
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

        {!isAuthPage ? (
          <section className="dashboard-shell">
            <aside className="dash-sidebar">
              <div className="dash-brand">
                <span className="dash-brand-mark">CW</span>
                <div>
                  <strong>CarWash Admin</strong>
                  <p>Control Panel</p>
                </div>
              </div>

              <div className="dash-nav-group">
                <p className="dash-nav-title">Menu</p>
                {navItems
                  .filter((item) => item.section === 'menu')
                  .map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={page === item.key ? 'dash-nav-btn active' : 'dash-nav-btn'}
                      onClick={() => setPage(item.key)}
                    >
                      {item.label}
                    </button>
                  ))}
              </div>

              <div className="dash-nav-group">
                <p className="dash-nav-title">Support</p>
                {navItems
                  .filter((item) => item.section === 'support')
                  .map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={page === item.key ? 'dash-nav-btn active' : 'dash-nav-btn'}
                      onClick={() => setPage(item.key)}
                    >
                      {item.label}
                    </button>
                  ))}
              </div>

              <div className="dash-nav-group">
                <p className="dash-nav-title">Others</p>
                {navItems
                  .filter((item) => item.section === 'others')
                  .map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={page === item.key ? 'dash-nav-btn active' : 'dash-nav-btn'}
                      onClick={() => setPage(item.key)}
                    >
                      {item.label}
                    </button>
                  ))}
              </div>

              <button className="dash-logout" type="button" onClick={logout}>
                Logout
              </button>
            </aside>

            <div className="dash-main">
              <header className="dash-topbar card">
                <label className="dash-search-wrap">
                  <input type="text" placeholder="Type to search..." />
                </label>
                <div className="dash-top-actions">
                  <span className="tool-pill">Online: {dashboardStats.onlineBikers}</span>
                  <span className="tool-pill">Active: {dashboardStats.activeWashRequests}</span>
                  <span className="tool-pill">Sales: {dashboardStats.salesPeople}</span>
                  <div className="dash-user-chip">
                    <strong>{user?.phone ?? 'Admin User'}</strong>
                    <small>{user?.role ?? 'ADMIN'}</small>
                  </div>
                </div>
              </header>

              {dashboardLoading ? <p className="muted small">Refreshing dashboard numbers...</p> : null}
              {dashboardError ? <p className="status error">{dashboardError}</p> : null}

              <section className="card dashboard-panel">
                <h2>{pageTitle}</h2>
                {page === 'dashboard' ? (
                  <p className="muted small">
                    Active: {dashboardStats.activeWashRequests} | Online bikers: {dashboardStats.onlineBikers} | Monthly
                    revenue: ETB {dashboardStats.revenueThisMonth.toLocaleString()}
                  </p>
                ) : null}
                {activePanel}
              </section>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

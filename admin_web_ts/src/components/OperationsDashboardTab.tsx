import { useEffect, useState } from 'react';
import { getOperationsDashboard } from '../api';
import type { OperationsDashboardResponse } from '../types';

type Props = {
  token: string;
  isAdmin: boolean;
};

export default function OperationsDashboardTab({ token, isAdmin }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [data, setData] = useState<OperationsDashboardResponse | null>(null);
  const [selected, setSelected] = useState<
    'active' | 'waiting' | 'online' | 'offline' | 'reopened' | 'failed' | null
  >(null);

  const load = async () => {
    if (!token || !isAdmin) return;
    setLoading(true);
    setMessage('');
    try {
      const result = await getOperationsDashboard(token);
      setData(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setMessage(`Failed to load operations dashboard: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token || !isAdmin) return;
    void load();
    const t = setInterval(() => {
      void load();
    }, 10000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isAdmin]);

  if (!token) return <p className="status error">Set an admin token first.</p>;
  if (!isAdmin) return <p className="status error">Only ADMIN can view live operations.</p>;

  return (
    <section className="ops-shell">
      <article className="ops-hero">
        <p className="hero-eyebrow">Operations Center</p>
        <h3>Live Operations Dashboard</h3>
        <p className="hint">
          Monitor request flow, biker availability, and failure/reopen signals in real time.
        </p>
        <div className="sales-checklist">
          <div className="sales-check-item">
            <strong>Real-time Feed</strong>
            <span>Auto-refreshes every 10 seconds.</span>
          </div>
          <div className="sales-check-item">
            <strong>Quick Filters</strong>
            <span>Click any metric card to filter detail records.</span>
          </div>
          <div className="sales-check-item">
            <strong>Issue Tracking</strong>
            <span>Track reopened and failed jobs for intervention.</span>
          </div>
        </div>
      </article>

      <article className="card ops-panel">
        <header className="ops-head">
          <div>
            <h3>Operations Snapshot</h3>
            <p className="muted small">Live monitoring page</p>
          </div>
          <div className="actions">
            <button type="button" className="secondary" onClick={load} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh now'}
            </button>
          </div>
        </header>
        {message ? <p className="status error">{message}</p> : null}

        {data ? (
          <>
            <p className="muted small">Generated: {new Date(data.generatedAt).toLocaleString()}</p>

            <div className="ops-metric-grid">
              <button type="button" className={`ops-metric ${selected === 'active' ? 'active' : ''}`} onClick={() => setSelected('active')}>
                <span>Active wash requests</span>
                <strong>{data.summary.activeWashRequests}</strong>
              </button>
              <button type="button" className={`ops-metric ${selected === 'waiting' ? 'active' : ''}`} onClick={() => setSelected('waiting')}>
                <span>Waiting owner confirmations</span>
                <strong>{data.summary.waitingOwnerConfirmations}</strong>
              </button>
              <button type="button" className={`ops-metric ${selected === 'online' ? 'active' : ''}`} onClick={() => setSelected('online')}>
                <span>Online bikers</span>
                <strong>{data.summary.onlineBikers}</strong>
              </button>
              <button type="button" className={`ops-metric ${selected === 'offline' ? 'active' : ''}`} onClick={() => setSelected('offline')}>
                <span>Offline bikers</span>
                <strong>{data.summary.offlineBikers}</strong>
              </button>
              <button type="button" className={`ops-metric ${selected === 'reopened' ? 'active' : ''}`} onClick={() => setSelected('reopened')}>
                <span>Reopened jobs</span>
                <strong>{data.summary.reopenedJobs}</strong>
              </button>
              <button type="button" className={`ops-metric ${selected === 'failed' ? 'active' : ''}`} onClick={() => setSelected('failed')}>
                <span>Failed jobs</span>
                <strong>{data.summary.failedJobs}</strong>
              </button>
            </div>

            <div className="ops-detail-head">
              <h3>Details</h3>
              <button type="button" className="secondary" onClick={() => setSelected(null)}>
                Show All
              </button>
            </div>

            <div className="plan-list">
              {(selected === null || selected === 'active') &&
                data.activeWashRequests.map((r) => (
                  <div className="plan-row" key={`ac-${r.id}`}>
                    <div>
                      <strong>Active: {r.id}</strong>
                      <p className="muted small">Owner: {r.ownerId}</p>
                      <p className="muted small">Washer: {r.washerId || '-'}</p>
                    </div>
                    <span>{r.status}</span>
                  </div>
                ))}

              {(selected === null || selected === 'waiting') &&
                (data.waitingOwnerConfirmations.length === 0 && selected === 'waiting' ? (
                  <p className="muted">No requests waiting for owner confirmation.</p>
                ) : (
                  data.waitingOwnerConfirmations.map((r) => (
                    <div className="plan-row" key={`wc-${r.id}`}>
                      <div>
                        <strong>Waiting confirm: {r.id}</strong>
                        <p className="muted small">Owner: {r.ownerId}</p>
                        <p className="muted small">Washer: {r.washerId || '-'}</p>
                      </div>
                      <span>{r.status}</span>
                    </div>
                  ))
                ))}

              {(selected === null || selected === 'online') &&
                data.onlineBikers.map((w) => (
                  <div className="plan-row" key={`on-${w.washerId}`}>
                    <div>
                      <strong>{w.fullName || 'Unnamed biker'}</strong>
                      <p className="muted small">{w.phone}</p>
                    </div>
                    <span>Online</span>
                  </div>
                ))}

              {(selected === null || selected === 'offline') &&
                data.offlineBikers.map((w) => (
                  <div className="plan-row" key={`off-${w.washerId}`}>
                    <div>
                      <strong>{w.fullName || 'Unnamed biker'}</strong>
                      <p className="muted small">{w.phone}</p>
                    </div>
                    <span>Offline</span>
                  </div>
                ))}

              {(selected === null || selected === 'reopened') &&
                data.reopenedJobs.map((r) => (
                  <div className="plan-row" key={`re-${r.id}`}>
                    <div>
                      <strong>Reopened: {r.id}</strong>
                      <p className="muted small">Reopened count: {r.reopenedCount}</p>
                    </div>
                    <span>{r.status}</span>
                  </div>
                ))}

              {(selected === null || selected === 'failed') &&
                data.failedJobs.map((r) => (
                  <div className="plan-row" key={`fa-${r.id}`}>
                    <div>
                      <strong>Failed: {r.id}</strong>
                      <p className="muted small">Owner: {r.ownerId}</p>
                    </div>
                    <span>{r.status}</span>
                  </div>
                ))}
            </div>
          </>
        ) : null}
      </article>
    </section>
  );
}

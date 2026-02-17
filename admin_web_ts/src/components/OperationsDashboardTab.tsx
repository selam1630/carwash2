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
    <>
      <h3>Live Operations Dashboard</h3>
      <p className="muted small">Auto-refreshes every 10 seconds.</p>
      <div className="actions">
        <button type="button" className="secondary" onClick={load} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh now'}
        </button>
      </div>
      {message ? <p className="status error">{message}</p> : null}

      {data ? (
        <>
          <p className="muted small">Generated: {new Date(data.generatedAt).toLocaleString()}</p>

          <div className="plan-list">
            <div className="plan-row">
              <strong>Active wash requests</strong>
              <button type="button" className="secondary" onClick={() => setSelected('active')}>
                {data.summary.activeWashRequests}
              </button>
            </div>
            <div className="plan-row">
              <strong>Waiting owner confirmations</strong>
              <button type="button" className="secondary" onClick={() => setSelected('waiting')}>
                {data.summary.waitingOwnerConfirmations}
              </button>
            </div>
            <div className="plan-row">
              <strong>Online bikers</strong>
              <button type="button" className="secondary" onClick={() => setSelected('online')}>
                {data.summary.onlineBikers}
              </button>
            </div>
            <div className="plan-row">
              <strong>Offline bikers</strong>
              <button type="button" className="secondary" onClick={() => setSelected('offline')}>
                {data.summary.offlineBikers}
              </button>
            </div>
            <div className="plan-row">
              <strong>Reopened jobs</strong>
              <button type="button" className="secondary" onClick={() => setSelected('reopened')}>
                {data.summary.reopenedJobs}
              </button>
            </div>
            <div className="plan-row">
              <strong>Failed jobs</strong>
              <button type="button" className="secondary" onClick={() => setSelected('failed')}>
                {data.summary.failedJobs}
              </button>
            </div>
          </div>

          <h3 style={{ marginTop: 14 }}>Details</h3>
          <div className="actions">
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
    </>
  );
}

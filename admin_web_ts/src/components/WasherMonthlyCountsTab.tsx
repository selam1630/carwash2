import { useEffect, useMemo, useState } from 'react';
import { getWashersMonthlyCounts } from '../api';
import type { WasherMonthlyCountItem } from '../types';

type Props = {
  token: string;
  isAdmin: boolean;
};

function thisYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export default function WasherMonthlyCountsTab({ token, isAdmin }: Props) {
  const initial = useMemo(() => thisYearMonth(), []);
  const [year, setYear] = useState<number>(initial.year);
  const [month, setMonth] = useState<number>(initial.month);
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [items, setItems] = useState<WasherMonthlyCountItem[]>([]);

  const load = async () => {
    if (!isAdmin || !token) return;
    setLoading(true);
    setMessage('');
    try {
      const data = await getWashersMonthlyCounts(token, year, month);
      setItems(data.items || []);
      setMessage(`Loaded ${data.totalWashers} bikers for ${data.year}-${String(data.month).padStart(2, '0')}.`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setMessage(`Failed to load monthly counts: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!token) {
    return <p className="status error">Set an admin token first.</p>;
  }
  if (!isAdmin) {
    return <p className="status error">Only ADMIN can view biker monthly counts.</p>;
  }

  return (
    <>
      <h3>Biker Monthly Completed Count</h3>
      <p className="muted small">Only owner-confirmed completed jobs are counted.</p>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr auto' }}>
        <label>
          Year
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value || new Date().getFullYear()))}
          />
        </label>
        <label>
          Month (1-12)
          <input
            type="number"
            min={1}
            max={12}
            value={month}
            onChange={(e) => setMonth(Number(e.target.value || 1))}
          />
        </label>
        <div style={{ alignSelf: 'end' }}>
          <button type="button" onClick={load} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {message ? <p className="status">{message}</p> : null}

      <div className="plan-list">
        {items.length === 0 ? (
          <p className="muted">No bikers found for this month.</p>
        ) : (
          items.map((w) => (
            <div className="plan-row" key={w.washerId}>
              <div>
                <strong>{w.fullName || 'Unnamed biker'}</strong>
                <div className="muted small">{w.phone}</div>
                <div className="muted small">ID: {w.washerId}</div>
              </div>
              <div>
                <strong>{w.completedCount}</strong> completed
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}


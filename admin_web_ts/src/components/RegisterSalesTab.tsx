import { useState } from 'react';
import { approveSalesMonthlyCommissions, getSalesMonthlyCommissions, registerSales } from '../api';
import type { RegisterSalesPayload } from '../types';
import type { SalesMonthlyCommissionItem } from '../types';

type SalesFormState = {
  fullName: string;
  phone: string;
  nationalId: string;
  sponsorNationalId: string;
  bankName: string;
  accountNumber: string;
};

const initialSalesForm: SalesFormState = {
  fullName: '',
  phone: '',
  nationalId: '',
  sponsorNationalId: '',
  bankName: '',
  accountNumber: '',
};

type Props = {
  token: string;
  isAdmin: boolean;
};

export default function RegisterSalesTab({ token, isAdmin }: Props) {
  const [form, setForm] = useState<SalesFormState>(initialSalesForm);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [loadingCommissions, setLoadingCommissions] = useState<boolean>(false);
  const [commissionMessage, setCommissionMessage] = useState<string>('');
  const [items, setItems] = useState<SalesMonthlyCommissionItem[]>([]);

  const updateField = <K extends keyof SalesFormState>(field: K, value: SalesFormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const onRegisterSales = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage('');

    if (!token) {
      setMessage('Please login first.');
      return;
    }

    const payload: RegisterSalesPayload = {
      fullName: form.fullName.trim(),
      phone: form.phone.trim(),
      nationalId: form.nationalId.trim(),
      sponsorNationalId: form.sponsorNationalId.trim(),
      bankDetails: {
        bankName: form.bankName.trim(),
        accountNumber: form.accountNumber.trim(),
      },
    };

    setSubmitting(true);
    try {
      const result = await registerSales(token, payload);
      setMessage(result.message || 'Sales person registered successfully.');
      setForm(initialSalesForm);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setMessage(`Registration failed: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const loadMonthlyCommissions = async () => {
    if (!token || !isAdmin) return;
    setCommissionMessage('');
    setLoadingCommissions(true);
    try {
      const data = await getSalesMonthlyCommissions(token, year, month);
      setItems(data.items || []);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setCommissionMessage(`Failed to load commissions: ${msg}`);
    } finally {
      setLoadingCommissions(false);
    }
  };

  const onApprove = async (salesUserId: string) => {
    if (!token || !isAdmin) return;
    setCommissionMessage('');
    try {
      const res = await approveSalesMonthlyCommissions(token, salesUserId, year, month);
      setCommissionMessage(`${res.message}. Approved ${res.approvedCount} records (${res.approvedAmount} birr).`);
      await loadMonthlyCommissions();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setCommissionMessage(`Approve failed: ${msg}`);
    }
  };

  return (
    <section className="sales-layout">
      <article className="sales-hero">
        <p className="hero-eyebrow">Sales Network</p>
        <h3>Register Sales Agent</h3>
        <p className="hint">
          Onboard sales agents with verified identity and payout data, then track monthly commission approvals.
        </p>
        <div className="sales-checklist">
          <div className="sales-check-item">
            <strong>Identity</strong>
            <span>Full profile with national ID and sponsor details.</span>
          </div>
          <div className="sales-check-item">
            <strong>Banking</strong>
            <span>Required before commission payout approvals.</span>
          </div>
          <div className="sales-check-item">
            <strong>Commissions</strong>
            <span>Review pending records by month and approve quickly.</span>
          </div>
        </div>
      </article>

      <article className="card sales-form-card">
        <form onSubmit={onRegisterSales} className="grid">
          <p className="sales-section-title">Sales Profile</p>
          <div className="sales-field-grid">
            <label>
              Full Name
              <input value={form.fullName} onChange={(e) => updateField('fullName', e.target.value)} required />
            </label>
            <label>
              Phone (+2519xxxxxxxx)
              <input
                value={form.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                placeholder="+2519xxxxxxxx"
                required
              />
            </label>
            <label>
              National ID
              <input value={form.nationalId} onChange={(e) => updateField('nationalId', e.target.value)} required />
            </label>
            <label>
              Sponsor/Warrantor National ID
              <input
                value={form.sponsorNationalId}
                onChange={(e) => updateField('sponsorNationalId', e.target.value)}
                required
              />
            </label>
            <label>
              Bank Name
              <input value={form.bankName} onChange={(e) => updateField('bankName', e.target.value)} required />
            </label>
            <label>
              Account Number
              <input value={form.accountNumber} onChange={(e) => updateField('accountNumber', e.target.value)} required />
            </label>
          </div>
          <div className="actions">
            <button type="submit" disabled={submitting || !isAdmin}>
              {submitting ? 'Registering...' : 'Register Sales'}
            </button>
          </div>
        </form>
        {message ? <p className="status">{message}</p> : null}
      </article>

      <article className="card sales-commission-card">
        <h3>Sales Monthly Commissions</h3>
        <div className="sales-filter-grid">
          <label>
            Year
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </label>
          <label>
            Month
            <input
              type="number"
              min={1}
              max={12}
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            />
          </label>
          <button type="button" onClick={loadMonthlyCommissions} disabled={!isAdmin || loadingCommissions}>
            {loadingCommissions ? 'Loading...' : 'Load'}
          </button>
        </div>

        {commissionMessage ? <p className="status">{commissionMessage}</p> : null}

        {items.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Sales</th>
                  <th>Phone</th>
                  <th>Registrations</th>
                  <th>Pending (birr)</th>
                  <th>Paid (birr)</th>
                  <th>Total (birr)</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.salesProfileId}>
                    <td>{it.salesFullName || '-'}</td>
                    <td>{it.salesPhone || '-'}</td>
                    <td>{it.registrationsCount}</td>
                    <td>{it.pendingAmount}</td>
                    <td>{it.paidAmount}</td>
                    <td>{it.totalAmount}</td>
                    <td>
                      <button
                        type="button"
                        disabled={!isAdmin || it.pendingAmount <= 0}
                        onClick={() => onApprove(it.salesUserId)}
                      >
                        Approve Month
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted small">No commission records loaded yet.</p>
        )}
      </article>
    </section>
  );
}

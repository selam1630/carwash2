import { useState } from 'react';
import { registerWasher } from '../api';
import type { RegisterWasherPayload } from '../types';

type WasherFormState = {
  fullName: string;
  phone: string;
  nationalId: string;
  sponsorNationalId: string;
  bankName: string;
  accountNumber: string;
  depositeAmount: string;
  mugShot: string;
  nationalIdPhoto: string;
  sponsorNationalIdPhoto: string;
};

const initialWasherForm: WasherFormState = {
  fullName: '',
  phone: '',
  nationalId: '',
  sponsorNationalId: '',
  bankName: '',
  accountNumber: '',
  depositeAmount: '',
  mugShot: '',
  nationalIdPhoto: '',
  sponsorNationalIdPhoto: '',
};

type Props = {
  token: string;
  isAdmin: boolean;
};

export default function RegisterWasherTab({ token, isAdmin }: Props) {
  const [form, setForm] = useState<WasherFormState>(initialWasherForm);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');

  const updateField = <K extends keyof WasherFormState>(field: K, value: WasherFormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const onRegisterWasher = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage('');

    if (!token) {
      setMessage('Please login first.');
      return;
    }

    const deposit = Number(form.depositeAmount);
    if (!Number.isFinite(deposit)) {
      setMessage('Deposit amount must be a valid number.');
      return;
    }

    const payload: RegisterWasherPayload = {
      fullName: form.fullName.trim(),
      phone: form.phone.trim(),
      nationalId: form.nationalId.trim(),
      sponsorNationalId: form.sponsorNationalId.trim(),
      depositeAmount: deposit,
      bankDetails: {
        bankName: form.bankName.trim(),
        accountNumber: form.accountNumber.trim(),
      },
      mugShot: form.mugShot.trim(),
      ...(form.nationalIdPhoto.trim()
        ? { nationalIdPhoto: form.nationalIdPhoto.trim() }
        : {}),
      ...(form.sponsorNationalIdPhoto.trim()
        ? { sponsorNationalIdPhoto: form.sponsorNationalIdPhoto.trim() }
        : {}),
    };

    setSubmitting(true);
    try {
      const result = await registerWasher(token, payload);
      setMessage(result.message || 'Biker registered successfully.');
      setForm(initialWasherForm);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setMessage(`Registration failed: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="washer-layout">
      <article className="washer-hero">
        <p className="hero-eyebrow">Biker Onboarding</p>
        <h3>Register New Biker (Washer)</h3>
        <p className="hint">
          Capture identity, guarantor, and payout information accurately to keep operations and compliance clean.
        </p>
        <div className="washer-checklist">
          <div className="washer-check-item">
            <strong>Identity Check</strong>
            <span>National ID + sponsor details are required.</span>
          </div>
          <div className="washer-check-item">
            <strong>Financial Setup</strong>
            <span>Bank account and deposit must be valid before activation.</span>
          </div>
          <div className="washer-check-item">
            <strong>Photo Evidence</strong>
            <span>Mug shot required, ID images optional but recommended.</span>
          </div>
        </div>
      </article>

      <article className="card washer-form-card">
        <form onSubmit={onRegisterWasher} className="grid">
          <div>
            <p className="washer-section-title">Profile Information</p>
            <div className="washer-field-grid">
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
            </div>
          </div>

          <div>
            <p className="washer-section-title">Bank & Deposit</p>
            <div className="washer-field-grid">
              <label>
                Bank Name
                <input value={form.bankName} onChange={(e) => updateField('bankName', e.target.value)} required />
              </label>
              <label>
                Account Number
                <input value={form.accountNumber} onChange={(e) => updateField('accountNumber', e.target.value)} required />
              </label>
              <label>
                Deposit Amount
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.depositeAmount}
                  onChange={(e) => updateField('depositeAmount', e.target.value)}
                  required
                />
              </label>
            </div>
          </div>

          <div>
            <p className="washer-section-title">Photos</p>
            <div className="washer-field-grid">
              <label>
                Mug Shot (URL or file path)
                <input
                  value={form.mugShot}
                  onChange={(e) => updateField('mugShot', e.target.value)}
                  placeholder="https://... or uploads/mugshots/file.jpg"
                  required
                />
              </label>
              <label>
                National ID Photo (optional URL/path)
                <input
                  value={form.nationalIdPhoto}
                  onChange={(e) => updateField('nationalIdPhoto', e.target.value)}
                  placeholder="https://... or uploads/ids/file.jpg"
                />
              </label>
              <label>
                Sponsor ID Photo (optional URL/path)
                <input
                  value={form.sponsorNationalIdPhoto}
                  onChange={(e) => updateField('sponsorNationalIdPhoto', e.target.value)}
                  placeholder="https://... or uploads/ids/file.jpg"
                />
              </label>
            </div>
          </div>

          <div className="actions">
            <button type="submit" disabled={submitting || !isAdmin}>
              {submitting ? 'Registering...' : 'Register Biker'}
            </button>
          </div>
        </form>
        {message ? <p className="status">{message}</p> : null}
      </article>
    </section>
  );
}

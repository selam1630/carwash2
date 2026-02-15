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
};

const initialWasherForm: WasherFormState = {
  fullName: '',
  phone: '',
  nationalId: '',
  sponsorNationalId: '',
  bankName: '',
  accountNumber: '',
  depositeAmount: '',
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
    <div>
      <h3>Register Biker (Washer)</h3>
      <form onSubmit={onRegisterWasher} className="grid">
        <label>
          Full Name
          <input value={form.fullName} onChange={(e) => updateField('fullName', e.target.value)} required />
        </label>
        <label>
          Phone (+2519xxxxxxxx)
          <input value={form.phone} onChange={(e) => updateField('phone', e.target.value)} placeholder="+2519xxxxxxxx" required />
        </label>
        <label>
          National ID
          <input value={form.nationalId} onChange={(e) => updateField('nationalId', e.target.value)} required />
        </label>
        <label>
          Sponsor/Warrantor National ID
          <input value={form.sponsorNationalId} onChange={(e) => updateField('sponsorNationalId', e.target.value)} required />
        </label>
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
          <input type="number" step="0.01" min="0" value={form.depositeAmount} onChange={(e) => updateField('depositeAmount', e.target.value)} required />
        </label>
        <button type="submit" disabled={submitting || !isAdmin}>
          {submitting ? 'Registering...' : 'Register Biker'}
        </button>
      </form>
      {message ? <p className="status">{message}</p> : null}
    </div>
  );
}

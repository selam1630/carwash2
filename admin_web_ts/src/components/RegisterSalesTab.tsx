import { useState } from 'react';
import { registerSales } from '../api';
import type { RegisterSalesPayload } from '../types';

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

  return (
    <div>
      <h3>Register Sales</h3>
      <form onSubmit={onRegisterSales} className="grid">
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
        <button type="submit" disabled={submitting || !isAdmin}>
          {submitting ? 'Registering...' : 'Register Sales'}
        </button>
      </form>
      {message ? <p className="status">{message}</p> : null}
    </div>
  );
}

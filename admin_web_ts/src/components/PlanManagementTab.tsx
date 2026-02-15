import { useEffect, useState } from 'react';
import { createPlan, deletePlan, listPlans, updatePlan } from '../api';
import type { Plan, UpdatePlanPayload } from '../types';

type PlanFormState = {
  name: string;
  washesPerMonth: string;
  price: string;
};

const initialPlanForm: PlanFormState = {
  name: '',
  washesPerMonth: '',
  price: '',
};

type Props = {
  token: string;
  isAdmin: boolean;
};

export default function PlanManagementTab({ token, isAdmin }: Props) {
  const [form, setForm] = useState<PlanFormState>(initialPlanForm);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    if (!token || !isAdmin) return;
    void loadPlans();
  }, [token, isAdmin]);

  const updateField = <K extends keyof PlanFormState>(field: K, value: PlanFormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const loadPlans = async () => {
    if (!token) return;
    setPlansLoading(true);
    setMessage('');
    try {
      const result = await listPlans(token);
      setPlans(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setMessage(`Failed to load plans: ${msg}`);
    } finally {
      setPlansLoading(false);
    }
  };

  const onCreatePlan = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage('');

    if (!token) {
      setMessage('Please login first.');
      return;
    }

    const washes = Number(form.washesPerMonth);
    const price = Number(form.price);
    if (!Number.isInteger(washes) || washes < 1) {
      setMessage('Washes per month must be an integer >= 1.');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setMessage('Price must be a number >= 0.');
      return;
    }

    setSubmitting(true);
    try {
      await createPlan(token, {
        name: form.name.trim(),
        washesPerMonth: washes,
        price,
      });
      setMessage('Plan created successfully.');
      setForm(initialPlanForm);
      await loadPlans();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setMessage(`Create failed: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const togglePlanActive = async (plan: Plan) => {
    if (!token) return;
    const payload: UpdatePlanPayload = { isActive: !plan.isActive };
    try {
      await updatePlan(token, plan.id, payload);
      await loadPlans();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setMessage(`Update failed: ${msg}`);
    }
  };

  const removePlan = async (plan: Plan) => {
    if (!token) return;
    try {
      await deletePlan(token, plan.id);
      setMessage(`Deleted plan: ${plan.name}`);
      await loadPlans();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setMessage(`Delete failed: ${msg}`);
    }
  };

  return (
    <div>
      <h3>Plan Management</h3>
      <form onSubmit={onCreatePlan} className="grid">
        <label>
          Plan Name
          <input value={form.name} onChange={(e) => updateField('name', e.target.value)} required />
        </label>
        <label>
          Washes Per Month
          <input type="number" min="1" step="1" value={form.washesPerMonth} onChange={(e) => updateField('washesPerMonth', e.target.value)} required />
        </label>
        <label>
          Price
          <input type="number" min="0" step="0.01" value={form.price} onChange={(e) => updateField('price', e.target.value)} required />
        </label>
        <button type="submit" disabled={submitting || !isAdmin}>
          {submitting ? 'Creating...' : 'Create Plan'}
        </button>
      </form>

      <div className="actions">
        <button type="button" className="secondary" onClick={loadPlans} disabled={plansLoading || !isAdmin}>
          {plansLoading ? 'Refreshing...' : 'Refresh Plans'}
        </button>
      </div>

      <div className="plan-list">
        {plans.map((plan) => (
          <div className="plan-row" key={plan.id}>
            <div>
              <strong>{plan.name}</strong>
              <p className="muted small">
                {plan.washesPerMonth} washes/month • {plan.price} ETB • {plan.isActive ? 'Active' : 'Inactive'}
              </p>
            </div>
            <div className="actions">
              <button type="button" onClick={() => togglePlanActive(plan)} disabled={!isAdmin}>
                {plan.isActive ? 'Deactivate' : 'Activate'}
              </button>
              <button type="button" className="danger" onClick={() => removePlan(plan)} disabled={!isAdmin}>
                Delete
              </button>
            </div>
          </div>
        ))}
        {!plans.length && !plansLoading ? <p className="muted">No plans found.</p> : null}
      </div>

      {message ? <p className="status">{message}</p> : null}
    </div>
  );
}

import type {
  ApiErrorBody,
  CreatePlanPayload,
  Plan,
  RegisterSalesPayload,
  RegisterWasherPayload,
  UpdatePlanPayload,
  VerifyOtpResponse,
  WashersMonthlyCountsResponse,
  OperationsDashboardResponse,
} from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const mergedHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: mergedHeaders,
  });

  const raw = await response.text();
  const data = raw ? (JSON.parse(raw) as unknown) : null;

  if (!response.ok) {
    const body = (data || {}) as ApiErrorBody;
    const message = Array.isArray(body.message)
      ? body.message.join(', ')
      : body.message || `HTTP ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

export function sendOtp(phone: string): Promise<{ message: string }> {
  return request('/auth/send-otp', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

export function verifyOtp(phone: string, otp: string, deviceId: string): Promise<VerifyOtpResponse> {
  return request('/auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ phone, otp, deviceId }),
  });
}

export function registerWasher(token: string, payload: RegisterWasherPayload): Promise<{ message: string }> {
  return request('/auth/admin/register-washer', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

export function registerSales(token: string, payload: RegisterSalesPayload): Promise<{ message: string }> {
  return request('/auth/admin/register-sales', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

export function listPlans(token: string): Promise<Plan[]> {
  return request('/plans', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function createPlan(token: string, payload: CreatePlanPayload): Promise<Plan> {
  return request('/plans', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

export function updatePlan(token: string, id: string, payload: UpdatePlanPayload): Promise<Plan> {
  return request(`/plans/${id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

export function deletePlan(token: string, id: string): Promise<{ message?: string }> {
  return request(`/plans/${id}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function getWashersMonthlyCounts(
  token: string,
  year: number,
  month: number,
): Promise<WashersMonthlyCountsResponse> {
  return request(`/wash/admin/washers/monthly-completed?year=${year}&month=${month}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function getOperationsDashboard(token: string): Promise<OperationsDashboardResponse> {
  return request('/wash/admin/operations-dashboard', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export { API_BASE_URL };

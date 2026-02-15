export type UserRole = 'OWNER' | 'WASHER' | 'SALES' | 'ADMIN';

export interface AuthUser {
  id: string;
  phone: string;
  role: UserRole;
  isActive: boolean;
}

export interface VerifyOtpResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface BankDetails {
  bankName: string;
  accountNumber: string;
}

export interface RegisterWasherPayload {
  fullName: string;
  phone: string;
  nationalId: string;
  sponsorNationalId: string;
  depositeAmount: number;
  bankDetails: BankDetails;
  mugShot: string;
  nationalIdPhoto?: string;
  sponsorNationalIdPhoto?: string;
}

export interface RegisterSalesPayload {
  fullName: string;
  phone: string;
  nationalId: string;
  sponsorNationalId: string;
  bankDetails: BankDetails;
}

export interface Plan {
  id: string;
  name: string;
  washesPerMonth: number;
  price: string | number;
  isActive: boolean;
  createdAt: string;
}

export interface CreatePlanPayload {
  name: string;
  washesPerMonth: number;
  price: number;
}

export interface UpdatePlanPayload {
  name?: string;
  washesPerMonth?: number;
  price?: number;
  isActive?: boolean;
}

export interface ApiErrorBody {
  message?: string | string[];
}

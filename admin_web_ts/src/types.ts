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

export interface WasherMonthlyCountItem {
  washerId: string;
  phone: string;
  fullName: string | null;
  completedCount: number;
}

export interface WashersMonthlyCountsResponse {
  year: number;
  month: number;
  totalWashers: number;
  items: WasherMonthlyCountItem[];
}

export interface OperationsBikerItem {
  washerId: string;
  phone: string;
  fullName: string | null;
  isActive: boolean;
}

export interface OperationsDashboardResponse {
  generatedAt: string;
  activeWashRequests: Array<{ id: string; ownerId: string; washerId: string | null; status: string; createdAt: string }>;
  waitingOwnerConfirmations: Array<{ id: string; ownerId: string; washerId: string | null; status: string; washerSubmittedAt: string | null; afterWashPhoto: string | null }>;
  onlineBikers: OperationsBikerItem[];
  offlineBikers: OperationsBikerItem[];
  reopenedJobs: Array<{ id: string; ownerId: string; reopenedCount: number; lastReopenedAt: string | null; status: string }>;
  failedJobs: Array<{ id: string; ownerId: string; washerId: string | null; status: string; updatedAt: string }>;
  summary: {
    activeWashRequests: number;
    waitingOwnerConfirmations: number;
    onlineBikers: number;
    offlineBikers: number;
    reopenedJobs: number;
    failedJobs: number;
  };
}

export interface SalesMonthlyCommissionItem {
  salesProfileId: string;
  salesUserId: string;
  salesPhone: string | null;
  salesFullName: string | null;
  registrationsCount: number;
  pendingCount: number;
  paidCount: number;
  pendingAmount: number;
  paidAmount: number;
  totalAmount: number;
}

export interface SalesMonthlyCommissionsResponse {
  year: number;
  month: number;
  items: SalesMonthlyCommissionItem[];
  summary: {
    totalSalesPeople: number;
    totalRegistrations: number;
    totalPendingAmount: number;
    totalPaidAmount: number;
  };
}

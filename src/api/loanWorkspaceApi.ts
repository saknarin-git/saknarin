import { apiRequest } from './client';
import type {
  LoanPaymentMode,
  LoanPaymentPreview,
  LoanPaymentRecord,
  LoanPaymentWorkspaceData,
  LoanTypeRecord,
  LoanWorkspaceConfig,
} from '../types';

export async function fetchLoanWorkspaceConfig(token: string, year?: number) {
  const query = new URLSearchParams({ resource: 'config' });
  if (year) {
    query.set('year', String(year));
  }

  return apiRequest<{ success: boolean; data: LoanWorkspaceConfig }>(
    `loan-workspace?${query.toString()}`,
    { method: 'GET' },
    token,
  );
}

export async function fetchLoanPaymentWorkspace(token: string, memberNo: string, mode: LoanPaymentMode, paidDate: string) {
  const query = new URLSearchParams({ resource: 'payment-workspace', memberNo, mode, paidDate });
  return apiRequest<{ success: boolean; data: LoanPaymentWorkspaceData }>(
    `loan-workspace?${query.toString()}`,
    { method: 'GET' },
    token,
  );
}

export async function saveLoanPayment(
  token: string,
  payload: {
    member_no: string;
    contract_no: string;
    payment_mode: LoanPaymentMode;
    principal_paid: number;
    interest_installments_paid: number;
    paid_date: string;
  },
) {
  return apiRequest<{ success: boolean; message: string; data: { payment: LoanPaymentRecord; preview: LoanPaymentPreview } }>(
    'loan-workspace',
    {
      method: 'POST',
      body: JSON.stringify({
        resource: 'payment',
        ...payload,
      }),
    },
    token,
  );
}

export async function updateLoanWorkspaceConfig(
  token: string,
  payload: {
    loan_types: Array<Pick<LoanTypeRecord, 'id' | 'name' | 'annual_interest_rate' | 'active'>>;
    working_calendar_year: number;
    working_dates: LoanWorkspaceConfig['working_dates'];
  },
) {
  return apiRequest<{ success: boolean; message: string; data: LoanWorkspaceConfig }>(
    'loan-workspace',
    {
      method: 'PUT',
      body: JSON.stringify({
        resource: 'config',
        ...payload,
      }),
    },
    token,
  );
}
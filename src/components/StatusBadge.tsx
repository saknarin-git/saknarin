import type { ApprovalStatus } from '../types';

const labelMap: Record<ApprovalStatus, string> = {
  approved: 'อนุมัติแล้ว',
  pending: 'รออนุมัติ',
  rejected: 'ไม่อนุมัติ',
};

export function StatusBadge({ status }: { status: ApprovalStatus }) {
  return <span className={`badge badge-${status}`}>{labelMap[status]}</span>;
}
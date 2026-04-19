import { APP_GROUP_NAME } from '../constants/appBrand';
import type { AdminOverview, AppSettings } from '../types';

interface SystemOverviewPanelProps {
  overview: AdminOverview;
  settings: AppSettings;
  title?: string;
  description?: string;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function SystemOverviewPanel({
  overview,
  settings,
  title = 'สรุปภาพรวมของระบบ',
  description = 'ติดตามจำนวนสมาชิก บัญชีผู้ใช้งาน สัญญาเงินกู้ และภาระคงค้างจากข้อมูลล่าสุดในระบบ',
}: SystemOverviewPanelProps) {
  const utilizationPercent = overview.total_loan_amount > 0
    ? (overview.total_outstanding_amount / overview.total_loan_amount) * 100
    : 0;

  return (
    <div className="devmanager-section-stack">
      <section className="card dashboard-hero-card">
        <div>
          <div className="eyebrow">แดชบอร์ดภาพรวม</div>
          <h3 className="section-title">{title}</h3>
          <p className="muted">{description}</p>
          <div className="muted">หน่วยงาน: {settings.group_name || APP_GROUP_NAME}</div>
        </div>
        <div className="stats-row">
          <div className="stat-chip">สมาชิกทั้งหมด {overview.members_count} ราย</div>
          <div className="stat-chip">วงเงินกู้รวม {formatCurrency(overview.total_loan_amount)} บาท</div>
          <div className="stat-chip">ยอดคงค้างรวม {formatCurrency(overview.total_outstanding_amount)} บาท</div>
        </div>
      </section>

      <div className="dashboard-metrics-grid">
        <section className="card metric-card">
          <div className="metric-label">สมาชิกทั้งหมด</div>
          <div className="metric-value">{overview.members_count}</div>
          <div className="metric-subtext">ใช้งาน {overview.active_members_count} | ปิดใช้งาน {overview.inactive_members_count}</div>
        </section>
        <section className="card metric-card">
          <div className="metric-label">บัญชีผู้ใช้งาน</div>
          <div className="metric-value">{overview.users_count}</div>
          <div className="metric-subtext">อนุมัติแล้ว {overview.approved_users_count} | รออนุมัติ {overview.pending_users_count}</div>
        </section>
        <section className="card metric-card">
          <div className="metric-label">สัญญาเงินกู้</div>
          <div className="metric-value">{overview.loan_contracts_count}</div>
          <div className="metric-subtext">ยังคงค้าง {overview.active_loan_contracts_count} | ปิดแล้ว {overview.closed_loan_contracts_count}</div>
        </section>
        <section className="card metric-card">
          <div className="metric-label">บุคลากรระบบ</div>
          <div className="metric-value">{overview.dev_admin_users_count + overview.admin_users_count + overview.officer_users_count}</div>
          <div className="metric-subtext">DevManager {overview.dev_admin_users_count} | Admin {overview.admin_users_count} | เจ้าหน้าที่ {overview.officer_users_count}</div>
        </section>
      </div>

      <div className="grid-two">
        <section className="card insight-card">
          <h3 className="section-title">สรุปวงเงินกู้</h3>
          <div className="insight-row">
            <span>วงเงินกู้รวม</span>
            <strong>{formatCurrency(overview.total_loan_amount)} บาท</strong>
          </div>
          <div className="insight-row">
            <span>ยอดคงค้างรวม</span>
            <strong>{formatCurrency(overview.total_outstanding_amount)} บาท</strong>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${Math.min(utilizationPercent, 100)}%` }} />
          </div>
          <div className="muted">สัดส่วนยอดคงค้างต่อวงเงินกู้รวม {formatCurrency(utilizationPercent)}%</div>
        </section>

        <section className="card insight-card">
          <h3 className="section-title">สัญญาณที่ควรติดตาม</h3>
          <div className="list">
            <div className="list-item">
              <strong>ผู้ใช้รออนุมัติ</strong>
              <div className="muted">มี {overview.pending_users_count} บัญชีที่ต้องตรวจสอบสิทธิ์เข้าใช้งาน</div>
            </div>
            <div className="list-item">
              <strong>สมาชิกที่ปิดใช้งาน</strong>
              <div className="muted">มี {overview.inactive_members_count} รายที่ไม่ได้ใช้งานในระบบปัจจุบัน</div>
            </div>
            <div className="list-item">
              <strong>สัญญาที่ยังคงค้าง</strong>
              <div className="muted">มี {overview.active_loan_contracts_count} สัญญาที่ยังไม่ปิดบัญชี</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
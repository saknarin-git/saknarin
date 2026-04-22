import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppMenu } from '../components/AppMenu';
import { fetchSystemOverview } from '../api/overviewApi';
import { SystemOverviewPanel } from '../components/SystemOverviewPanel';
import { useAuth } from '../contexts/AuthContext';
import type { AdminOverview, AppSettings } from '../types';
import { APP_GROUP_NAME } from '../constants/appBrand';
import { defaultRolePermissions } from '../constants/permissions';

const defaultSettings: AppSettings = {
  group_name: APP_GROUP_NAME,
  notice: '',
  allow_registration: true,
  role_permissions: defaultRolePermissions,
  loan_report_paper_settings: {
    paper_size: 'a4',
    orientation: 'portrait',
    margin_mm: 10,
    font_scale: 1,
    table_width_percent: 100,
    table_height_percent: 100,
    column_settings: {
      sequence: { width_mm: 9, height_mm: 8.5 },
      member_no: { width_mm: 14, height_mm: 8.5 },
      member_name: { width_mm: 45, height_mm: 8.5 },
      opening_balance: { width_mm: 22, height_mm: 8.5 },
      principal_paid: { width_mm: 20, height_mm: 8.5 },
      interest_paid: { width_mm: 20, height_mm: 8.5 },
      remaining_balance: { width_mm: 22, height_mm: 8.5 },
      note: { width_mm: 32, height_mm: 8.5 },
    },
  },
};

const defaultOverview: AdminOverview = {
  members_count: 0,
  active_members_count: 0,
  inactive_members_count: 0,
  users_count: 0,
  approved_users_count: 0,
  pending_users_count: 0,
  dev_admin_users_count: 0,
  officer_users_count: 0,
  admin_users_count: 0,
  loan_contracts_count: 0,
  active_loan_contracts_count: 0,
  closed_loan_contracts_count: 0,
  total_loan_amount: 0,
  total_outstanding_amount: 0,
};

export function DashboardPage() {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? '';
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [overview, setOverview] = useState<AdminOverview>(defaultOverview);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    void loadOverview(accessToken);
  }, [accessToken]);

  async function loadOverview(token: string) {
    try {
      const response = await fetchSystemOverview(token);
      setSettings(response.data.settings);
      setOverview(response.data.overview);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'ไม่สามารถโหลดแดชบอร์ดภาพรวมของระบบได้');
    }
  }

  if (!session) {
    return null;
  }

  const adminShortcutItems = [
    session.permissions.manage_members
      ? {
          path: '/members',
          label: 'ทะเบียนสมาชิก',
          description: `ตรวจสอบและจัดการข้อมูลสมาชิกใช้งาน ${overview.active_members_count} ราย`,
        }
      : null,
    session.permissions.manage_loans
      ? {
          path: '/loans',
          label: 'ศูนย์งานสินเชื่อ',
          description: `ดูสัญญาที่คงค้าง ${overview.active_loan_contracts_count} รายการและจัดการการรับชำระ`,
        }
      : null,
    session.permissions.view_officer_workspace
      ? {
          path: '/officer',
          label: 'OfficerManager',
          description: 'เปิดหน้ารวมงานปฏิบัติการเพื่อประสานงานกับทีม OfficerManager',
        }
      : null,
    session.permissions.access_devmanager
      ? {
          path: '/devmanager',
          label: 'DevManager',
          description: 'เข้าเมนูดูแลระบบ การตั้งค่า สิทธิ์ และการอนุมัติผู้ใช้งาน',
        }
      : null,
    session.permissions.view_user_workspace
      ? {
          path: '/workspace',
          label: 'ข้อมูลส่วนตัว',
          description: 'ดูข้อมูลบัญชี เปลี่ยนรหัสผ่าน และตรวจสิทธิ์ของบัญชีนี้',
        }
      : null,
  ].filter(Boolean) as Array<{ path: string; label: string; description: string }>;

  return (
    <div className="page-shell">
      <AppMenu title="AdminManager" />

      <div className="hero">
        <h1>AdminManager</h1>
        <p>รวมเมนูหลักของผู้ใช้ระดับ 2 ไว้ในหน้าเดียว เพื่อเข้าถึงงานสมาชิก สินเชื่อ การกำกับงาน OfficerManager และภาพรวมระบบได้เร็วขึ้น</p>
      </div>

      {errorMessage && <div className="alert-error">{errorMessage}</div>}

      <div className="devmanager-section-stack">
        <section className="card officer-focus-card">
          <div className="eyebrow">ระดับ 2</div>
          <h3 className="section-title">เมนูหลัก AdminManager</h3>
          <p className="muted">ใช้หน้านี้เป็นจุดรวมศูนย์สำหรับงานประจำวันของ AdminManager โดยไม่ต้องไล่เปิดเมนูทีละหน้า</p>
          <div className="dashboard-shortcuts">
            {adminShortcutItems.map((item) => (
              <Link key={item.path} to={item.path} className="shortcut-card shortcut-link-card devmanager-card-link">
                <strong>{item.label}</strong>
                <div className="muted">{item.description}</div>
              </Link>
            ))}
          </div>
        </section>

        <div className="grid-two">
          <section className="card">
            <h3 className="section-title">สถานะงานวันนี้</h3>
            <div className="stats-row">
              <div className="stat-chip">สมาชิกใช้งาน {overview.active_members_count}</div>
              <div className="stat-chip">สินเชื่อคงค้าง {overview.active_loan_contracts_count}</div>
              <div className="stat-chip">ผู้ใช้รออนุมัติ {overview.pending_users_count}</div>
            </div>
            <div className="notice">ประกาศปัจจุบัน: {settings.notice || 'ยังไม่มีประกาศ'}</div>
          </section>

          <section className="card">
            <h3 className="section-title">ขอบเขตหน้าที่ของ AdminManager</h3>
            <div className="list">
              <div className="list-item">
                <strong>กำกับงานปฏิบัติการ</strong>
                <div className="muted">ดูแลคุณภาพข้อมูลสมาชิกและสินเชื่อ พร้อมประสานงานกับ OfficerManager เมื่อมีงานคงค้าง</div>
              </div>
              <div className="list-item">
                <strong>ติดตามการอนุมัติ</strong>
                <div className="muted">ตรวจสอบบัญชีรออนุมัติและผลกระทบต่อการใช้งานระบบของกลุ่ม</div>
              </div>
              <div className="list-item">
                <strong>เชื่อมกับ DevManager</strong>
                <div className="muted">เมื่อจำเป็นต้องเปลี่ยนสิทธิ์หรือค่าระบบเชิงลึก สามารถส่งต่อหรือเข้าหน้า DevManager ได้ทันที</div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <SystemOverviewPanel
        overview={overview}
        settings={settings}
        title="ภาพรวมระบบสำหรับ AdminManager"
        description="ใช้ดูภาพรวมของสมาชิก บัญชีผู้ใช้งาน และสินเชื่อจากข้อมูลล่าสุด เพื่อประกอบการตัดสินใจในงานกำกับดูแล"
      />
    </div>
  );
}
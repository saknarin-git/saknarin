import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchSystemOverview } from '../api/overviewApi';
import { AppMenu } from '../components/AppMenu';
import { APP_GROUP_NAME } from '../constants/appBrand';
import { defaultRolePermissions } from '../constants/permissions';
import { useAuth } from '../contexts/AuthContext';
import type { AdminOverview, AppSettings } from '../types';

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
      sequence: { width_mm: 9, height_px: 32 },
      member_no: { width_mm: 14, height_px: 32 },
      member_name: { width_mm: 45, height_px: 32 },
      opening_balance: { width_mm: 22, height_px: 32 },
      principal_paid: { width_mm: 20, height_px: 32 },
      interest_paid: { width_mm: 20, height_px: 32 },
      remaining_balance: { width_mm: 22, height_px: 32 },
      note: { width_mm: 32, height_px: 32 },
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

export function OfficerWorkspacePage() {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? '';
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [overview, setOverview] = useState<AdminOverview>(defaultOverview);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    void loadOfficerContext(accessToken);
  }, [accessToken]);

  async function loadOfficerContext(token: string) {
    try {
      const response = await fetchSystemOverview(token);
      setSettings(response.data.settings);
      setOverview(response.data.overview);
    } catch {
      setSettings(defaultSettings);
      setOverview(defaultOverview);
    }
  }

  if (!session) {
    return null;
  }

  const officerShortcutItems = [
    session.permissions.manage_members
      ? {
          path: '/members',
          label: 'ทะเบียนสมาชิก',
          description: `จัดการสมาชิกใช้งาน ${overview.active_members_count} รายและตรวจสอบข้อมูลค้าง`,
        }
      : null,
    session.permissions.manage_loans
      ? {
          path: '/loans',
          label: 'ศูนย์งานสินเชื่อ',
          description: `ทำรายการรับชำระและติดตามสัญญาคงค้าง ${overview.active_loan_contracts_count} รายการ`,
        }
      : null,
    session.permissions.view_user_workspace
      ? {
          path: '/workspace',
          label: 'ข้อมูลส่วนตัว',
          description: 'ดูข้อมูลบัญชี เปลี่ยนรหัสผ่าน และตรวจสอบสิทธิ์ของบัญชีนี้',
        }
      : null,
    session.permissions.view_system_dashboard
      ? {
          path: '/dashboard',
          label: 'AdminManager',
          description: 'ดูภาพรวมระบบและสถานะงานจากมุมมองผู้กำกับดูแลระดับสูงกว่า',
        }
      : null,
  ].filter(Boolean) as Array<{ path: string; label: string; description: string }>;

  return (
    <div className="page-shell">
      <AppMenu title="OfficerManager" />

      <div className="hero">
        <h1>OfficerManager</h1>
        <p>รวมเมนูทำงานของผู้ใช้ระดับ 3 ไว้ในหน้าเดียว เพื่อเปิดงานสมาชิก สินเชื่อ และข้อมูลส่วนตัวได้แบบรวมศูนย์เหมือน DevManager</p>
      </div>

      <div className="devmanager-section-stack">
        <section className="card officer-focus-card">
          <div className="eyebrow">ระดับ 3</div>
          <h3 className="section-title">เมนูหลัก OfficerManager ของ {settings.group_name || APP_GROUP_NAME}</h3>
          <p className="muted">ใช้หน้านี้เป็นจุดเริ่มต้นของงานประจำวัน เลือกการ์ดที่ต้องการเพื่อเข้าไปทำรายการหรือแก้ไขข้อมูลได้ทันที</p>
          <div className="dashboard-shortcuts">
            {officerShortcutItems.map((item) => (
              <Link key={item.path} to={item.path} className="shortcut-card shortcut-link-card devmanager-card-link">
                <strong>{item.label}</strong>
                <div className="muted">{item.description}</div>
              </Link>
            ))}
          </div>
          {!session.permissions.manage_members && !session.permissions.manage_loans && (
            <div className="notice">บทบาทของคุณเข้า OfficerManager ได้ แต่ยังไม่ได้รับสิทธิ์จัดการทะเบียนสมาชิกหรือสินเชื่อ</div>
          )}
        </section>

        <div className="officer-workspace-grid">
          <section className="card">
            <h3 className="section-title">คิวงานที่ต้องติดตาม</h3>
            <div className="list">
              <div className="list-item">
                <strong>สมาชิกที่ปิดใช้งาน</strong>
                <div className="muted">มี {overview.inactive_members_count} รายที่ควรตรวจสอบข้อมูลหรือสถานะล่าสุด</div>
              </div>
              <div className="list-item">
                <strong>สัญญาที่ยังคงค้าง</strong>
                <div className="muted">มี {overview.active_loan_contracts_count} สัญญาที่ควรติดตามการชำระและสถานะ</div>
              </div>
              <div className="list-item">
                <strong>ผู้ใช้งานรออนุมัติ</strong>
                <div className="muted">มี {overview.pending_users_count} บัญชีรอการอนุมัติจากผู้ดูแลระบบ</div>
              </div>
            </div>
          </section>

          <section className="card officer-kanban-card">
            <h3 className="section-title">workflow งานประจำวัน</h3>
            <div className="officer-kanban-grid">
              <div className="workflow-column">
                <div className="workflow-heading">ตรวจข้อมูลสมาชิก</div>
                <div className="workflow-item">เช็กชื่อ-สกุล สถานะใช้งาน และความครบถ้วนของข้อมูลสมาชิก</div>
                <div className="workflow-item">ปรับข้อมูลทะเบียนสมาชิกเมื่อมีการเปลี่ยนแปลงหรือพบข้อมูลตกหล่น</div>
              </div>
              <div className="workflow-column">
                <div className="workflow-heading">ติดตามสินเชื่อ</div>
                <div className="workflow-item">ค้นหาสัญญาที่ยังคงค้างและตรวจสถานะการชำระล่าสุด</div>
                <div className="workflow-item">อัปเดตยอดคงค้าง ข้อมูลผู้ค้ำประกัน และสถานะของสัญญา</div>
              </div>
              <div className="workflow-column">
                <div className="workflow-heading">ส่งต่อให้ผู้ดูแลระบบ</div>
                <div className="workflow-item">แจ้งกรณีที่ต้องอนุมัติผู้ใช้งานหรือต้องใช้สิทธิ์ DevManager</div>
                <div className="workflow-item">ประสานงานเมื่อมีการตั้งค่าระบบหรือนำเข้าฐานข้อมูลใหม่</div>
              </div>
            </div>
          </section>

          <section className="card">
            <h3 className="section-title">ตัวเลขอ้างอิงสำหรับ OfficerManager</h3>
            <div className="stats-row">
              <div className="stat-chip">สมาชิกทั้งหมด {overview.members_count}</div>
              <div className="stat-chip">สมาชิกใช้งาน {overview.active_members_count}</div>
              <div className="stat-chip">สินเชื่อทั้งหมด {overview.loan_contracts_count}</div>
              <div className="stat-chip">OfficerManager ในระบบ {overview.officer_users_count}</div>
            </div>
            <div className="notice">ใช้ตัวเลขชุดนี้เป็นจุดเริ่มต้นก่อนเข้าไปจัดการข้อมูลเชิงลึกรายสมาชิกหรือรายสัญญา</div>
          </section>
        </div>
      </div>
    </div>
  );
}
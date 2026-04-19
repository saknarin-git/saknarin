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

  return (
    <div className="page-shell">
      <AppMenu title="ศูนย์งานเจ้าหน้าที่" />

      <div className="hero">
        <h1>ศูนย์งานเจ้าหน้าที่</h1>
        <p>พื้นที่ทำงานประจำวันสำหรับจัดการงานปฏิบัติการด้านสมาชิกและสินเชื่อ แยกจาก DevManager อย่างชัดเจน</p>
      </div>

      <div className="officer-workspace-grid">
        <section className="card officer-focus-card">
          <div className="eyebrow">งานสำคัญวันนี้</div>
          <h3 className="section-title">ภาพรวมงานปฏิบัติการของ {settings.group_name || APP_GROUP_NAME}</h3>
          <div className="dashboard-shortcuts">
            {session.permissions.manage_members && (
              <Link to="/members" className="shortcut-card shortcut-link-card">
                <strong>ตรวจทะเบียนสมาชิก</strong>
                <div className="muted">สมาชิกใช้งานอยู่ {overview.active_members_count} ราย พร้อมตรวจข้อมูลเพิ่มเติม</div>
              </Link>
            )}
            {session.permissions.manage_loans && (
              <Link to="/loans" className="shortcut-card shortcut-link-card">
                <strong>ติดตามสัญญาเงินกู้</strong>
                <div className="muted">สัญญาที่ยังคงค้าง {overview.active_loan_contracts_count} รายการ</div>
              </Link>
            )}
            <Link to="/workspace" className="shortcut-card shortcut-link-card">
              <strong>กลับข้อมูลส่วนตัว</strong>
              <div className="muted">จัดการข้อมูลส่วนตัว รหัสผ่าน และสิทธิ์การเข้าถึงของบัญชี</div>
            </Link>
          </div>
          {!session.permissions.manage_members && !session.permissions.manage_loans && (
            <div className="notice">บทบาทของคุณเข้าหน้าศูนย์งานเจ้าหน้าที่ได้ แต่ยังไม่ได้รับสิทธิ์จัดการทะเบียนสมาชิกหรือสินเชื่อ</div>
          )}
        </section>

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
          <h3 className="section-title">ตัวเลขอ้างอิงสำหรับเจ้าหน้าที่</h3>
          <div className="stats-row">
            <div className="stat-chip">สมาชิกทั้งหมด {overview.members_count}</div>
            <div className="stat-chip">สมาชิกใช้งาน {overview.active_members_count}</div>
            <div className="stat-chip">สินเชื่อทั้งหมด {overview.loan_contracts_count}</div>
            <div className="stat-chip">เจ้าหน้าที่ในระบบ {overview.officer_users_count}</div>
          </div>
          <div className="notice">ใช้ตัวเลขชุดนี้เป็นจุดเริ่มต้นก่อนเข้าไปจัดการข้อมูลเชิงลึกรายสมาชิกหรือรายสัญญา</div>
        </section>
      </div>
    </div>
  );
}
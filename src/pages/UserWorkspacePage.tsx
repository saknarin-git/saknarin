import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { InputField } from '../components/InputField';
import { AppMenu } from '../components/AppMenu';
import { changePassword, updateProfile } from '../api/profileApi';
import { fetchSystemOverview } from '../api/overviewApi';
import { useAuth } from '../contexts/AuthContext';
import { StatusBadge } from '../components/StatusBadge';
import type { AdminOverview, AppSettings, ProfileUpdatePayload, TitlePrefix, UserRole } from '../types';
import { APP_GROUP_NAME } from '../constants/appBrand';
import { defaultRolePermissions, roleLabels } from '../constants/permissions';

const titleOptions: TitlePrefix[] = ['นาย', 'นาง', 'นางสาว', 'เด็กชาย', 'เด็กหญิง'];

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

function getRoleLabel(role: UserRole) {
  if (role === 'dev_admin') {
    return 'DevManager';
  }

  if (role === 'member') {
    return 'สมาชิกทั่วไป';
  }

  return roleLabels[role];
}

export function UserWorkspacePage() {
  const { session, setSessionData } = useAuth();
  const accessToken = session?.access_token ?? '';
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [overview, setOverview] = useState<AdminOverview>(defaultOverview);
  const [form, setForm] = useState<ProfileUpdatePayload>({
    title: 'นาย',
    first_name: '',
    last_name: '',
  });
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  useEffect(() => {
    if (!session) {
      return;
    }

    setForm({
      title: session.user.title,
      first_name: session.user.first_name,
      last_name: session.user.last_name,
    });
  }, [session, session?.user.first_name, session?.user.last_name, session?.user.title]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    void loadWorkspaceContext(accessToken);
  }, [accessToken]);

  async function loadWorkspaceContext(token: string) {
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

  const currentSession = session;

  function renderRoleWidgets() {
    if (currentSession.user.role === 'dev_admin') {
      return (
        <>
          <div className="card role-widget-card role-widget-admin">
            <h3 className="section-title">ศูนย์ควบคุม DevManager</h3>
            <div className="dashboard-shortcuts">
              <Link to="/devmanager" className="shortcut-card shortcut-link-card">
                <strong>ตั้งค่าสิทธิ์ทั้งระบบ</strong>
                <div className="muted">กำหนดสิทธิ์แต่ละบทบาท จัดการผู้ใช้ และตั้งค่าระบบทั้งหมด</div>
              </Link>
              <Link to="/members" className="shortcut-card shortcut-link-card">
                <strong>ทะเบียนสมาชิก</strong>
                <div className="muted">ดูและแก้ไขข้อมูลสมาชิกทั้งหมด {overview.members_count} ราย</div>
              </Link>
              <Link to="/loans" className="shortcut-card shortcut-link-card">
                <strong>สินเชื่อ</strong>
                <div className="muted">ติดตามสัญญาเงินกู้ {overview.loan_contracts_count} รายการ</div>
              </Link>
            </div>
          </div>
          <div className="card role-widget-card">
            <h3 className="section-title">งานค้างสำคัญ</h3>
            <div className="list">
              <div className="list-item">
                <strong>ผู้ใช้งานรออนุมัติ</strong>
                <div className="muted">ยังมี {overview.pending_users_count} บัญชีที่รอการตรวจสอบจากผู้ดูแลระบบ</div>
              </div>
              <div className="list-item">
                <strong>ผู้ดูแลสิทธิ์ในระบบ</strong>
                <div className="muted">มี DevManager {overview.dev_admin_users_count} คน, Admin {overview.admin_users_count} คน และเจ้าหน้าที่ {overview.officer_users_count} คน</div>
              </div>
            </div>
          </div>
        </>
      );
    }

    if (currentSession.user.role === 'admin') {
      return (
        <>
          <div className="card role-widget-card role-widget-admin">
            <h3 className="section-title">ศูนย์ควบคุมผู้ดูแลระบบ</h3>
            <div className="dashboard-shortcuts">
              {currentSession.permissions.access_devmanager && (
                <Link to="/devmanager" className="shortcut-card shortcut-link-card">
                  <strong>เปิด DevManager</strong>
                  <div className="muted">ใช้งานเครื่องมือบริหารระบบตามสิทธิ์ที่ DevManager กำหนด</div>
                </Link>
              )}
              {currentSession.permissions.manage_members && (
                <Link to="/members" className="shortcut-card shortcut-link-card">
                  <strong>ทะเบียนสมาชิก</strong>
                  <div className="muted">ดูและแก้ไขข้อมูลสมาชิกทั้งหมด {overview.members_count} ราย</div>
                </Link>
              )}
              {currentSession.permissions.manage_loans && (
                <Link to="/loans" className="shortcut-card shortcut-link-card">
                  <strong>สินเชื่อ</strong>
                  <div className="muted">ติดตามสัญญาเงินกู้ {overview.loan_contracts_count} รายการ</div>
                </Link>
              )}
            </div>
          </div>
          <div className="card role-widget-card">
            <h3 className="section-title">ขอบเขตการดูแล</h3>
            <div className="list">
              <div className="list-item">
                <strong>สิทธิ์ปัจจุบันของคุณ</strong>
                <div className="muted">หน้าและเมนูที่เห็นอยู่ตอนนี้ถูกควบคุมจากตารางสิทธิ์ที่ DevManager กำหนด</div>
              </div>
            </div>
          </div>
        </>
      );
    }

    if (currentSession.user.role === 'officer') {
      return (
        <>
          <div className="card role-widget-card role-widget-officer">
            <h3 className="section-title">พื้นที่ทำงานของเจ้าหน้าที่</h3>
            <div className="dashboard-shortcuts">
              <Link to="/officer" className="shortcut-card shortcut-link-card">
                <strong>เปิดศูนย์งานเจ้าหน้าที่</strong>
                <div className="muted">workflow งานประจำวันและภาพรวมงานปฏิบัติการในหน้าเดียว</div>
              </Link>
              <Link to="/members" className="shortcut-card shortcut-link-card">
                <strong>ตรวจทะเบียนสมาชิก</strong>
                <div className="muted">สมาชิกใช้งานอยู่ {overview.active_members_count} ราย พร้อมตรวจข้อมูลเพิ่มเติม</div>
              </Link>
              <Link to="/loans" className="shortcut-card shortcut-link-card">
                <strong>ติดตามสินเชื่อ</strong>
                <div className="muted">สัญญาที่ยังคงค้าง {overview.active_loan_contracts_count} รายการ</div>
              </Link>
            </div>
          </div>
          <div className="card role-widget-card">
            <h3 className="section-title">ภาพรวมงานปฏิบัติการ</h3>
            <div className="list">
              <div className="list-item">
                <strong>สมาชิกที่ต้องติดตาม</strong>
                <div className="muted">มีสมาชิกที่ปิดใช้งาน {overview.inactive_members_count} ราย ควรตรวจสอบความครบถ้วนของข้อมูล</div>
              </div>
              <div className="list-item">
                <strong>สินเชื่อคงค้าง</strong>
                <div className="muted">มีสัญญาที่ยังไม่ปิดบัญชี {overview.active_loan_contracts_count} รายการ</div>
              </div>
            </div>
          </div>
        </>
      );
    }

    return (
      <>
        <div className="card role-widget-card role-widget-member">
          <h3 className="section-title">ศูนย์บริการสมาชิก</h3>
          <div className="list">
            <div className="list-item">
              <strong>ประกาศจากระบบ</strong>
              <div className="muted">{settings.notice || 'ยังไม่มีประกาศล่าสุดจากผู้ดูแลระบบ'}</div>
            </div>
            <div className="list-item">
              <strong>สถานะบัญชี</strong>
              <div className="muted">
                {currentSession.user.approval_status === 'approved'
                  ? 'บัญชีของคุณได้รับอนุมัติแล้ว สามารถใช้งานระบบตามสิทธิ์ของสมาชิกได้'
                  : currentSession.user.approval_status === 'pending'
                    ? 'บัญชียังอยู่ระหว่างการอนุมัติ กรุณารอการตรวจสอบจากผู้ดูแลระบบ'
                    : 'บัญชีถูกปฏิเสธการใช้งาน กรุณาติดต่อผู้ดูแลระบบ'}
              </div>
            </div>
          </div>
        </div>
        <div className="card role-widget-card">
          <h3 className="section-title">ข้อมูลที่เข้าถึงได้</h3>
          <div className="list">
            <div className="list-item">
              <strong>แดชบอร์ดภาพรวมระบบ</strong>
              <div className="muted">คุณสามารถดูภาพรวมของกลุ่มได้จากหน้า ภาพรวมระบบ ตลอดเวลา</div>
            </div>
            <div className="list-item">
              <strong>ข้อมูลส่วนตัวและรหัสผ่าน</strong>
              <div className="muted">ใช้หน้านี้ในการแก้ไขชื่อ-สกุล และเปลี่ยนรหัสผ่านของตนเอง</div>
            </div>
          </div>
        </div>
      </>
    );
  }

  const handleProfileSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    setErrorMessage('');
    setSaving(true);

    try {
      const response = await updateProfile(currentSession.access_token, form);

      if (!response.data) {
        throw new Error('ไม่พบข้อมูลผู้ใช้งานที่อัปเดตแล้ว');
      }

      setSessionData({
        ...currentSession,
        user: response.data,
      });
      setMessage(response.message);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'ไม่สามารถบันทึกข้อมูลส่วนตัวได้');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordMessage('');
    setPasswordError('');

    if (!passwordForm.current_password || !passwordForm.new_password || !passwordForm.confirm_password) {
      setPasswordError('กรุณากรอกรหัสผ่านให้ครบทุกช่อง');
      return;
    }

    if (passwordForm.new_password.length < 6) {
      setPasswordError('รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร');
      return;
    }

    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setPasswordError('ยืนยันรหัสผ่านใหม่ไม่ตรงกัน');
      return;
    }

    setChangingPassword(true);

    try {
      const response = await changePassword(currentSession.access_token, {
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });
      setPasswordMessage(response.message);
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'ไม่สามารถเปลี่ยนรหัสผ่านได้');
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="page-shell">
      <AppMenu title="แดชบอร์ดผู้ใช้งาน" />

      <div className="hero">
        <h1>แดชบอร์ดผู้ใช้งานของ {session.user.title}{session.user.first_name} {session.user.last_name}</h1>
        <p>ใช้หน้านี้สำหรับจัดการข้อมูลส่วนตัว รหัสผ่าน และดูสิทธิ์การเข้าถึงตามบทบาทของคุณ</p>
      </div>

      <div className="grid-two">
        <div className="card">
          <p><strong>Username:</strong> {session.user.username}</p>
          <p><strong>บทบาท:</strong> {getRoleLabel(session.user.role)}</p>
          <p><strong>ชื่อกลุ่ม:</strong> {settings.group_name || APP_GROUP_NAME}</p>
          <p><strong>สถานะบัญชี:</strong> <StatusBadge status={session.user.approval_status} /></p>
          <div className="notice">{settings.notice || 'ยังไม่มีประกาศจากผู้ดูแลระบบ'}</div>
        </div>

        <div className="card">
          <h3 className="section-title">สิทธิ์และหน้าที่ของคุณ</h3>
          {session.user.role === 'dev_admin' ? (
            <div className="list">
              <div className="list-item">
                <strong>เข้าถึงการตั้งค่าสิทธิ์ทั้งระบบ</strong>
                <div className="muted">คุณสามารถกำหนดสิทธิ์การเข้าถึงหน้าเว็บของทุกบทบาทได้จากหน้า DevManager</div>
              </div>
              <div className="actions compact-actions">
                <Link to="/devmanager" className="btn btn-primary">เปิด DevManager</Link>
                <Link to="/officer" className="btn btn-secondary">ศูนย์งานเจ้าหน้าที่</Link>
                <Link to="/members" className="btn btn-secondary">ทะเบียนสมาชิก</Link>
                <Link to="/loans" className="btn btn-secondary">สินเชื่อ</Link>
              </div>
            </div>
          ) : session.user.role === 'admin' ? (
            <div className="list">
              <div className="list-item">
                <strong>เข้าถึงข้อมูลผู้ดูแลระบบ</strong>
                <div className="muted">คุณสามารถเข้าถึงหน้าต่าง ๆ ตามสิทธิ์ที่ DevManager กำหนดให้กับบทบาท Admin</div>
              </div>
              <div className="actions compact-actions">
                {session.permissions.access_devmanager && <Link to="/devmanager" className="btn btn-primary">เปิด DevManager</Link>}
                {session.permissions.view_officer_workspace && <Link to="/officer" className="btn btn-secondary">ศูนย์งานเจ้าหน้าที่</Link>}
                {session.permissions.manage_members && <Link to="/members" className="btn btn-secondary">ทะเบียนสมาชิก</Link>}
                {session.permissions.manage_loans && <Link to="/loans" className="btn btn-secondary">สินเชื่อ</Link>}
              </div>
            </div>
          ) : session.user.role === 'officer' ? (
            <div className="list">
              <div className="list-item">
                <strong>เข้าถึงงานปฏิบัติการ</strong>
                <div className="muted">คุณสามารถเข้าถึงทะเบียนสมาชิกและสินเชื่อเพื่อทำงานประจำวัน แต่ไม่เข้าถึงการตั้งค่า DevManager</div>
              </div>
              <div className="actions compact-actions">
                <Link to="/officer" className="btn btn-primary">ศูนย์งานเจ้าหน้าที่</Link>
                <Link to="/members" className="btn btn-secondary">ทะเบียนสมาชิก</Link>
                <Link to="/loans" className="btn btn-secondary">สินเชื่อ</Link>
              </div>
            </div>
          ) : (
            <div className="list">
              <div className="list-item">
                <strong>เข้าถึงข้อมูลส่วนตัวและภาพรวมระบบ</strong>
                <div className="muted">สมาชิกทั่วไปสามารถดูแดชบอร์ดภาพรวมของระบบ และจัดการข้อมูลบัญชีของตนเองได้</div>
              </div>
              <div className="list-item">
                <strong>สถานะการใช้งาน</strong>
                <div className="muted">
                  {session.user.approval_status === 'approved'
                    ? 'บัญชีของคุณได้รับอนุมัติแล้ว สามารถใช้งานส่วนที่ระบบเปิดให้ตามบทบาทได้'
                    : session.user.approval_status === 'pending'
                      ? 'บัญชีของคุณกำลังรอการอนุมัติจากผู้ดูแลระบบ'
                      : 'บัญชีของคุณถูกปฏิเสธการใช้งาน กรุณาติดต่อผู้ดูแลระบบ'}
                </div>
              </div>
            </div>
          )}
        </div>

        {renderRoleWidgets()}

        <div className="card">
          <h3 className="section-title">แก้ไขข้อมูลส่วนตัว</h3>
          <form onSubmit={handleProfileSave}>
            <label className="field">
              <span>คำนำหน้าชื่อ</span>
              <select
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value as TitlePrefix }))}
              >
                {titleOptions.map((title) => (
                  <option key={title} value={title}>{title}</option>
                ))}
              </select>
            </label>
            <InputField
              label="ชื่อ"
              value={form.first_name}
              onChange={(event) => setForm((current) => ({ ...current, first_name: event.target.value }))}
              required
            />
            <InputField
              label="สกุล"
              value={form.last_name}
              onChange={(event) => setForm((current) => ({ ...current, last_name: event.target.value }))}
              required
            />
            <div className="muted">Username และเลขสมาชิกแก้ไขจากหน้านี้ไม่ได้ เพื่อป้องกันความคลาดเคลื่อนกับข้อมูลสมาชิกหลัก</div>
            {message && <div className="notice">{message}</div>}
            {errorMessage && <div className="alert-error">{errorMessage}</div>}
            <div className="actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูลส่วนตัว'}
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <h3 className="section-title">เปลี่ยนรหัสผ่าน</h3>
          <form onSubmit={handlePasswordSave}>
            <InputField
              label="รหัสผ่านเดิม"
              type="password"
              value={passwordForm.current_password}
              onChange={(event) => setPasswordForm((current) => ({ ...current, current_password: event.target.value }))}
              required
            />
            <InputField
              label="รหัสผ่านใหม่"
              type="password"
              value={passwordForm.new_password}
              onChange={(event) => setPasswordForm((current) => ({ ...current, new_password: event.target.value }))}
              required
            />
            <InputField
              label="ยืนยันรหัสผ่านใหม่"
              type="password"
              value={passwordForm.confirm_password}
              onChange={(event) => setPasswordForm((current) => ({ ...current, confirm_password: event.target.value }))}
              required
            />
            <div className="muted">รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร</div>
            {passwordMessage && <div className="notice">{passwordMessage}</div>}
            {passwordError && <div className="alert-error">{passwordError}</div>}
            <div className="actions">
              <button type="submit" className="btn btn-primary" disabled={changingPassword}>
                {changingPassword ? 'กำลังเปลี่ยนรหัสผ่าน...' : 'เปลี่ยนรหัสผ่าน'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
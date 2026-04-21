import { useEffect, useState } from 'react';
import { InputField } from '../components/InputField';
import { AppMenu } from '../components/AppMenu';
import { changePassword, fetchUserProfile, updateProfile } from '../api/profileApi';
import { useAuth } from '../contexts/AuthContext';
import { StatusBadge } from '../components/StatusBadge';
import type { PermissionKey, ProfileUpdatePayload, TitlePrefix, UserProfileDetails, UserRole } from '../types';
import { permissionLabels, roleLabels } from '../constants/permissions';
import { formatDateTime } from '../utils/dateFormat';

const titleOptions: TitlePrefix[] = ['นาย', 'นาง', 'นางสาว', 'เด็กชาย', 'เด็กหญิง'];

function getRoleLabel(role: UserRole) {
  if (role === 'dev_admin') {
    return 'DevManager';
  }

  if (role === 'member') {
    return 'สมาชิกทั่วไป';
  }

  return roleLabels[role];
}

function getPermissionEntries(profile: UserProfileDetails) {
  return (Object.keys(profile.permissions) as PermissionKey[]).map((key) => ({
    key,
    label: permissionLabels[key],
    enabled: profile.permissions[key],
  }));
}

function getEnabledPermissionCount(profile: UserProfileDetails) {
  return getPermissionEntries(profile).filter((item) => item.enabled).length;
}

export function UserWorkspacePage() {
  const { session, setSessionData } = useAuth();
  const accessToken = session?.access_token ?? '';
  const [profile, setProfile] = useState<UserProfileDetails | null>(null);
  const [form, setForm] = useState<ProfileUpdatePayload>({
    title: 'นาย',
    first_name: '',
    last_name: '',
  });
  const [loadingProfile, setLoadingProfile] = useState(true);
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
    if (!session || !profile) {
      return;
    }

    setForm({
      title: profile.user.title,
      first_name: profile.user.first_name,
      last_name: profile.user.last_name,
    });
  }, [profile, session]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    void loadProfile(accessToken);
  }, [accessToken]);

  async function loadProfile(token: string) {
    setLoadingProfile(true);

    try {
      const response = await fetchUserProfile(token);
      setProfile(response.data);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'ไม่สามารถโหลดข้อมูลส่วนตัวได้');
    } finally {
      setLoadingProfile(false);
    }
  }

  if (!session) {
    return null;
  }

  const currentSession = session;
  const enabledPermissionCount = profile ? getEnabledPermissionCount(profile) : 0;

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

      setProfile(response.data);
      setSessionData({
        ...currentSession,
        user: response.data.user,
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

  const permissionEntries = profile ? getPermissionEntries(profile) : [];

  return (
    <div className="page-shell profile-dashboard-page">
      <AppMenu title="ข้อมูลส่วนตัว" />

      <div className="hero profile-hero">
        <div className="profile-hero-main">
          <div className="profile-avatar" aria-hidden="true">
            {session.user.first_name.slice(0, 1)}
          </div>
          <div className="profile-hero-copy">
            <div className="eyebrow">Profile Dashboard</div>
            <h1>ข้อมูลส่วนตัวของ {session.user.title}{session.user.first_name} {session.user.last_name}</h1>
            <p>พื้นที่นี้ใช้แสดงข้อมูลผู้ใช้งานทั้งหมดที่เกี่ยวข้องกับบัญชีของคุณ โดยแก้ไขได้เฉพาะข้อมูลที่ระบบอนุญาตเท่านั้น</p>
          </div>
        </div>
        <div className="profile-hero-badges">
          <div className="profile-hero-badge">
            <span>บทบาท</span>
            <strong>{getRoleLabel(session.user.role)}</strong>
          </div>
          <div className="profile-hero-badge">
            <span>สิทธิ์ที่เปิดใช้งาน</span>
            <strong>{enabledPermissionCount} / {permissionEntries.length}</strong>
          </div>
          <div className="profile-hero-badge">
            <span>สถานะบัญชี</span>
            <strong>{session.user.approval_status === 'approved' ? 'พร้อมใช้งาน' : session.user.approval_status === 'pending' ? 'รออนุมัติ' : 'ถูกปฏิเสธ'}</strong>
          </div>
        </div>
      </div>

      <div className="profile-stats-grid">
        <div className="card profile-stat-card">
          <span className="profile-stat-label">ชื่อกลุ่ม</span>
          <div className="profile-stat-value">{profile?.settings.group_name ?? '-'}</div>
          <div className="muted">ชื่อกลุ่มที่บัญชีนี้สังกัดอยู่ในระบบ</div>
        </div>
        <div className="card profile-stat-card">
          <span className="profile-stat-label">สถานะบัญชี</span>
          <div className="profile-stat-value"><StatusBadge status={session.user.approval_status} /></div>
          <div className="muted">สถานะการอนุมัติสำหรับการเข้าใช้งานระบบ</div>
        </div>
        <div className="card profile-stat-card">
          <span className="profile-stat-label">สถานะสมาชิก</span>
          <div className="profile-stat-value">{profile?.member.active ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}</div>
          <div className="muted">สถานะข้อมูลในทะเบียนสมาชิกหลัก</div>
        </div>
        <div className="card profile-stat-card">
          <span className="profile-stat-label">สร้างบัญชีเมื่อ</span>
          <div className="profile-stat-value profile-stat-value-small">{formatDateTime(profile?.account.created_at ?? null)}</div>
          <div className="muted">วันและเวลาที่สร้างบัญชีผู้ใช้งานนี้</div>
        </div>
      </div>

      <div className="profile-dashboard-grid">
        <section className="card profile-dashboard-card profile-dashboard-card-wide profile-summary-card">
          <div className="profile-summary-topbar">
            <div>
              <div className="eyebrow">Account Summary</div>
              <h3 className="section-title">ข้อมูลบัญชีและข้อมูลอ้างอิง</h3>
            </div>
            <StatusBadge status={session.user.approval_status} />
          </div>
          <div className="profile-detail-grid">
            <div className="profile-detail-item">
              <span className="profile-detail-label">Username</span>
              <strong>{session.user.username}</strong>
            </div>
            <div className="profile-detail-item">
              <span className="profile-detail-label">เลขสมาชิก</span>
              <strong>{session.user.member_no}</strong>
            </div>
            <div className="profile-detail-item">
              <span className="profile-detail-label">บทบาทปัจจุบัน</span>
              <strong>{getRoleLabel(session.user.role)}</strong>
            </div>
            <div className="profile-detail-item">
              <span className="profile-detail-label">อนุมัติบัญชีเมื่อ</span>
              <strong>{formatDateTime(profile?.account.approved_at ?? null)}</strong>
            </div>
          </div>
          <div className="notice">{profile?.settings.notice || 'ยังไม่มีประกาศจากผู้ดูแลระบบ'}</div>
        </section>

        <section className="card profile-dashboard-card">
          <h3 className="section-title">ข้อมูลที่แก้ไขไม่ได้</h3>
          <div className="readonly-list">
            <div className="readonly-row">
              <span className="readonly-label">Username</span>
              <strong>{session.user.username}</strong>
            </div>
            <div className="readonly-row">
              <span className="readonly-label">เลขสมาชิก</span>
              <strong>{session.user.member_no}</strong>
            </div>
            <div className="readonly-row">
              <span className="readonly-label">สร้างบัญชีเมื่อ</span>
              <strong>{formatDateTime(profile?.account.created_at ?? null)}</strong>
            </div>
            <div className="readonly-row">
              <span className="readonly-label">อนุมัติบัญชีเมื่อ</span>
              <strong>{formatDateTime(profile?.account.approved_at ?? null)}</strong>
            </div>
            <div className="readonly-row">
              <span className="readonly-label">สถานะเดิมจากทะเบียน</span>
              <strong>{profile?.member.legacy_status || '-'}</strong>
            </div>
            <div className="readonly-row">
              <span className="readonly-label">ปรับปรุงทะเบียนล่าสุด</span>
              <strong>{formatDateTime(profile?.member.updated_at ?? null)}</strong>
            </div>
          </div>
        </section>

        <section className="card profile-dashboard-card">
          <h3 className="section-title">สิทธิ์การเข้าถึงปัจจุบัน</h3>
          <div className="permission-summary-strip">
            <div className="permission-summary-box">
              <span>สิทธิ์ที่เปิด</span>
              <strong>{enabledPermissionCount}</strong>
            </div>
            <div className="permission-summary-box">
              <span>สิทธิ์ที่ปิด</span>
              <strong>{permissionEntries.length - enabledPermissionCount}</strong>
            </div>
          </div>
          <div className="permission-pill-grid">
            {permissionEntries.map((item) => (
              <div key={item.key} className={`permission-pill ${item.enabled ? 'permission-pill-enabled' : 'permission-pill-disabled'}`}>
                <strong>{item.label}</strong>
                <span>{item.enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</span>
              </div>
            ))}
          </div>
          <div className="muted">สิทธิ์เหล่านี้ถูกกำหนดจากบทบาท {getRoleLabel(currentSession.user.role)} โดยผู้ดูแลระบบ</div>
        </section>

        <section className="card profile-dashboard-card">
          <h3 className="section-title">รายละเอียดข้อมูลสมาชิก</h3>
          <div className="readonly-list">
            <div className="readonly-row">
              <span className="readonly-label">ชื่อ - สกุลในระบบ</span>
              <strong>{session.user.title}{session.user.first_name} {session.user.last_name}</strong>
            </div>
            <div className="readonly-row">
              <span className="readonly-label">วันที่สร้างข้อมูลสมาชิก</span>
              <strong>{formatDateTime(profile?.member.created_at ?? null)}</strong>
            </div>
            <div className="readonly-row">
              <span className="readonly-label">สถานะในทะเบียน</span>
              <strong>{profile?.member.active ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}</strong>
            </div>
            <div className="readonly-row">
              <span className="readonly-label">หมายเหตุ</span>
              <strong>{profile?.member.legacy_status || '-'}</strong>
            </div>
          </div>
        </section>

        <section className="card profile-dashboard-card profile-dashboard-card-tall profile-form-card">
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
            <div className="muted profile-form-note">แก้ไขได้เฉพาะคำนำหน้า ชื่อ และสกุล ส่วน Username เลขสมาชิก บทบาท และสถานะอนุมัติเป็นข้อมูลอ้างอิงที่ไม่อนุญาตให้เปลี่ยนจากหน้านี้</div>
            {message && <div className="notice">{message}</div>}
            {errorMessage && <div className="alert-error">{errorMessage}</div>}
            <div className="actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูลส่วนตัว'}
              </button>
            </div>
          </form>
        </section>

        <section className="card profile-dashboard-card profile-dashboard-card-tall profile-form-card">
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
            <div className="muted profile-form-note">รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร</div>
            {passwordMessage && <div className="notice">{passwordMessage}</div>}
            {passwordError && <div className="alert-error">{passwordError}</div>}
            <div className="actions">
              <button type="submit" className="btn btn-primary" disabled={changingPassword}>
                {changingPassword ? 'กำลังเปลี่ยนรหัสผ่าน...' : 'เปลี่ยนรหัสผ่าน'}
              </button>
            </div>
          </form>
        </section>
      </div>

      {loadingProfile && <div className="notice">กำลังโหลดข้อมูลส่วนตัวล่าสุด...</div>}
    </div>
  );
}
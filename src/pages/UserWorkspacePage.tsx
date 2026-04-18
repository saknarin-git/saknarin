import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { InputField } from '../components/InputField';
import { AppMenu } from '../components/AppMenu';
import { changePassword, updateProfile } from '../api/profileApi';
import { fetchSystemOverview } from '../api/overviewApi';
import { useAuth } from '../contexts/AuthContext';
import { StatusBadge } from '../components/StatusBadge';
import type { AppSettings, ProfileUpdatePayload, TitlePrefix } from '../types';
import { APP_GROUP_NAME } from '../constants/appBrand';

const titleOptions: TitlePrefix[] = ['นาย', 'นาง', 'นางสาว', 'เด็กชาย', 'เด็กหญิง'];

const defaultSettings: AppSettings = {
  group_name: APP_GROUP_NAME,
  notice: '',
  allow_registration: true,
};

export function UserWorkspacePage() {
  const { session, setSessionData } = useAuth();
  const accessToken = session?.access_token ?? '';
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
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
    } catch {
      setSettings(defaultSettings);
    }
  }

  if (!session) {
    return null;
  }

  const handleProfileSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    setErrorMessage('');
    setSaving(true);

    try {
      const response = await updateProfile(session.access_token, form);

      if (!response.data) {
        throw new Error('ไม่พบข้อมูลผู้ใช้งานที่อัปเดตแล้ว');
      }

      setSessionData({
        ...session,
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
      const response = await changePassword(session.access_token, {
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
          <p><strong>บทบาท:</strong> {session.user.role === 'admin' ? 'DevManager / ผู้ดูแลระบบ' : 'สมาชิกทั่วไป'}</p>
          <p><strong>ชื่อกลุ่ม:</strong> {settings.group_name || APP_GROUP_NAME}</p>
          <p><strong>สถานะบัญชี:</strong> <StatusBadge status={session.user.approval_status} /></p>
          <div className="notice">{settings.notice || 'ยังไม่มีประกาศจากผู้ดูแลระบบ'}</div>
        </div>

        <div className="card">
          <h3 className="section-title">สิทธิ์และหน้าที่ของคุณ</h3>
          {session.user.role === 'admin' ? (
            <div className="list">
              <div className="list-item">
                <strong>เข้าถึงข้อมูลผู้ดูแลระบบ</strong>
                <div className="muted">คุณสามารถเข้าถึง DevManager, ทะเบียนสมาชิก, สินเชื่อ และกำหนดค่าระบบได้</div>
              </div>
              <div className="actions compact-actions">
                <Link to="/devmanager" className="btn btn-primary">เปิด DevManager</Link>
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
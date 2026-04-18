import { useEffect, useState } from 'react';
import { InputField } from '../components/InputField';
import { AppMenu } from '../components/AppMenu';
import { changePassword, updateProfile } from '../api/profileApi';
import { useAuth } from '../contexts/AuthContext';
import { StatusBadge } from '../components/StatusBadge';
import type { ProfileUpdatePayload, TitlePrefix } from '../types';

const titleOptions: TitlePrefix[] = ['นาย', 'นาง', 'นางสาว', 'เด็กชาย', 'เด็กหญิง'];

export function DashboardPage() {
  const { session, setSessionData } = useAuth();

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

  if (!session) {
    return null;
  }

  useEffect(() => {
    setForm({
      title: session.user.title,
      first_name: session.user.first_name,
      last_name: session.user.last_name,
    });
  }, [session.user.first_name, session.user.last_name, session.user.title]);

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
      <AppMenu title="หน้าหลักผู้ใช้งาน" />

      <div className="hero">
        <h1>ยินดีต้อนรับ {session.user.title}{session.user.first_name} {session.user.last_name}</h1>
        <p>สมาชิกเลขที่ {session.user.member_no}</p>
      </div>

      <div className="grid-two">
        <div className="card">
          <p><strong>Username:</strong> {session.user.username}</p>
          <p><strong>บทบาท:</strong> {session.user.role === 'admin' ? 'ผู้ดูแลระบบ' : 'สมาชิก'}</p>
          <p>
            <strong>สถานะบัญชี:</strong> <StatusBadge status={session.user.approval_status} />
          </p>
          <div className="notice">หลังจากผู้ดูแลระบบอนุมัติแล้ว จึงจะสามารถใช้งานส่วนต่าง ๆ ของระบบได้เต็มรูปแบบ</div>
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
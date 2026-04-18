import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { InputField } from '../components/InputField';
import { updateProfile } from '../api/profileApi';
import { useAuth } from '../contexts/AuthContext';
import { StatusBadge } from '../components/StatusBadge';
import type { ProfileUpdatePayload, TitlePrefix } from '../types';

const titleOptions: TitlePrefix[] = ['นาย', 'นาง', 'นางสาว', 'เด็กชาย', 'เด็กหญิง'];

export function DashboardPage() {
  const { session, logout, setSessionData } = useAuth();

  const [form, setForm] = useState<ProfileUpdatePayload>({
    title: 'นาย',
    first_name: '',
    last_name: '',
  });
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [saving, setSaving] = useState(false);

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

  return (
    <div className="page-shell">
      <div className="topbar">
        <h2>หน้าหลักผู้ใช้งาน</h2>
        <div className="actions">
          {session.user.role === 'admin' && (
            <Link to="/devmanager" className="btn btn-secondary">
              ไปหน้า DevManager
            </Link>
          )}
          <button type="button" className="btn btn-danger" onClick={logout}>
            ออกจากระบบ
          </button>
        </div>
      </div>

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
      </div>
    </div>
  );
}
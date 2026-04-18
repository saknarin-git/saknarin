import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAdminPanel, updateSettings, updateUserStatus } from '../api/adminApi';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../contexts/AuthContext';
import type { AppSettings, AppUser } from '../types';

const defaultSettings: AppSettings = {
  group_name: 'กลุ่มออมทรัพย์เพื่อการผลิต บ้านพิตำ',
  notice: 'ผู้ดูแลระบบสามารถตั้งค่าข้อความประกาศได้จากหน้านี้',
  allow_registration: true,
};

export function DevManagerPage() {
  const { session, logout } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      return;
    }

    void loadPanel();
  }, [session]);

  async function loadPanel() {
    if (!session) {
      return;
    }

    setLoading(true);

    try {
      const result = await fetchAdminPanel(session.access_token);
      setUsers(result.data.users);
      setSettings(result.data.settings);
      setMessage('โหลดข้อมูลล่าสุดเรียบร้อย');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  async function handleApproval(userId: string, approvalStatus: 'approved' | 'rejected', role: 'member' | 'admin') {
    if (!session) {
      return;
    }

    try {
      const result = await updateUserStatus(session.access_token, userId, approvalStatus, role);
      setMessage(result.message);
      await loadPanel();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'อัปเดตสถานะไม่สำเร็จ');
    }
  }

  async function handleSaveSettings() {
    if (!session) {
      return;
    }

    try {
      const result = await updateSettings(session.access_token, settings);
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'บันทึกการตั้งค่าไม่สำเร็จ');
    }
  }

  return (
    <div className="page-shell">
      <div className="topbar">
        <h2>DevManager</h2>
        <div className="actions">
          <Link to="/dashboard" className="btn btn-secondary">
            กลับหน้าหลัก
          </Link>
          <button type="button" className="btn btn-danger" onClick={logout}>
            ออกจากระบบ
          </button>
        </div>
      </div>

      <div className="hero">
        <h1>จัดการระบบภายในเว็บแอพทั้งหมด</h1>
        <p>อนุมัติผู้ใช้งานใหม่ ตั้งค่าการสมัครสมาชิก และจัดการข้อความประกาศภายในระบบ</p>
      </div>

      {message && <div className="notice">{message}</div>}

      <div className="grid-two">
        <section className="card">
          <h3>การตั้งค่าระบบ</h3>
          <label className="field">
            <span>ชื่อกลุ่ม</span>
            <input
              value={settings.group_name}
              onChange={(event) => setSettings((current) => ({ ...current, group_name: event.target.value }))}
            />
          </label>
          <label className="field">
            <span>ข้อความประกาศ</span>
            <textarea
              rows={5}
              value={settings.notice}
              onChange={(event) => setSettings((current) => ({ ...current, notice: event.target.value }))}
            />
          </label>
          <label className="field">
            <span>เปิดรับสมัครสมาชิก</span>
            <select
              value={String(settings.allow_registration)}
              onChange={(event) =>
                setSettings((current) => ({ ...current, allow_registration: event.target.value === 'true' }))
              }
            >
              <option value="true">เปิด</option>
              <option value="false">ปิด</option>
            </select>
          </label>
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={handleSaveSettings}>
              บันทึกการตั้งค่า
            </button>
          </div>
        </section>

        <section className="card">
          <h3>ผู้ใช้งานรออนุมัติ</h3>
          {loading ? (
            <p className="muted">กำลังโหลด...</p>
          ) : (
            <div className="list">
              {users.length === 0 && <p className="muted">ยังไม่มีผู้ใช้งานในระบบ</p>}
              {users.map((user) => (
                <div key={user.id} className="list-item">
                  <div className="topbar">
                    <div>
                      <strong>{user.title}{user.first_name} {user.last_name}</strong>
                      <div className="muted">เลขสมาชิก {user.member_no} | Username: {user.username}</div>
                    </div>
                    <StatusBadge status={user.approval_status} />
                  </div>
                  <div className="actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => handleApproval(user.id, 'approved', user.role)}
                    >
                      อนุมัติ
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => handleApproval(user.id, 'rejected', user.role)}
                    >
                      ปฏิเสธ
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleApproval(user.id, 'approved', 'admin')}
                    >
                      ตั้งเป็นแอดมิน
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
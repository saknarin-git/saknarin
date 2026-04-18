import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { StatusBadge } from '../components/StatusBadge';

export function DashboardPage() {
  const { session, logout } = useAuth();

  if (!session) {
    return null;
  }

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

      <div className="card">
        <p><strong>Username:</strong> {session.user.username}</p>
        <p><strong>บทบาท:</strong> {session.user.role === 'admin' ? 'ผู้ดูแลระบบ' : 'สมาชิก'}</p>
        <p>
          <strong>สถานะบัญชี:</strong> <StatusBadge status={session.user.approval_status} />
        </p>
        <div className="notice">หลังจากผู้ดูแลระบบอนุมัติแล้ว จึงจะสามารถใช้งานส่วนต่าง ๆ ของระบบได้เต็มรูปแบบ</div>
      </div>
    </div>
  );
}
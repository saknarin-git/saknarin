import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface AppMenuProps {
  title: string;
}

export function AppMenu({ title }: AppMenuProps) {
  const location = useLocation();
  const { session, logout } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  if (!session) {
    return null;
  }

  const isAdmin = session.user.role === 'admin';

  return (
    <>
      <div className="app-header">
        <button
          type="button"
          className="menu-toggle"
          aria-label="เปิดเมนูหลัก"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span />
          <span />
          <span />
        </button>
        <h2 className="app-header-title">{title}</h2>
      </div>

      {open && <button type="button" className="menu-backdrop" aria-label="ปิดเมนู" onClick={() => setOpen(false)} />}

      <aside className={`app-drawer ${open ? 'app-drawer-open' : ''}`} aria-hidden={!open}>
        <div className="app-drawer-header">
          <div>
            <strong>{session.user.title}{session.user.first_name} {session.user.last_name}</strong>
            <div className="muted">สมาชิกเลขที่ {session.user.member_no}</div>
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
            ปิด
          </button>
        </div>

        <nav className="drawer-nav">
          <Link to="/dashboard" className={`drawer-link ${location.pathname === '/dashboard' ? 'drawer-link-active' : ''}`}>
            หน้าหลัก
          </Link>
          {isAdmin && (
            <>
              <Link to="/members" className={`drawer-link ${location.pathname === '/members' ? 'drawer-link-active' : ''}`}>
                ทะเบียนสมาชิก
              </Link>
              <Link to="/loans" className={`drawer-link ${location.pathname === '/loans' ? 'drawer-link-active' : ''}`}>
                สินเชื่อ
              </Link>
              <Link to="/devmanager" className={`drawer-link ${location.pathname === '/devmanager' ? 'drawer-link-active' : ''}`}>
                DevManager
              </Link>
            </>
          )}
        </nav>

        <div className="drawer-footer">
          <button type="button" className="btn btn-danger drawer-logout" onClick={logout}>
            ออกจากระบบ
          </button>
        </div>
      </aside>
    </>
  );
}
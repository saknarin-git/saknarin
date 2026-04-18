import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { APP_GROUP_NAME, APP_GROUP_TAGLINE } from '../constants/appBrand';
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

  const canViewOfficerWorkspace = session.permissions.view_officer_workspace;
  const canManageMembers = session.permissions.manage_members;
  const canManageLoans = session.permissions.manage_loans;
  const canAccessDevManager = session.permissions.access_devmanager;

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
        <div className="drawer-brand">
          <div className="drawer-brand-mark" aria-hidden="true">ส</div>
          <div className="drawer-brand-copy">
            <div className="drawer-brand-kicker">เมนูหลัก</div>
            <strong>{APP_GROUP_NAME}</strong>
            <div className="drawer-brand-tagline">{APP_GROUP_TAGLINE}</div>
          </div>
        </div>

        <div className="app-drawer-header">
          <div>
            <strong>{session.user.title}{session.user.first_name} {session.user.last_name}</strong>
            <div className="muted">สมาชิกเลขที่ {session.user.member_no}</div>
          </div>
          <button type="button" className="btn btn-secondary drawer-close" onClick={() => setOpen(false)}>
            ปิด
          </button>
        </div>

        <nav className="drawer-nav">
          {session.permissions.view_system_dashboard && (
            <Link to="/dashboard" className={`drawer-link ${location.pathname === '/dashboard' ? 'drawer-link-active' : ''}`}>
              ภาพรวมระบบ
            </Link>
          )}
          {session.permissions.view_user_workspace && (
            <Link to="/workspace" className={`drawer-link ${location.pathname === '/workspace' ? 'drawer-link-active' : ''}`}>
              แดชบอร์ดผู้ใช้งาน
            </Link>
          )}
          {canViewOfficerWorkspace && (
            <Link to="/officer" className={`drawer-link ${location.pathname === '/officer' ? 'drawer-link-active' : ''}`}>
              ศูนย์งานเจ้าหน้าที่
            </Link>
          )}
          {canManageMembers && (
            <Link to="/members" className={`drawer-link ${location.pathname === '/members' ? 'drawer-link-active' : ''}`}>
              ทะเบียนสมาชิก
            </Link>
          )}
          {canManageLoans && (
            <Link to="/loans" className={`drawer-link ${location.pathname === '/loans' ? 'drawer-link-active' : ''}`}>
              สินเชื่อ
            </Link>
          )}
          {canAccessDevManager && (
            <Link to="/devmanager" className={`drawer-link ${location.pathname === '/devmanager' ? 'drawer-link-active' : ''}`}>
              DevManager
            </Link>
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
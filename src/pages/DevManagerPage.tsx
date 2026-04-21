import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { fetchAdminPanel, fetchLoanPaymentAudit, importCsvData, updateSettings, updateUserStatus } from '../api/adminApi';
import { AppMenu } from '../components/AppMenu';
import { APP_GROUP_NAME } from '../constants/appBrand';
import { canManageRole, defaultRolePermissions, getAssignableRoles, permissionLabels, roleLabels, roleLevelLabels } from '../constants/permissions';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../contexts/AuthContext';
import { formatDateOnly } from '../utils/dateFormat';
import type { AdminOverview, AppSettings, AppUser, CsvImportType, CsvPreviewSummary, ImportStats, LoanPaymentAuditRecord, LoanWorkingDateEntry, PaginationMeta, PermissionKey, PermissionSet, UserRole } from '../types';
import { buildCsvPreview } from '../utils/csvPreview';

const defaultSettings: AppSettings = {
  group_name: APP_GROUP_NAME,
  notice: 'ผู้ดูแลระบบสามารถตั้งค่าข้อความประกาศได้จากหน้านี้',
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

const defaultPagination: PaginationMeta = {
  total: 0,
  page: 1,
  page_size: 20,
  total_pages: 1,
};

type DevManagerSection = 'home' | 'settings' | 'imports' | 'approvals' | 'payments';

const sectionItems: Array<{ key: DevManagerSection; label: string; description: string; path: string }> = [
  { key: 'home', label: 'เมนูหลัก DevManager', description: 'รวมเมนูดูแลระบบทั้งหมดไว้ในหน้าเดียว', path: '/devmanager' },
  { key: 'settings', label: 'การตั้งค่าระบบ', description: 'แก้ไขชื่อกลุ่ม ประกาศ สิทธิ์สมัคร และ permission matrix', path: '/devmanager/settings' },
  { key: 'imports', label: 'การนำเข้าฐานข้อมูล', description: 'นำเข้าไฟล์ CSV สมาชิกและสินเชื่อ', path: '/devmanager/imports' },
  { key: 'approvals', label: 'ผู้ใช้งานรออนุมัติ', description: 'ตรวจและอนุมัติบัญชีผู้ใช้', path: '/devmanager/approvals' },
  { key: 'payments', label: 'ตรวจสอบรายการรับชำระ', description: 'ค้นหาธุรกรรมรับชำระจากเลขสมาชิกหรือวันทำการกลุ่ม', path: '/devmanager/payments' },
];

function getSectionFromPath(pathname: string): DevManagerSection | null {
  if (pathname === '/devmanager' || pathname === '/devmanager/') {
    return 'home';
  }

  if (pathname === '/devmanager/settings') {
    return 'settings';
  }

  if (pathname === '/devmanager/imports') {
    return 'imports';
  }

  if (pathname === '/devmanager/approvals') {
    return 'approvals';
  }

  if (pathname === '/devmanager/payments') {
    return 'payments';
  }

  return null;
}

function formatDisplayDate(dateText: string | null) {
  return formatDateOnly(dateText);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function DevManagerPage() {
  const location = useLocation();
  const { session, setSessionData } = useAuth();
  const isDevAdmin = session?.user.role === 'dev_admin';
  const [users, setUsers] = useState<AppUser[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [importStats, setImportStats] = useState<ImportStats>({ members_count: 0, loan_contracts_count: 0, loan_payments_count: 0 });
  const [overview, setOverview] = useState<AdminOverview>(defaultOverview);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [memberCsvText, setMemberCsvText] = useState('');
  const [memberFileName, setMemberFileName] = useState('');
  const [memberPreview, setMemberPreview] = useState<CsvPreviewSummary | null>(null);
  const [loanCsvText, setLoanCsvText] = useState('');
  const [loanFileName, setLoanFileName] = useState('');
  const [loanPreview, setLoanPreview] = useState<CsvPreviewSummary | null>(null);
  const [transactionCsvText, setTransactionCsvText] = useState('');
  const [transactionFileName, setTransactionFileName] = useState('');
  const [transactionPreview, setTransactionPreview] = useState<CsvPreviewSummary | null>(null);
  const [importingMembers, setImportingMembers] = useState(false);
  const [importingLoans, setImportingLoans] = useState(false);
  const [importingTransactions, setImportingTransactions] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [loadingPaymentAudit, setLoadingPaymentAudit] = useState(false);
  const [paymentAuditRecords, setPaymentAuditRecords] = useState<LoanPaymentAuditRecord[]>([]);
  const [paymentAuditPagination, setPaymentAuditPagination] = useState<PaginationMeta>(defaultPagination);
  const [paymentAuditWorkingDates, setPaymentAuditWorkingDates] = useState<LoanWorkingDateEntry[]>([]);
  const [paymentAuditFilters, setPaymentAuditFilters] = useState({ memberNo: '', paidDate: '' });
  const activeSection = getSectionFromPath(location.pathname);

  if (!activeSection) {
    return <Navigate to="/devmanager" replace />;
  }

  useEffect(() => {
    if (!session) {
      return;
    }

    void loadPanel();
  }, [session]);

  useEffect(() => {
    if (!session || activeSection !== 'payments') {
      return;
    }

    void loadPaymentAudit();
  }, [session, activeSection]);

  async function loadPanel() {
    if (!session) {
      return;
    }

    setLoading(true);

    try {
      const result = await fetchAdminPanel(session.access_token);
      setUsers(result.data.users);
      setSettings(result.data.settings);
      setImportStats(result.data.import_stats);
      setOverview(result.data.overview);
      setMessage('โหลดข้อมูลล่าสุดเรียบร้อย');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  async function loadPaymentAudit(nextFilters = paymentAuditFilters, nextPage = 1) {
    if (!session) {
      return;
    }

    try {
      setLoadingPaymentAudit(true);
      const result = await fetchLoanPaymentAudit(session.access_token, {
        memberNo: nextFilters.memberNo,
        paidDate: nextFilters.paidDate,
        page: nextPage,
        pageSize: paymentAuditPagination.page_size,
      });
      setPaymentAuditRecords(result.data.payments);
      setPaymentAuditPagination(result.data.pagination);
      setPaymentAuditWorkingDates(result.data.working_dates);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'โหลดรายการรับชำระไม่สำเร็จ');
    } finally {
      setLoadingPaymentAudit(false);
    }
  }

  async function handleApproval(
    userId: string,
    approvalStatus: 'approved' | 'rejected',
    role: 'member' | 'officer' | 'admin' | 'dev_admin',
  ) {
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
      setSavingSettings(true);
      const result = await updateSettings(
        session.access_token,
        isDevAdmin
          ? settings
          : {
              group_name: settings.group_name,
              notice: settings.notice,
              allow_registration: settings.allow_registration,
            } as AppSettings,
      );

      const nextPermissions: PermissionSet = isDevAdmin
        ? settings.role_permissions[session.user.role]
        : session.permissions;

      setSessionData({
        ...session,
        permissions: nextPermissions,
      });

      setMessage(result.message);
      await loadPanel();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'บันทึกการตั้งค่าไม่สำเร็จ');
    } finally {
      setSavingSettings(false);
    }
  }

  function handlePermissionToggle(role: UserRole, permission: PermissionKey) {
    setSettings((current) => ({
      ...current,
      role_permissions: {
        ...current.role_permissions,
        [role]: {
          ...current.role_permissions[role],
          [permission]: !current.role_permissions[role][permission],
        },
      },
    }));
  }

  function getRoleActionLabel(role: UserRole) {
    if (role === 'dev_admin') {
      return 'ตั้งเป็น DevManager';
    }

    if (role === 'admin') {
      return 'ตั้งเป็น AdminManager';
    }

    if (role === 'officer') {
      return 'ตั้งเป็น OfficerManager';
    }

    return 'ตั้งเป็นสมาชิก';
  }

  async function handleFileSelection(
    event: React.ChangeEvent<HTMLInputElement>,
    target: CsvImportType,
  ) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const text = await file.text();

    if (target === 'members') {
      setMemberCsvText(text);
      setMemberFileName(file.name);
      setMemberPreview(null);
      return;
    }

    if (target === 'loan-contracts') {
      setLoanCsvText(text);
      setLoanFileName(file.name);
      setLoanPreview(null);
      return;
    }

    setTransactionCsvText(text);
    setTransactionFileName(file.name);
    setTransactionPreview(null);
  }

  function handlePreview(importType: CsvImportType) {
    const csvText = importType === 'members' ? memberCsvText : importType === 'loan-contracts' ? loanCsvText : transactionCsvText;
    const fileName = importType === 'members' ? memberFileName : importType === 'loan-contracts' ? loanFileName : transactionFileName;

    try {
      const preview = buildCsvPreview(csvText, importType, fileName);
      if (importType === 'members') {
        setMemberPreview(preview);
      } else if (importType === 'loan-contracts') {
        setLoanPreview(preview);
      } else {
        setTransactionPreview(preview);
      }

      setMessage(
        preview.is_ready
          ? `ตรวจสอบไฟล์ ${fileName} เรียบร้อย พร้อมนำเข้า ${preview.row_count} รายการ`
          : preview.missing_headers.length > 0
            ? `ไฟล์ ${fileName} ยังไม่พร้อมนำเข้า กรุณาตรวจคอลัมน์ที่ขาดก่อน`
            : `ไฟล์ ${fileName} พบข้อมูลไม่ถูกต้อง ${preview.invalid_row_count} แถว กรุณาแก้ไขก่อนนำเข้า`,
      );
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : 'ดูตัวอย่างข้อมูลไม่สำเร็จ';
      setMessage(nextMessage);
      if (importType === 'members') {
        setMemberPreview(null);
      } else if (importType === 'loan-contracts') {
        setLoanPreview(null);
      } else {
        setTransactionPreview(null);
      }
    }
  }

  async function handleImport(importType: CsvImportType) {
    if (!session) {
      return;
    }

    const csvText = importType === 'members' ? memberCsvText : importType === 'loan-contracts' ? loanCsvText : transactionCsvText;
    const setLoadingState = importType === 'members' ? setImportingMembers : importType === 'loan-contracts' ? setImportingLoans : setImportingTransactions;
    const preview = importType === 'members' ? memberPreview : importType === 'loan-contracts' ? loanPreview : transactionPreview;

    if (!preview?.is_ready) {
      setMessage('กรุณากดดูตัวอย่างข้อมูลและตรวจสอบให้ผ่านก่อนนำเข้า');
      return;
    }

    try {
      setLoadingState(true);
      const result = await importCsvData(session.access_token, importType, csvText);
      setMessage(result.message);
      await loadPanel();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'นำเข้าข้อมูลไม่สำเร็จ');
    } finally {
      setLoadingState(false);
    }
  }

  function renderPreview(preview: CsvPreviewSummary | null) {
    if (!preview) {
      return null;
    }

    return (
      <div className="preview-panel">
        <div className="stats-row preview-summary-row">
          <div className="stat-chip">ไฟล์: {preview.file_name}</div>
          <div className="stat-chip">จำนวนรายการ: {preview.row_count}</div>
          <div className={`stat-chip ${preview.is_ready ? 'stat-chip-success' : 'stat-chip-error'}`}>
            {preview.is_ready ? 'พร้อมนำเข้า' : preview.missing_headers.length > 0 ? 'คอลัมน์ยังไม่ครบ' : 'ข้อมูลบางแถวไม่ถูกต้อง'}
          </div>
          {!preview.is_ready && preview.invalid_row_count > 0 && (
            <div className="stat-chip stat-chip-error">แถวที่ต้องแก้ไข: {preview.invalid_row_count}</div>
          )}
        </div>
        <div className="preview-meta">
          <div>
            <strong>คอลัมน์ที่พบ</strong>
            <div className="preview-tags">
              {preview.headers.map((header) => (
                <span key={header} className="preview-tag">{header}</span>
              ))}
            </div>
          </div>
          <div>
            <strong>คอลัมน์ที่ต้องใช้</strong>
            <div className="preview-tags">
              {preview.required_headers.map((header) => (
                <span
                  key={header}
                  className={`preview-tag ${preview.missing_headers.includes(header) ? 'preview-tag-error' : 'preview-tag-success'}`}
                >
                  {header}
                </span>
              ))}
            </div>
          </div>
        </div>
        {preview.missing_headers.length > 0 && (
          <div className="alert-error">ยังขาดคอลัมน์: {preview.missing_headers.join(', ')}</div>
        )}
        {preview.issues.length > 0 && (
          <div className="alert-error">
            พบข้อมูลที่ต้องแก้ไข {preview.invalid_row_count} แถวก่อนนำเข้า
          </div>
        )}
        <div className="preview-table-wrap">
          <table className="preview-table">
            <thead>
              <tr>
                {preview.required_headers.map((header) => (
                  <th key={header}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.sample_rows.map((row, index) => (
                <tr key={`${preview.file_name}-${index + 1}`}>
                  {preview.required_headers.map((header) => (
                    <td key={`${header}-${index + 1}`}>{row[header] || '-'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {preview.row_count > preview.sample_rows.length && (
          <div className="muted">แสดงตัวอย่าง {preview.sample_rows.length} แถวแรกจากทั้งหมด {preview.row_count} รายการ</div>
        )}
        {preview.issues.length > 0 && (
          <div className="preview-issues">
            <strong>รายการแถวที่มีปัญหา</strong>
            <div className="list preview-issues-list">
              {preview.issues.slice(0, 10).map((issue) => (
                <div key={`${preview.file_name}-issue-${issue.row_number}`} className="list-item preview-issue-item">
                  <strong>แถว {issue.row_number}</strong>
                  <div className="muted">{issue.messages.join(', ')}</div>
                </div>
              ))}
            </div>
            {preview.issues.length > 10 && (
              <div className="muted">แสดง 10 แถวแรกจากทั้งหมด {preview.issues.length} แถวที่ต้องแก้ไข</div>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderHomeSection() {
    return (
      <div className="devmanager-section-stack">
        <section className="card">
          <h3 className="section-title">เมนูหลัก DevManager</h3>
          <p className="muted">
            รวมเมนูของผู้ดูแลระบบไว้ในหน้าเดียว เลือกการ์ดที่ต้องการเพื่อเข้าไปตั้งค่าหรือจัดการส่วนต่าง ๆ
          </p>
          <div className="dashboard-shortcuts">
            {sectionItems.filter((item) => item.key !== 'home').map((item) => (
              <Link
                key={item.key}
                to={item.path}
                className="shortcut-card shortcut-link-card devmanager-card-link"
              >
                <strong>{item.label}</strong>
                <div className="muted">{item.description}</div>
              </Link>
            ))}
            <Link
              to="/workspace"
              className="shortcut-card shortcut-link-card devmanager-card-link"
            >
              <strong>ข้อมูลส่วนตัว</strong>
              <div className="muted">เปิดหน้าโปรไฟล์ของบัญชีนี้เพื่อดูข้อมูลส่วนตัว แก้ไขชื่อ และเปลี่ยนรหัสผ่าน</div>
            </Link>
          </div>
        </section>

        <div className="grid-two">
          <section className="card">
            <h3 className="section-title">สถานะงานผู้ดูแลระบบ</h3>
            <div className="stats-row">
              <div className="stat-chip">บัญชีรออนุมัติ {overview.pending_users_count} รายการ</div>
              <div className="stat-chip">สิทธิ์สมัครสมาชิก {settings.allow_registration ? 'เปิด' : 'ปิด'}</div>
              <div className="stat-chip">ผู้ใช้งานอนุมัติแล้ว {overview.approved_users_count} รายการ</div>
            </div>
            <div className="notice">ข้อความประกาศปัจจุบัน: {settings.notice || 'ยังไม่มีประกาศ'}</div>
          </section>

          <section className="card">
            <h3 className="section-title">โครงสร้างผู้ดูแลระบบ</h3>
            <div className="list">
              <div className="list-item">
                <strong>DevManager ระดับ 1</strong>
                <div className="muted">ดูแลการตั้งค่าระบบทั้งหมดและกำหนดสิทธิ์ของระดับ 2, 3 และ 4</div>
              </div>
              <div className="list-item">
                <strong>จำนวนผู้ดูแลในระบบ</strong>
                <div className="muted">มี DevManager {overview.dev_admin_users_count} คน, AdminManager {overview.admin_users_count} คน และ OfficerManager {overview.officer_users_count} คนที่ช่วยดูแลการทำงาน</div>
              </div>
              <div className="list-item">
                <strong>ขอบเขตหน้าที่</strong>
                <div className="muted">งานธุรกรรมของกลุ่มให้เจ้าหน้าที่เป็นผู้ดำเนินการ ส่วน DevManager ทำหน้าที่กำกับ ดูแล และตั้งค่าระบบ</div>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  function renderSettingsSection() {
    return (
      <section className="card">
        <div className="topbar devmanager-section-topbar">
          <div>
            <h3 className="section-title">การตั้งค่าระบบ</h3>
            <div className="muted">จัดการค่าระบบหลักและกำหนดเมนู/สิทธิ์ที่บทบาทต่าง ๆ เข้าถึงได้</div>
          </div>
          <Link to="/devmanager" className="btn btn-secondary">กลับเมนู DevManager</Link>
        </div>
        <div className="notice">เมื่อปรับสิทธิ์หรือค่าระบบเสร็จ ให้กดปุ่มบันทึกการตั้งค่าเพื่อเขียนค่าลงระบบ</div>
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
          <button type="button" className="btn btn-primary" onClick={handleSaveSettings} disabled={savingSettings}>
            {savingSettings ? 'กำลังบันทึกการตั้งค่า...' : 'บันทึกการตั้งค่า'}
          </button>
        </div>

        <div className="section-space">
          <h3 className="section-title">สิทธิ์การเข้าถึงหน้าเว็บตามบทบาท</h3>
          {isDevAdmin ? (
            <div className="permission-matrix">
              <div className="permission-row permission-row-header">
                <div>สิทธิ์</div>
                <div>{roleLabels.dev_admin} ({roleLevelLabels.dev_admin})</div>
                <div>{roleLabels.admin} ({roleLevelLabels.admin})</div>
                <div>{roleLabels.officer} ({roleLevelLabels.officer})</div>
                <div>{roleLabels.member} ({roleLevelLabels.member})</div>
              </div>
              {(Object.keys(permissionLabels) as PermissionKey[]).map((permission) => (
                <div key={permission} className="permission-row">
                  <div>{permissionLabels[permission]}</div>
                  <label className="permission-cell">
                    <input
                      type="checkbox"
                      checked={settings.role_permissions.dev_admin[permission]}
                      onChange={() => handlePermissionToggle('dev_admin', permission)}
                    />
                  </label>
                  <label className="permission-cell">
                    <input
                      type="checkbox"
                      checked={settings.role_permissions.admin[permission]}
                      onChange={() => handlePermissionToggle('admin', permission)}
                    />
                  </label>
                  <label className="permission-cell">
                    <input
                      type="checkbox"
                      checked={settings.role_permissions.officer[permission]}
                      onChange={() => handlePermissionToggle('officer', permission)}
                    />
                  </label>
                  <label className="permission-cell">
                    <input
                      type="checkbox"
                      checked={settings.role_permissions.member[permission]}
                      onChange={() => handlePermissionToggle('member', permission)}
                    />
                  </label>
                </div>
              ))}
              <div className="notice">คุณกำหนดสิทธิ์ของระดับ 1 ได้แล้ว แต่ระบบจะบังคับให้ระดับ 1 ต้องเข้าหน้า DevManager ได้เสมอเพื่อไม่ให้ล็อกการตั้งค่าเอง</div>
              <div className="actions">
                <button type="button" className="btn btn-primary" onClick={handleSaveSettings} disabled={savingSettings}>
                  {savingSettings ? 'กำลังบันทึกการตั้งค่า...' : 'บันทึกสิทธิ์การเข้าถึงหน้าเว็บ'}
                </button>
              </div>
            </div>
          ) : (
            <div className="notice">ตารางสิทธิ์นี้ดูได้อย่างเดียวสำหรับ AdminManager การแก้ไขทำได้เฉพาะ DevManager</div>
          )}
        </div>
      </section>
    );
  }

  function renderApprovalsSection() {
    return (
      <section className="card">
        <div className="topbar devmanager-section-topbar">
          <div>
            <h3 className="section-title">ผู้ใช้งานรออนุมัติ</h3>
            <div className="muted">เลื่อนหรือลดระดับสิทธิ์ได้เฉพาะเมื่อคุณมีระดับสูงกว่าเป้าหมายเท่านั้น</div>
          </div>
          <Link to="/devmanager" className="btn btn-secondary">กลับเมนู DevManager</Link>
        </div>
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
                    <div className="muted">สิทธิ์ปัจจุบัน: {roleLabels[user.role]} ({roleLevelLabels[user.role]})</div>
                  </div>
                  <StatusBadge status={user.approval_status} />
                </div>
                <div className="actions">
                  {session && canManageRole(session.user.role, user.role, user.role) && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => handleApproval(user.id, 'approved', user.role)}
                    >
                      อนุมัติ
                    </button>
                  )}
                  {session && canManageRole(session.user.role, user.role, user.role) && (
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => handleApproval(user.id, 'rejected', user.role)}
                    >
                      ปฏิเสธ
                    </button>
                  )}
                  {session && getAssignableRoles(session.user.role, user.role).map((nextRole) => (
                    <button
                      key={nextRole}
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleApproval(user.id, 'approved', nextRole)}
                    >
                      {getRoleActionLabel(nextRole)}
                    </button>
                  ))}
                  {session?.user.id === user.id && (
                    <div className="notice">ไม่สามารถเลื่อนหรือลดระดับสิทธิ์ของตนเองได้</div>
                  )}
                  {session && session.user.id !== user.id && !canManageRole(session.user.role, user.role, user.role) && (
                    <div className="notice">แก้สิทธิ์ได้เฉพาะผู้ใช้ที่มีระดับต่ำกว่าคุณเท่านั้น</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  }

  function renderImportsSection() {
    return (
      <div className="devmanager-section-stack">
        <section className="card">
          <div className="topbar devmanager-section-topbar">
            <div>
              <h3 className="section-title">การนำเข้าฐานข้อมูล</h3>
              <div className="muted">ใช้สำหรับดูแลข้อมูลตั้งต้นของระบบเท่านั้น ไม่ใช่หน้าทำธุรกรรมประจำวันของกลุ่ม</div>
            </div>
            <Link to="/devmanager" className="btn btn-secondary">กลับเมนู DevManager</Link>
          </div>
        </section>

        <div className="grid-two">
        <section className="card">
          <h3>นำเข้าฐานข้อมูลสมาชิก</h3>
          <div className="notice">คอลัมน์ที่รองรับ: เลขที่สมาชิก, สถานะ และข้อมูลชื่อจะใช้แบบแยกคอลัมน์ `คำนำหน้าชื่อ, ชื่อ, สกุล` หรือรวมอยู่คอลัมน์เดียวเป็น `ชื่อ-สกุล` เช่น `นาย สมชาย ใจดี` ก็ได้</div>
          <div className="notice">ถ้านำเข้าสมาชิกจริงที่ชื่อและสกุลตรงกับรายการ `ผู้ค้ำชั่วคราว` ระบบจะเปลี่ยนสถานะสมาชิกจริงเป็น `ปกติ` อัปเดตสัญญาที่อ้าง `TMP-...` ให้เป็นเลขสมาชิกจริง และลบรายการชั่วคราวให้อัตโนมัติ</div>
          <div className="stats-row">
            <div className="stat-chip">สมาชิกในระบบปัจจุบัน: {importStats.members_count}</div>
          </div>
          <label className="field">
            <span>เลือกไฟล์ CSV สมาชิก</span>
            <input type="file" accept=".csv,text/csv" onChange={(event) => void handleFileSelection(event, 'members')} />
          </label>
          {memberFileName && <div className="muted">ไฟล์ที่เลือก: {memberFileName}</div>}
          <div className="actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!memberCsvText}
              onClick={() => handlePreview('members')}
            >
              ดูตัวอย่างข้อมูลสมาชิก
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!memberCsvText || importingMembers || !memberPreview?.is_ready}
              onClick={() => void handleImport('members')}
            >
              {importingMembers ? 'กำลังนำเข้าฐานข้อมูลสมาชิก...' : 'นำเข้าฐานข้อมูลสมาชิก'}
            </button>
          </div>
          {renderPreview(memberPreview)}
        </section>

        <section className="card">
          <h3>นำเข้าสัญญาเงินกู้</h3>
          <div className="notice">คอลัมน์ที่รองรับ: เลขที่สมาชิก, เลขที่สัญญา, ยอดเงินกู้, ยอดคงค้าง, สถานะ, วันที่สร้างสัญญา, ผู้ค้ำประกันคนที่ 1 และผู้ค้ำประกันคนที่ 2 (ถ้ามีก็ใส่, ถ้าไม่มีก็เว้นว่างได้) ส่วนชื่อผู้กู้ใช้ได้ทั้งแบบแยกคอลัมน์ `คำนำหน้าชื่อ, ชื่อ, สกุล` หรือคอลัมน์เดียว เช่น `ชื่อ`, `ชื่อผู้กู้`, `ชื่อ-สกุล` โดยจะรองรับทั้ง `นาย สมชาย ใจดี`, `สมุด`, และชื่อหน่วยงานอย่าง `ล่องแก่ง` ส่วนคอลัมน์ผู้ค้ำรองรับรูปแบบ `(TMP-00001) นางยินดี มณี` หรือ `(pp) สมุด` โดยระบบจะดึงเฉพาะรหัสในวงเล็บไปใช้งาน</div>
          <div className="notice">ถ้าในสัญญาเดิมยังอ้างผู้ค้ำแบบ `TMP-...` ระบบจะโยงเป็นเลขสมาชิกจริงให้อัตโนมัติเมื่อมีการเพิ่มสมาชิกจริงที่ชื่อและสกุลตรงกันภายหลัง</div>
          <div className="stats-row">
            <div className="stat-chip">สัญญาเงินกู้ในระบบปัจจุบัน: {importStats.loan_contracts_count}</div>
          </div>
          <label className="field">
            <span>เลือกไฟล์ CSV สัญญาเงินกู้</span>
            <input type="file" accept=".csv,text/csv" onChange={(event) => void handleFileSelection(event, 'loan-contracts')} />
          </label>
          {loanFileName && <div className="muted">ไฟล์ที่เลือก: {loanFileName}</div>}
          <div className="actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!loanCsvText}
              onClick={() => handlePreview('loan-contracts')}
            >
              ดูตัวอย่างสัญญาเงินกู้
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!loanCsvText || importingLoans || !loanPreview?.is_ready}
              onClick={() => void handleImport('loan-contracts')}
            >
              {importingLoans ? 'กำลังนำเข้าสัญญาเงินกู้...' : 'นำเข้าสัญญาเงินกู้'}
            </button>
          </div>
          {renderPreview(loanPreview)}
        </section>
        </div>

        <section className="card">
          <h3>นำเข้าธุรกรรม Transaction</h3>
          <div className="notice">คอลัมน์ที่รองรับตาม Google Sheet: รหัสอ้างอิง, วัน/เดือน/ปี (พ.ศ.), เลขที่สัญญา, รหัสสมาชิก, ชำระเงินต้น, ชำระดอกเบี้ย, ยอดคงเหลือ, หมายเหตุ, ผู้ทำรายการ, ชื่อ-สกุล, สถานะการทำรายการ, จำนวนงวดดอกที่ชำระ, ค้างดอกก่อนรับชำระ และค้างดอกหลังรับชำระ</div>
          <div className="notice">ระบบจะนำเข้าลงตารางธุรกรรมรับชำระ (`loan_payments`) โดยใช้ `รหัสอ้างอิง` เป็นกุญแจสำหรับเพิ่มหรืออัปเดตรายการเดิม และจะอัปเดตยอดคงเหลือในสัญญาตามธุรกรรมล่าสุดของแต่ละเลขที่สัญญาให้อัตโนมัติ</div>
          <div className="notice">ถ้า `รหัสอ้างอิง` ในไฟล์ไม่ตรงกับข้อมูลเก่า ระบบจะลองจับคู่รายการเดิมให้อัตโนมัติจาก `เลขที่สัญญา + รหัสสมาชิก + วันที่ชำระ + ชำระเงินต้น + ชำระดอกเบี้ย` เพื่อเลี่ยงการสร้างธุรกรรมซ้ำ</div>
          <div className="stats-row">
            <div className="stat-chip">ธุรกรรมรับชำระในระบบปัจจุบัน: {importStats.loan_payments_count}</div>
          </div>
          <label className="field">
            <span>เลือกไฟล์ CSV Transaction</span>
            <input type="file" accept=".csv,text/csv" onChange={(event) => void handleFileSelection(event, 'transactions')} />
          </label>
          {transactionFileName && <div className="muted">ไฟล์ที่เลือก: {transactionFileName}</div>}
          <div className="actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!transactionCsvText}
              onClick={() => handlePreview('transactions')}
            >
              ดูตัวอย่าง Transaction
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!transactionCsvText || importingTransactions || !transactionPreview?.is_ready}
              onClick={() => void handleImport('transactions')}
            >
              {importingTransactions ? 'กำลังนำเข้า Transaction...' : 'นำเข้า Transaction'}
            </button>
          </div>
          {renderPreview(transactionPreview)}
        </section>
      </div>
    );
  }

  function renderPaymentAuditSection() {
    const configuredWorkingDates = paymentAuditWorkingDates.filter((item) => item.date);

    return (
      <section className="card">
        <div className="topbar devmanager-section-topbar">
          <div>
            <h3 className="section-title">ตรวจสอบรายการรับชำระ</h3>
            <div className="muted">ค้นหาธุรกรรมรับชำระจากเลขสมาชิก หรือกรองตามวันทำการกลุ่มที่กำหนดไว้ในระบบ</div>
          </div>
          <Link to="/devmanager" className="btn btn-secondary">กลับเมนู DevManager</Link>
        </div>

        <form
          className="payment-audit-filter-bar"
          onSubmit={(event) => {
            event.preventDefault();
            void loadPaymentAudit(paymentAuditFilters, 1);
          }}
        >
          <label className="field">
            <span>เลขสมาชิก</span>
            <input
              value={paymentAuditFilters.memberNo}
              onChange={(event) => setPaymentAuditFilters((current) => ({ ...current, memberNo: event.target.value }))}
              placeholder="ค้นหาด้วยเลขสมาชิก"
              autoComplete="off"
            />
          </label>
          <label className="field">
            <span>วันทำการกลุ่ม</span>
            <select
              value={paymentAuditFilters.paidDate}
              onChange={(event) => setPaymentAuditFilters((current) => ({ ...current, paidDate: event.target.value }))}
            >
              <option value="">ทุกวันทำการ</option>
              {configuredWorkingDates.map((item) => (
                <option key={item.month} value={item.date ?? ''}>{formatDisplayDate(item.date)}</option>
              ))}
            </select>
          </label>
          <div className="actions compact-actions payment-audit-actions">
            <button type="submit" className="btn btn-primary" disabled={loadingPaymentAudit}>
              {loadingPaymentAudit ? 'กำลังค้นหา...' : 'ค้นหารายการรับชำระ'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                const resetFilters = { memberNo: '', paidDate: '' };
                setPaymentAuditFilters(resetFilters);
                void loadPaymentAudit(resetFilters, 1);
              }}
              disabled={loadingPaymentAudit}
            >
              ล้างตัวกรอง
            </button>
          </div>
        </form>

        <div className="stats-row">
          <div className="stat-chip">พบ {paymentAuditPagination.total} รายการ</div>
          {paymentAuditFilters.memberNo && <div className="stat-chip">เลขสมาชิก: {paymentAuditFilters.memberNo}</div>}
          {paymentAuditFilters.paidDate && <div className="stat-chip">วันทำการ: {formatDisplayDate(paymentAuditFilters.paidDate)}</div>}
        </div>

        {loadingPaymentAudit ? (
          <p className="muted">กำลังโหลดรายการรับชำระ...</p>
        ) : paymentAuditRecords.length === 0 ? (
          <div className="notice">ไม่พบรายการรับชำระตามเงื่อนไขที่ค้นหา</div>
        ) : (
          <>
            <div className="preview-table-wrap">
              <table className="preview-table payment-audit-table">
                <thead>
                  <tr>
                    <th>วันที่รับชำระ</th>
                    <th>เลขสมาชิก</th>
                    <th>ชื่อสมาชิก</th>
                    <th>เลขที่สัญญา</th>
                    <th>รูปแบบ</th>
                    <th>เงินต้น</th>
                    <th>ดอกเบี้ย</th>
                    <th>งวดดอก</th>
                    <th>ยอดคงเหลือ</th>
                    <th>ผู้ทำรายการ</th>
                    <th>อ้างอิง / สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentAuditRecords.map((payment) => (
                    <tr key={payment.id}>
                      <td>{formatDisplayDate(payment.paid_date)}</td>
                      <td>{payment.member_no}</td>
                      <td>
                        <strong>{payment.member_name}</strong>
                        {payment.note && <div className="muted">{payment.note}</div>}
                      </td>
                      <td>{payment.contract_no}</td>
                      <td>{payment.payment_mode === 'settlement' ? 'กลบหนี้' : 'ปกติ'}</td>
                      <td>{formatMoney(payment.principal_paid)}</td>
                      <td>{formatMoney(payment.interest_paid)}</td>
                      <td>{payment.interest_installments_paid}</td>
                      <td>{formatMoney(payment.remaining_balance)}</td>
                      <td>{payment.operator_name || '-'}</td>
                      <td>
                        {payment.external_reference && <div>{payment.external_reference}</div>}
                        <div className="muted">{payment.transaction_status || '-'}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="topbar payment-audit-pagination">
              <div className="muted">หน้า {paymentAuditPagination.page} / {paymentAuditPagination.total_pages}</div>
              <div className="actions compact-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={loadingPaymentAudit || paymentAuditPagination.page <= 1}
                  onClick={() => void loadPaymentAudit(paymentAuditFilters, paymentAuditPagination.page - 1)}
                >
                  หน้าก่อน
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={loadingPaymentAudit || paymentAuditPagination.page >= paymentAuditPagination.total_pages}
                  onClick={() => void loadPaymentAudit(paymentAuditFilters, paymentAuditPagination.page + 1)}
                >
                  หน้าถัดไป
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    );
  }

  function renderSectionContent() {
    if (activeSection === 'home') {
      return renderHomeSection();
    }

    if (activeSection === 'settings') {
      return renderSettingsSection();
    }

    if (activeSection === 'approvals') {
      return renderApprovalsSection();
    }

    if (activeSection === 'payments') {
      return renderPaymentAuditSection();
    }

    return renderImportsSection();
  }

  return (
    <div className="page-shell">
      <AppMenu title="DevManager" />

      <div className="hero">
        <h1>จัดการระบบภายในเว็บแอพทั้งหมด</h1>
        <p>DevManager ทำหน้าที่ดูแลระบบและตั้งค่าเครื่องมือให้ทีมงาน เลือกเมนูจากการ์ดด้านล่างแล้วค่อยเข้าไปจัดการแต่ละส่วน</p>
      </div>

      {message && <div className="notice">{message}</div>}

      <div className="section-space">
        {renderSectionContent()}
      </div>
    </div>
  );
}
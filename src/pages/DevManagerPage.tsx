import { useEffect, useState } from 'react';
import { fetchAdminPanel, importCsvData, updateSettings, updateUserStatus } from '../api/adminApi';
import { AppMenu } from '../components/AppMenu';
import { APP_GROUP_NAME } from '../constants/appBrand';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../contexts/AuthContext';
import type { AdminOverview, AppSettings, AppUser, CsvImportType, CsvPreviewSummary, ImportStats } from '../types';
import { buildCsvPreview } from '../utils/csvPreview';

const defaultSettings: AppSettings = {
  group_name: APP_GROUP_NAME,
  notice: 'ผู้ดูแลระบบสามารถตั้งค่าข้อความประกาศได้จากหน้านี้',
  allow_registration: true,
};

const defaultOverview: AdminOverview = {
  members_count: 0,
  active_members_count: 0,
  inactive_members_count: 0,
  users_count: 0,
  approved_users_count: 0,
  pending_users_count: 0,
  admin_users_count: 0,
  loan_contracts_count: 0,
  active_loan_contracts_count: 0,
  closed_loan_contracts_count: 0,
  total_loan_amount: 0,
  total_outstanding_amount: 0,
};

type DevManagerSection = 'dashboard' | 'home' | 'settings' | 'imports' | 'approvals';

const sectionItems: Array<{ key: DevManagerSection; label: string; description: string }> = [
  { key: 'dashboard', label: 'แดชบอร์ด', description: 'สรุปภาพรวมของกลุ่ม' },
  { key: 'home', label: 'หน้าหลักปัจจุบัน', description: 'สรุปงานและทางลัดของ DevManager' },
  { key: 'settings', label: 'การตั้งค่าระบบ', description: 'แก้ไขชื่อกลุ่ม ประกาศ และสิทธิ์สมัคร' },
  { key: 'imports', label: 'การนำเข้าฐานข้อมูล', description: 'นำเข้าไฟล์ CSV สมาชิกและสินเชื่อ' },
  { key: 'approvals', label: 'ผู้ใช้งานรออนุมัติ', description: 'ตรวจและอนุมัติบัญชีผู้ใช้' },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function DevManagerPage() {
  const { session } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [importStats, setImportStats] = useState<ImportStats>({ members_count: 0, loan_contracts_count: 0 });
  const [overview, setOverview] = useState<AdminOverview>(defaultOverview);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<DevManagerSection>('dashboard');
  const [memberCsvText, setMemberCsvText] = useState('');
  const [memberFileName, setMemberFileName] = useState('');
  const [memberPreview, setMemberPreview] = useState<CsvPreviewSummary | null>(null);
  const [loanCsvText, setLoanCsvText] = useState('');
  const [loanFileName, setLoanFileName] = useState('');
  const [loanPreview, setLoanPreview] = useState<CsvPreviewSummary | null>(null);
  const [importingMembers, setImportingMembers] = useState(false);
  const [importingLoans, setImportingLoans] = useState(false);

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
      setImportStats(result.data.import_stats);
      setOverview(result.data.overview);
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

    setLoanCsvText(text);
    setLoanFileName(file.name);
    setLoanPreview(null);
  }

  function handlePreview(importType: CsvImportType) {
    const csvText = importType === 'members' ? memberCsvText : loanCsvText;
    const fileName = importType === 'members' ? memberFileName : loanFileName;

    try {
      const preview = buildCsvPreview(csvText, importType, fileName);
      if (importType === 'members') {
        setMemberPreview(preview);
      } else {
        setLoanPreview(preview);
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
      } else {
        setLoanPreview(null);
      }
    }
  }

  async function handleImport(importType: CsvImportType) {
    if (!session) {
      return;
    }

    const csvText = importType === 'members' ? memberCsvText : loanCsvText;
    const setLoadingState = importType === 'members' ? setImportingMembers : setImportingLoans;
    const preview = importType === 'members' ? memberPreview : loanPreview;

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

  function renderDashboard() {
    const utilizationPercent = overview.total_loan_amount > 0
      ? (overview.total_outstanding_amount / overview.total_loan_amount) * 100
      : 0;

    return (
      <div className="devmanager-section-stack">
        <section className="card dashboard-hero-card">
          <div>
            <div className="eyebrow">แดชบอร์ดผู้ดูแลระบบ</div>
            <h3 className="section-title">สรุปภาพรวมของ {settings.group_name || APP_GROUP_NAME}</h3>
            <p className="muted">
              ติดตามจำนวนสมาชิก บัญชีผู้ใช้งาน สัญญาเงินกู้ และภาระคงค้างจากข้อมูลล่าสุดในระบบ Supabase
            </p>
          </div>
          <div className="stats-row">
            <div className="stat-chip">สมาชิกทั้งหมด {overview.members_count} ราย</div>
            <div className="stat-chip">วงเงินกู้รวม {formatCurrency(overview.total_loan_amount)} บาท</div>
            <div className="stat-chip">ยอดคงค้างรวม {formatCurrency(overview.total_outstanding_amount)} บาท</div>
          </div>
        </section>

        <div className="dashboard-metrics-grid">
          <section className="card metric-card">
            <div className="metric-label">สมาชิกทั้งหมด</div>
            <div className="metric-value">{overview.members_count}</div>
            <div className="metric-subtext">ใช้งาน {overview.active_members_count} | ปิดใช้งาน {overview.inactive_members_count}</div>
          </section>
          <section className="card metric-card">
            <div className="metric-label">บัญชีผู้ใช้งาน</div>
            <div className="metric-value">{overview.users_count}</div>
            <div className="metric-subtext">อนุมัติแล้ว {overview.approved_users_count} | รออนุมัติ {overview.pending_users_count}</div>
          </section>
          <section className="card metric-card">
            <div className="metric-label">สัญญาเงินกู้</div>
            <div className="metric-value">{overview.loan_contracts_count}</div>
            <div className="metric-subtext">ยังคงค้าง {overview.active_loan_contracts_count} | ปิดแล้ว {overview.closed_loan_contracts_count}</div>
          </section>
          <section className="card metric-card">
            <div className="metric-label">ผู้ดูแลระบบ</div>
            <div className="metric-value">{overview.admin_users_count}</div>
            <div className="metric-subtext">ดูแลการตั้งค่า อนุมัติผู้ใช้ และจัดการข้อมูลกลาง</div>
          </section>
        </div>

        <div className="grid-two">
          <section className="card insight-card">
            <h3 className="section-title">สรุปวงเงินกู้</h3>
            <div className="insight-row">
              <span>วงเงินกู้รวม</span>
              <strong>{formatCurrency(overview.total_loan_amount)} บาท</strong>
            </div>
            <div className="insight-row">
              <span>ยอดคงค้างรวม</span>
              <strong>{formatCurrency(overview.total_outstanding_amount)} บาท</strong>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${Math.min(utilizationPercent, 100)}%` }} />
            </div>
            <div className="muted">สัดส่วนยอดคงค้างต่อวงเงินกู้รวม {formatCurrency(utilizationPercent)}%</div>
          </section>

          <section className="card insight-card">
            <h3 className="section-title">สัญญาณที่ควรติดตาม</h3>
            <div className="list">
              <div className="list-item">
                <strong>ผู้ใช้รออนุมัติ</strong>
                <div className="muted">มี {overview.pending_users_count} บัญชีที่ต้องตรวจสอบสิทธิ์เข้าใช้งาน</div>
              </div>
              <div className="list-item">
                <strong>สมาชิกที่ปิดใช้งาน</strong>
                <div className="muted">มี {overview.inactive_members_count} รายที่ไม่ได้ใช้งานในระบบปัจจุบัน</div>
              </div>
              <div className="list-item">
                <strong>สัญญาที่มียอดคงค้าง</strong>
                <div className="muted">มี {overview.active_loan_contracts_count} สัญญาที่ยังไม่ปิดบัญชี</div>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  function renderHomeSection() {
    return (
      <div className="devmanager-section-stack">
        <section className="card">
          <h3 className="section-title">หน้าหลักปัจจุบันของ DevManager</h3>
          <p className="muted">
            ใช้หน้านี้เป็นจุดรวมทางลัดสำหรับการดูภาพรวม ตั้งค่าระบบ นำเข้าฐานข้อมูล และอนุมัติผู้ใช้งานใหม่
          </p>
          <div className="dashboard-shortcuts">
            {sectionItems.filter((item) => item.key !== 'home').map((item) => (
              <button
                key={item.key}
                type="button"
                className="shortcut-card"
                onClick={() => setActiveSection(item.key)}
              >
                <strong>{item.label}</strong>
                <div className="muted">{item.description}</div>
              </button>
            ))}
          </div>
        </section>

        <div className="grid-two">
          <section className="card">
            <h3 className="section-title">ข้อมูลล่าสุดในระบบ</h3>
            <div className="stats-row">
              <div className="stat-chip">สมาชิก {importStats.members_count} รายการ</div>
              <div className="stat-chip">สัญญาเงินกู้ {importStats.loan_contracts_count} รายการ</div>
              <div className="stat-chip">บัญชีรออนุมัติ {overview.pending_users_count} รายการ</div>
            </div>
            <div className="notice">ข้อความประกาศปัจจุบัน: {settings.notice || 'ยังไม่มีประกาศ'}</div>
          </section>

          <section className="card">
            <h3 className="section-title">สถานะการใช้งานระบบ</h3>
            <div className="list">
              <div className="list-item">
                <strong>เปิดรับสมัครสมาชิก</strong>
                <div className="muted">{settings.allow_registration ? 'เปิดรับสมัครสมาชิกใหม่อยู่' : 'ปิดรับสมัครสมาชิกใหม่ชั่วคราว'}</div>
              </div>
              <div className="list-item">
                <strong>จำนวนผู้ดูแลระบบ</strong>
                <div className="muted">มีผู้ดูแลระบบ {overview.admin_users_count} คนที่สามารถดูแลข้อมูลส่วนกลาง</div>
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
    );
  }

  function renderApprovalsSection() {
    return (
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
    );
  }

  function renderImportsSection() {
    return (
      <div className="grid-two">
        <section className="card">
          <h3>นำเข้าฐานข้อมูลสมาชิก</h3>
          <div className="notice">คอลัมน์ที่รองรับ: เลขที่สมาชิก, คำนำหน้าชื่อ, ชื่อ, สกุล, สถานะ</div>
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
          <div className="notice">คอลัมน์ที่รองรับ: เลขที่สมาชิก, เลขที่สัญญา, คำนำหน้าชื่อ, ชื่อ, สกุล, ยอดเงินกู้, ยอดคงค้าง, สถานะ, วันที่สร้างสัญญา, ผู้ค้ำประกันคนที่ 1, ผู้ค้ำประกันคนที่ 2</div>
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
    );
  }

  function renderSectionContent() {
    if (activeSection === 'dashboard') {
      return renderDashboard();
    }

    if (activeSection === 'home') {
      return renderHomeSection();
    }

    if (activeSection === 'settings') {
      return renderSettingsSection();
    }

    if (activeSection === 'approvals') {
      return renderApprovalsSection();
    }

    return renderImportsSection();
  }

  return (
    <div className="page-shell">
      <AppMenu title="DevManager" />

      <div className="hero">
        <h1>จัดการระบบภายในเว็บแอพทั้งหมด</h1>
        <p>ใช้เมนูย่อยด้านล่างเพื่อเปิดแดชบอร์ดภาพรวม จัดการการตั้งค่า นำเข้าฐานข้อมูล และอนุมัติผู้ใช้งานใหม่</p>
      </div>

      {message && <div className="notice">{message}</div>}

      <div className="devmanager-subnav">
        {sectionItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`devmanager-tab ${activeSection === item.key ? 'devmanager-tab-active' : ''}`}
            onClick={() => setActiveSection(item.key)}
          >
            <strong>{item.label}</strong>
            <span>{item.description}</span>
          </button>
        ))}
      </div>

      <div className="section-space">
        {renderSectionContent()}
      </div>
    </div>
  );
}
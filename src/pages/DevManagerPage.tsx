import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAdminPanel, importCsvData, updateSettings, updateUserStatus } from '../api/adminApi';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../contexts/AuthContext';
import type { AppSettings, AppUser, CsvImportType, CsvPreviewSummary, ImportStats } from '../types';
import { buildCsvPreview } from '../utils/csvPreview';

const defaultSettings: AppSettings = {
  group_name: 'กลุ่มออมทรัพย์เพื่อการผลิต บ้านพิตำ',
  notice: 'ผู้ดูแลระบบสามารถตั้งค่าข้อความประกาศได้จากหน้านี้',
  allow_registration: true,
};

export function DevManagerPage() {
  const { session, logout } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [importStats, setImportStats] = useState<ImportStats>({ members_count: 0, loan_contracts_count: 0 });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
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
        <p>อนุมัติผู้ใช้งานใหม่ ตั้งค่าการสมัครสมาชิก จัดการข้อความประกาศ และนำเข้าฐานข้อมูลเดิมจาก CSV</p>
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

      <div className="grid-two section-space">
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
    </div>
  );
}
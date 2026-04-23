import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { fetchAdminPanel, fetchLoanPaymentAudit, fetchLoanReport, importCsvData, updateSettings, updateUserStatus } from '../api/adminApi';
import { fetchLoanWorkspaceConfig } from '../api/loanWorkspaceApi';
import { AppMenu } from '../components/AppMenu';
import { APP_GROUP_NAME } from '../constants/appBrand';
import { canManageRole, defaultRolePermissions, getAssignableRoles, permissionLabels, roleLabels, roleLevelLabels } from '../constants/permissions';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../contexts/AuthContext';
import { formatDateOnly } from '../utils/dateFormat';
import { exportLoanReportToPdf } from '../utils/loanReportExport';
import type { AdminOverview, AppSettings, AppUser, CsvImportType, CsvPreviewSummary, ImportStats, LoanPaymentAuditRecord, LoanReportColumnKey, LoanReportColumnSettings, LoanReportData, LoanReportPaperSettings, LoanReportRow, LoanReportType, LoanWorkingDateEntry, PaginationMeta, PermissionKey, PermissionSet, UserRole } from '../types';
import { buildCsvPreview } from '../utils/csvPreview';

const reportColumnOrder: LoanReportColumnKey[] = [
  'sequence',
  'member_no',
  'member_name',
  'opening_balance',
  'principal_paid',
  'interest_paid',
  'remaining_balance',
  'note',
];

const reportColumnLabels: Record<LoanReportColumnKey, string> = {
  sequence: 'ที่',
  member_no: 'เลขสมาชิก',
  member_name: 'ชื่อ - สกุล',
  opening_balance: 'หนี้ยกมา',
  principal_paid: 'ชำระต้น',
  interest_paid: 'ชำระดอกเบี้ย',
  remaining_balance: 'คงเหลือ',
  note: 'หมายเหตุ',
};

const a4PortraitColumnSettings: LoanReportColumnSettings = {
  sequence: { width_mm: 9, height_mm: 6, header_text: reportColumnLabels.sequence },
  member_no: { width_mm: 14, height_mm: 6, header_text: reportColumnLabels.member_no },
  member_name: { width_mm: 45, height_mm: 6, header_text: reportColumnLabels.member_name },
  opening_balance: { width_mm: 22, height_mm: 6, header_text: reportColumnLabels.opening_balance },
  principal_paid: { width_mm: 20, height_mm: 6, header_text: reportColumnLabels.principal_paid },
  interest_paid: { width_mm: 20, height_mm: 6, header_text: reportColumnLabels.interest_paid },
  remaining_balance: { width_mm: 22, height_mm: 6, header_text: reportColumnLabels.remaining_balance },
  note: { width_mm: 32, height_mm: 6, header_text: reportColumnLabels.note },
};

const a4LandscapeColumnSettings: LoanReportColumnSettings = {
  sequence: { width_mm: 10, height_mm: 6, header_text: reportColumnLabels.sequence },
  member_no: { width_mm: 16, height_mm: 6, header_text: reportColumnLabels.member_no },
  member_name: { width_mm: 66, height_mm: 6, header_text: reportColumnLabels.member_name },
  opening_balance: { width_mm: 28, height_mm: 6, header_text: reportColumnLabels.opening_balance },
  principal_paid: { width_mm: 24, height_mm: 6, header_text: reportColumnLabels.principal_paid },
  interest_paid: { width_mm: 24, height_mm: 6, header_text: reportColumnLabels.interest_paid },
  remaining_balance: { width_mm: 28, height_mm: 6, header_text: reportColumnLabels.remaining_balance },
  note: { width_mm: 48, height_mm: 6, header_text: reportColumnLabels.note },
};

const defaultReportColumnSettings: LoanReportColumnSettings = {
  ...a4PortraitColumnSettings,
};

const defaultSettings: AppSettings = {
  group_name: APP_GROUP_NAME,
  notice: 'ผู้ดูแลระบบสามารถตั้งค่าข้อความประกาศได้จากหน้านี้',
  allow_registration: true,
  role_permissions: defaultRolePermissions,
  loan_report_paper_settings: {
    paper_size: 'a4',
    orientation: 'portrait',
    margin_top_mm: 10,
    margin_right_mm: 10,
    margin_bottom_mm: 10,
    margin_left_mm: 10,
    font_scale: 1,
    table_width_percent: 100,
    table_height_percent: 100,
    column_settings: defaultReportColumnSettings,
  },
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

type DevManagerSection = 'home' | 'settings' | 'imports' | 'approvals' | 'payments' | 'reports';

const reportTypeLabels: Record<LoanReportType, string> = {
  'working-day': 'รายงานวันทำการ',
  outstanding: 'รายงานหนี้คงค้าง',
};

const defaultPaperSettings: LoanReportPaperSettings = {
  paper_size: 'a4',
  orientation: 'portrait',
  margin_top_mm: 10,
  margin_right_mm: 10,
  margin_bottom_mm: 10,
  margin_left_mm: 10,
  font_scale: 1,
  table_width_percent: 100,
  table_height_percent: 100,
  column_settings: defaultReportColumnSettings,
};

function clampPaperSetting(value: unknown, fallback: number, min: number, max: number) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, numericValue));
}

function pxToMm(value: number) {
  return Math.round((value * 0.2645833333) * 10) / 10;
}

function getPaperPresetColumnSettings(orientation: LoanReportPaperSettings['orientation']): LoanReportColumnSettings {
  return orientation === 'landscape' ? a4LandscapeColumnSettings : a4PortraitColumnSettings;
}

function normalizeReportColumnSettings(value: unknown): LoanReportColumnSettings {
  const source = value && typeof value === 'object'
    ? value as Partial<Record<LoanReportColumnKey, Partial<{ width_mm: number; width_px: number; height_mm: number; height_px: number; header_text: string }>>>
    : {};

  return reportColumnOrder.reduce<LoanReportColumnSettings>((settingsMap, columnKey) => {
    const parsedColumn = source[columnKey];
    const fallbackWidthMm = parsedColumn?.width_mm ?? (parsedColumn?.width_px !== undefined ? pxToMm(Number(parsedColumn.width_px)) : defaultReportColumnSettings[columnKey].width_mm);
    const rawHeightMm = parsedColumn?.height_mm ?? (parsedColumn?.height_px !== undefined ? pxToMm(Number(parsedColumn.height_px)) : defaultReportColumnSettings[columnKey].height_mm);
    // Migrate old default 8.5mm to new default 6mm automatically
    const fallbackHeightMm = rawHeightMm === 8.5 ? defaultReportColumnSettings[columnKey].height_mm : rawHeightMm;
    settingsMap[columnKey] = {
      width_mm: clampPaperSetting(fallbackWidthMm, defaultReportColumnSettings[columnKey].width_mm, 6, 70),
      height_mm: clampPaperSetting(fallbackHeightMm, defaultReportColumnSettings[columnKey].height_mm, 4, 20),
      header_text: typeof parsedColumn?.header_text === 'string' && parsedColumn.header_text.trim()
        ? parsedColumn.header_text.trim()
        : defaultReportColumnSettings[columnKey].header_text,
    };
    return settingsMap;
  }, { ...defaultReportColumnSettings });
}

function normalizePaperSettings(value: unknown): LoanReportPaperSettings {
  if (!value || typeof value !== 'object') {
    return defaultPaperSettings;
  }

  const parsed = value as Partial<LoanReportPaperSettings>;
  const legacyMargin = clampPaperSetting((parsed as Partial<{ margin_mm: number }>).margin_mm, defaultPaperSettings.margin_top_mm, 6, 25);
  return {
    paper_size: parsed.paper_size === 'letter' ? 'letter' : 'a4',
    orientation: parsed.orientation === 'landscape' ? 'landscape' : 'portrait',
    margin_top_mm: clampPaperSetting(parsed.margin_top_mm, legacyMargin, 6, 25),
    margin_right_mm: clampPaperSetting(parsed.margin_right_mm, legacyMargin, 6, 25),
    margin_bottom_mm: clampPaperSetting(parsed.margin_bottom_mm, legacyMargin, 6, 25),
    margin_left_mm: clampPaperSetting(parsed.margin_left_mm, legacyMargin, 6, 25),
    font_scale: clampPaperSetting(parsed.font_scale, defaultPaperSettings.font_scale, 0.85, 1.15),
    table_width_percent: clampPaperSetting(parsed.table_width_percent, defaultPaperSettings.table_width_percent, 70, 100),
    table_height_percent: clampPaperSetting(parsed.table_height_percent, defaultPaperSettings.table_height_percent, 70, 100),
    column_settings: normalizeReportColumnSettings(parsed.column_settings),
  };
}

const sectionItems: Array<{ key: DevManagerSection; label: string; description: string; path: string }> = [
  { key: 'home', label: 'เมนูหลัก DevManager', description: 'รวมเมนูดูแลระบบทั้งหมดไว้ในหน้าเดียว', path: '/devmanager' },
  { key: 'settings', label: 'การตั้งค่าระบบ', description: 'แก้ไขชื่อกลุ่ม ประกาศ สิทธิ์สมัคร และ permission matrix', path: '/devmanager/settings' },
  { key: 'imports', label: 'การนำเข้าฐานข้อมูล', description: 'นำเข้าไฟล์ CSV สมาชิกและสินเชื่อ', path: '/devmanager/imports' },
  { key: 'approvals', label: 'ผู้ใช้งานรออนุมัติ', description: 'ตรวจและอนุมัติบัญชีผู้ใช้', path: '/devmanager/approvals' },
  { key: 'payments', label: 'ตรวจสอบรายการรับชำระ', description: 'ค้นหาธุรกรรมรับชำระจากเลขสมาชิกหรือวันทำการกลุ่ม', path: '/devmanager/payments' },
  { key: 'reports', label: 'รายงาน', description: 'ออกรายงานวันทำการและรายงานหนี้คงค้าง พร้อมพิมพ์และบันทึก PDF', path: '/devmanager/reports' },
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

  if (pathname === '/devmanager/reports') {
    return 'reports';
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

function formatReportMoney(value: number) {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCalendarYear(year: number) {
  return year + 543;
}

function getLatestConfiguredWorkingDate(workingDates: LoanWorkingDateEntry[]) {
  const configuredDates = workingDates.map((item) => item.date).filter((date): date is string => Boolean(date)).sort((left, right) => left.localeCompare(right));
  return configuredDates[configuredDates.length - 1] ?? '';
}

function buildReportYearOptions(activeYear: number, currentYear: number) {
  const years = new Set<number>();
  for (let offset = -5; offset <= 5; offset += 1) {
    years.add(currentYear + offset);
  }
  years.add(activeYear);
  return [...years].sort((left, right) => left - right);
}

function chunkReportRows(rows: LoanReportRow[], pageSize: number) {
  const chunks: LoanReportRow[][] = [];
  for (let index = 0; index < rows.length; index += pageSize) {
    chunks.push(rows.slice(index, index + pageSize));
  }
  return chunks.length > 0 ? chunks : [[]];
}

function getPageRows(rows: LoanReportRow[], pageSize: number) {
  const chunk = [...rows];
  while (chunk.length < pageSize) {
    chunk.push({
      sequence: 0,
      member_no: '',
      member_name: '',
      contract_no: '',
      opening_balance: 0,
      principal_paid: 0,
      interest_paid: 0,
      remaining_balance: 0,
      normal_principal_amount: 0,
      cash_amount: 0,
      settlement_amount: 0,
      note: null,
      payment_mode: 'normal',
      overdue_installments: 0,
      is_overdue: false,
      is_settlement: false,
    });
  }
  return chunk;
}

function loadPaperSettings(): LoanReportPaperSettings {
  if (typeof window === 'undefined') {
    return defaultPaperSettings;
  }

  try {
    const raw = window.localStorage.getItem('loan-report-paper-settings');
    if (!raw) {
      return defaultPaperSettings;
    }

    return normalizePaperSettings(JSON.parse(raw));
  } catch {
    return defaultPaperSettings;
  }
}

function getPaperDimensions(settings: LoanReportPaperSettings) {
  const dimensions = settings.paper_size === 'letter'
    ? { width: 216, height: 279 }
    : { width: 210, height: 297 };

  return settings.orientation === 'landscape'
    ? { width: dimensions.height, height: dimensions.width }
    : dimensions;
}

export function DevManagerPage() {
  const location = useLocation();
  const { session, setSessionData } = useAuth();
  const reportPreviewRef = useRef<HTMLDivElement | null>(null);
  const isDevAdmin = session?.user.role === 'dev_admin';
  const currentYear = new Date().getFullYear();
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
  const [savingPaperSettings, setSavingPaperSettings] = useState(false);
  const [loadingPaymentAudit, setLoadingPaymentAudit] = useState(false);
  const [paymentAuditRecords, setPaymentAuditRecords] = useState<LoanPaymentAuditRecord[]>([]);
  const [paymentAuditPagination, setPaymentAuditPagination] = useState<PaginationMeta>(defaultPagination);
  const [paymentAuditWorkingDates, setPaymentAuditWorkingDates] = useState<LoanWorkingDateEntry[]>([]);
  const [paymentAuditFilters, setPaymentAuditFilters] = useState({ memberNo: '', paidDate: '' });
  const [loadingReportConfig, setLoadingReportConfig] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [savingReportPdf, setSavingReportPdf] = useState(false);
  const [reportYear, setReportYear] = useState(currentYear);
  const [reportWorkingDates, setReportWorkingDates] = useState<LoanWorkingDateEntry[]>([]);
  const [reportFilters, setReportFilters] = useState<{ reportType: LoanReportType; paidDate: string }>({ reportType: 'working-day', paidDate: '' });
  const [reportData, setReportData] = useState<LoanReportData | null>(null);
  const [paperSettings, setPaperSettings] = useState<LoanReportPaperSettings>(() => loadPaperSettings());
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

  useEffect(() => {
    if (!session || activeSection !== 'reports') {
      return;
    }

    void loadReportConfig(reportYear);
  }, [session, activeSection, reportYear]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem('loan-report-paper-settings', JSON.stringify(paperSettings));
  }, [paperSettings]);

  async function loadPanel(successMessage = 'โหลดข้อมูลล่าสุดเรียบร้อย') {
    if (!session) {
      return;
    }

    setLoading(true);

    try {
      const result = await fetchAdminPanel(session.access_token);
      setUsers(result.data.users);
      setSettings(result.data.settings);
      setPaperSettings(normalizePaperSettings(result.data.settings.loan_report_paper_settings));
      setImportStats(result.data.import_stats);
      setOverview(result.data.overview);
      setMessage(successMessage);
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

  async function loadReportConfig(targetYear: number) {
    if (!session) {
      return;
    }

    try {
      setLoadingReportConfig(true);
      setReportData(null);
      const result = await fetchLoanWorkspaceConfig(session.access_token, targetYear);
      const workingDates = result.data.working_dates;
      const defaultPaidDate = getLatestConfiguredWorkingDate(workingDates);
      setReportWorkingDates(workingDates);
      setReportFilters((current) => ({
        ...current,
        paidDate: workingDates.some((item) => item.date === current.paidDate) ? current.paidDate : defaultPaidDate,
      }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'โหลดวันทำการสำหรับรายงานไม่สำเร็จ');
    } finally {
      setLoadingReportConfig(false);
    }
  }

  async function loadReport(nextFilters = reportFilters) {
    if (!session) {
      return;
    }

    try {
      setLoadingReport(true);
      const result = await fetchLoanReport(session.access_token, nextFilters);
      setReportData(result.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'โหลดรายงานไม่สำเร็จ');
    } finally {
      setLoadingReport(false);
    }
  }

  async function handleSaveReportPdf() {
    if (!reportData || !reportPreviewRef.current) {
      return;
    }

    try {
      setSavingReportPdf(true);
      const fileName = `${reportTypeLabels[reportData.report_type]}-${reportData.paid_date}.pdf`;
      await exportLoanReportToPdf(reportPreviewRef.current, fileName, paperSettings);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'บันทึกรายงาน PDF ไม่สำเร็จ');
    } finally {
      setSavingReportPdf(false);
    }
  }

  function handlePrintReport() {
    if (!reportData || !reportPreviewRef.current || !window) {
      return;
    }

    const printWindow = window.open('', '_blank', 'width=1200,height=900');
    if (!printWindow) {
      setMessage('ไม่สามารถเปิดหน้าต่างพิมพ์ได้ กรุณาอนุญาต popup ก่อน');
      return;
    }

    const copiedStyles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((element) => element.outerHTML)
      .join('\n');

    const paperSizeText = paperSettings.paper_size === 'letter' ? 'letter' : 'A4';
    printWindow.document.write(`<!doctype html><html><head><title>${reportTypeLabels[reportData.report_type]}</title>${copiedStyles}<style>@page { size: ${paperSizeText} ${paperSettings.orientation}; margin: ${paperSettings.margin_top_mm}mm ${paperSettings.margin_right_mm}mm ${paperSettings.margin_bottom_mm}mm ${paperSettings.margin_left_mm}mm; } body { background: white; } .page-shell, .hero, .app-header { display:none !important; } .loan-report-preview-shell { margin: 0; padding: 0; } .loan-report-preview { gap: 0; } .loan-report-print-page { box-shadow: none !important; margin: 0 auto 8mm; break-after: page; page-break-after: always; } .loan-report-print-page:last-child { break-after: auto; page-break-after: auto; }</style></head><body>${reportPreviewRef.current.innerHTML}<script>window.onload = () => { window.print(); };</script></body></html>`);
    printWindow.document.close();
  }

  function updatePaperSetting<Key extends keyof LoanReportPaperSettings>(key: Key, value: LoanReportPaperSettings[Key]) {
    setPaperSettings((current) => {
      const nextSettings = normalizePaperSettings({ ...current, [key]: value });
      setSettings((currentSettings) => ({
        ...currentSettings,
        loan_report_paper_settings: nextSettings,
      }));
      return nextSettings;
    });
  }

  function applyPaperPreset(orientation: LoanReportPaperSettings['orientation']) {
    setPaperSettings((current) => {
      const presetColumnSettings = getPaperPresetColumnSettings(orientation);
      const nextSettings = normalizePaperSettings({
        ...current,
        paper_size: 'a4',
        orientation,
        column_settings: reportColumnOrder.reduce<LoanReportColumnSettings>((map, columnKey) => {
          map[columnKey] = {
            ...presetColumnSettings[columnKey],
            header_text: current.column_settings[columnKey].header_text,
          };
          return map;
        }, { ...presetColumnSettings }),
      });
      setSettings((currentSettings) => ({
        ...currentSettings,
        loan_report_paper_settings: nextSettings,
      }));
      return nextSettings;
    });
  }

  function updatePaperColumnSetting(columnKey: LoanReportColumnKey, dimension: 'width_mm' | 'height_mm', value: number) {
    setPaperSettings((current) => {
      const nextColumnSettings = dimension === 'height_mm'
        ? reportColumnOrder.reduce<LoanReportColumnSettings>((map, key) => {
            map[key] = {
              ...current.column_settings[key],
              height_mm: value,
            };
            return map;
          }, { ...current.column_settings })
        : {
            ...current.column_settings,
            [columnKey]: {
              ...current.column_settings[columnKey],
              [dimension]: value,
            },
          };

      const nextSettings = normalizePaperSettings({
        ...current,
        column_settings: nextColumnSettings,
      });
      setSettings((currentSettings) => ({
        ...currentSettings,
        loan_report_paper_settings: nextSettings,
      }));
      return nextSettings;
    });
  }

  function updatePaperColumnHeader(columnKey: LoanReportColumnKey, value: string) {
    setPaperSettings((current) => {
      const nextSettings = normalizePaperSettings({
        ...current,
        column_settings: {
          ...current.column_settings,
          [columnKey]: {
            ...current.column_settings[columnKey],
            header_text: value,
          },
        },
      });
      setSettings((currentSettings) => ({
        ...currentSettings,
        loan_report_paper_settings: nextSettings,
      }));
      return nextSettings;
    });
  }

  function getReportSummaryItems(report: LoanReportData) {
    return [
      { label: 'ยอดหนี้ยกมา', value: report.summary.opening_balance, hidden: false },
      { label: 'ชำระต้น', value: report.summary.principal_paid, hidden: report.report_type === 'outstanding' || report.summary.principal_paid === 0 },
      { label: 'ดอกเบี้ย', value: report.summary.interest_paid, hidden: report.report_type === 'outstanding' || report.summary.interest_paid === 0 },
      { label: 'กลบหนี้', value: report.summary.settlement_amount, hidden: !report.show_settlement_summary || report.summary.settlement_amount === 0 },
      { label: 'ส่งบัญชี', value: report.summary.cash_received, hidden: report.report_type === 'outstanding' || report.summary.cash_received === 0 },
      { label: 'หนี้ยกไป', value: report.summary.closing_balance, hidden: false },
    ].filter((item) => !item.hidden);
  }

  function getReportPageTotals(report: LoanReportData, rows: LoanReportRow[]) {
    return rows.reduce((summary, row) => ({
      opening_balance: summary.opening_balance + row.opening_balance,
      principal_paid: summary.principal_paid + (report.report_type === 'working-day' ? row.principal_paid : 0),
      interest_paid: summary.interest_paid + (report.report_type === 'working-day' ? row.interest_paid : 0),
      closing_balance: summary.closing_balance + (report.report_type === 'working-day' ? row.remaining_balance : 0),
    }), {
      opening_balance: 0,
      principal_paid: 0,
      interest_paid: 0,
      closing_balance: 0,
    });
  }

  function getCoverPageNotes(report: LoanReportData) {
    if (report.report_type !== 'working-day') {
      return [] as string[];
    }

    return report.rows
      .filter((row) => row.normal_principal_amount > 0 && row.settlement_amount > 0)
      .map((row) => `${row.member_no} ${row.member_name} ชำระต้น ${formatReportMoney(row.normal_principal_amount)} บาท กลบหนี้ ${formatReportMoney(row.settlement_amount)} บาท`);
  }

  function isMissingPaymentNote(note: string | null) {
    return String(note ?? '').trim() === 'ขาดส่ง';
  }

  function renderReportNote(note: string | null) {
    const text = String(note ?? '');
    if (!text) {
      return '';
    }

    return text.split(/(กลบหนี้)/g).map((part, index) => (
      part === 'กลบหนี้'
        ? <span key={`report-note-${index}`} className="loan-report-note-settlement">{part}</span>
        : <span key={`report-note-${index}`}>{part}</span>
    ));
  }

  function renderReportPreview(report: LoanReportData) {
    const paperDimensions = getPaperDimensions(paperSettings);
    const coverPageNotes = getCoverPageNotes(report);
    const usablePageWidth = Math.max(120, paperDimensions.width - paperSettings.margin_left_mm - paperSettings.margin_right_mm);
    const usablePageHeight = Math.max(160, paperDimensions.height - paperSettings.margin_top_mm - paperSettings.margin_bottom_mm);
    const tableShellWidth = `${usablePageWidth * (paperSettings.table_width_percent / 100)}mm`;
    const columnSettings = paperSettings.column_settings;
    const configuredRowHeightMm = Math.max(...reportColumnOrder.map((columnKey) => columnSettings[columnKey].height_mm));
    const detailHeaderReserveMm = 14;
    const detailPageGapReserveMm = 3;
    const detailTableAvailableHeight = Math.max(70, usablePageHeight - detailHeaderReserveMm - detailPageGapReserveMm);
    const detailTableHeightMm = Math.max(70, detailTableAvailableHeight * (paperSettings.table_height_percent / 100));
    const totalTableRows = report.rows_per_page + 2;
    const effectiveRowHeightMm = Math.min(configuredRowHeightMm, roundMoney(detailTableHeightMm / totalTableRows));
    const pages = chunkReportRows(report.rows, report.rows_per_page);
    const detailTableShellStyle = {
      width: tableShellWidth,
      minHeight: `${detailTableHeightMm}mm`,
      maxHeight: `${detailTableHeightMm}mm`,
    };
    const getColumnCellStyle = (columnKey: LoanReportColumnKey) => ({
      minHeight: `${effectiveRowHeightMm}mm`,
      height: `${effectiveRowHeightMm}mm`,
    });
    const pageStyle = {
      width: `${paperDimensions.width}mm`,
      minHeight: `${paperDimensions.height}mm`,
      paddingTop: `${paperSettings.margin_top_mm}mm`,
      paddingRight: `${paperSettings.margin_right_mm}mm`,
      paddingBottom: `${paperSettings.margin_bottom_mm}mm`,
      paddingLeft: `${paperSettings.margin_left_mm}mm`,
      fontFamily: '"Angsana New", "AngsanaUPC", serif',
      fontSize: `${14 * paperSettings.font_scale}pt`,
    };

    return (
      <div ref={reportPreviewRef} className="loan-report-preview-shell">
        <div className="loan-report-preview">
          <section className="loan-report-print-page loan-report-cover-page" style={pageStyle}>
            <div className="loan-report-cover-block">
              <div className="eyebrow">เอกสารรายงาน</div>
              <h2>{report.title}</h2>
              <div className="loan-report-cover-meta">
                <div><strong>{report.group_name}</strong></div>
                <div>{report.subtitle}</div>
                <div>วันทำการกลุ่ม {formatDisplayDate(report.paid_date)}</div>
              </div>
            </div>
            <div className="loan-report-summary-grid">
              {getReportSummaryItems(report).map((item) => (
                <div key={item.label} className="loan-report-summary-card">
                  <span>{item.label}</span>
                    <strong>{formatReportMoney(item.value)}</strong>
                </div>
              ))}
            </div>
            {coverPageNotes.length > 0 && (
              <div className="loan-report-cover-notes">
                <strong>หมายเหตุ</strong>
                <div className="loan-report-cover-note-list">
                  {coverPageNotes.map((note) => (
                    <div key={note}>{note}</div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {pages.map((pageRows, pageIndex) => {
            const totals = getReportPageTotals(report, pageRows);
            const paddedRows = getPageRows(pageRows, report.rows_per_page);

            return (
              <section key={`${report.report_type}-page-${pageIndex + 1}`} className="loan-report-print-page loan-report-detail-page" style={pageStyle}>
                <div className="loan-report-page-header">
                  <div>
                    <strong>{report.title}</strong>
                    <div className="muted">{report.group_name} | วันทำการ {formatDisplayDate(report.paid_date)}</div>
                  </div>
                  <div className="loan-report-page-counter">หน้า {pageIndex + 2}</div>
                </div>

                <div className="loan-report-table-shell" style={detailTableShellStyle}>
                  <table className="loan-report-table">
                    <colgroup>
                      {reportColumnOrder.map((columnKey) => (
                        <col key={columnKey} style={{ width: `${columnSettings[columnKey].width_mm}mm` }} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr>
                        <th style={getColumnCellStyle('sequence')}>{columnSettings.sequence.header_text}</th>
                        <th style={getColumnCellStyle('member_no')}>{columnSettings.member_no.header_text}</th>
                        <th style={getColumnCellStyle('member_name')}>{columnSettings.member_name.header_text}</th>
                        <th style={getColumnCellStyle('opening_balance')}>{columnSettings.opening_balance.header_text}</th>
                        <th style={getColumnCellStyle('principal_paid')}>{columnSettings.principal_paid.header_text}</th>
                        <th style={getColumnCellStyle('interest_paid')}>{columnSettings.interest_paid.header_text}</th>
                        <th style={getColumnCellStyle('remaining_balance')}>{columnSettings.remaining_balance.header_text}</th>
                        <th style={getColumnCellStyle('note')}>{columnSettings.note.header_text}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paddedRows.map((row, rowIndex) => {
                        const hasSequence = row.sequence > 0;
                        const rowClassName = [
                          hasSequence && row.is_overdue && report.report_type === 'outstanding' ? 'loan-report-row-overdue' : '',
                          hasSequence && isMissingPaymentNote(row.note) ? 'loan-report-row-note-danger' : '',
                        ].filter(Boolean).join(' ');

                        return (
                        <tr key={`report-row-${pageIndex + 1}-${row.sequence || rowIndex + 1}`} className={rowClassName}>
                          <td style={getColumnCellStyle('sequence')}>{row.sequence || ''}</td>
                          <td style={getColumnCellStyle('member_no')}>{row.member_no}</td>
                          <td style={getColumnCellStyle('member_name')}>
                            {row.member_name && <strong className="loan-report-name">{row.member_name}</strong>}
                          </td>
                          <td style={getColumnCellStyle('opening_balance')}>{row.sequence > 0 ? formatReportMoney(row.opening_balance) : ''}</td>
                          <td style={getColumnCellStyle('principal_paid')}>{row.sequence > 0 && report.report_type === 'working-day' && row.principal_paid > 0 ? formatReportMoney(row.principal_paid) : ''}</td>
                          <td style={getColumnCellStyle('interest_paid')}>{row.sequence > 0 && report.report_type === 'working-day' && row.interest_paid > 0 ? formatReportMoney(row.interest_paid) : ''}</td>
                          <td style={getColumnCellStyle('remaining_balance')}>{row.sequence > 0 && report.report_type === 'working-day' ? formatReportMoney(row.remaining_balance) : ''}</td>
                          <td style={getColumnCellStyle('note')} className={row.sequence > 0 && row.is_overdue ? 'loan-report-note-danger' : ''}>
                            {row.sequence > 0 ? renderReportNote(row.note) : ''}
                          </td>
                        </tr>
                      );})}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3}><strong>รวมหน้า</strong></td>
                        <td><strong>{formatReportMoney(totals.opening_balance)}</strong></td>
                        <td><strong>{report.report_type === 'working-day' && totals.principal_paid > 0 ? formatReportMoney(totals.principal_paid) : ''}</strong></td>
                        <td><strong>{report.report_type === 'working-day' && totals.interest_paid > 0 ? formatReportMoney(totals.interest_paid) : ''}</strong></td>
                        <td><strong>{report.report_type === 'working-day' && totals.closing_balance > 0 ? formatReportMoney(totals.closing_balance) : ''}</strong></td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    );
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
      await loadPanel(result.message);
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
          ? { ...settings, loan_report_paper_settings: paperSettings }
          : {
              group_name: settings.group_name,
              notice: settings.notice,
              allow_registration: settings.allow_registration,
              loan_report_paper_settings: paperSettings,
            } as AppSettings,
      );

      const nextPermissions: PermissionSet = isDevAdmin
        ? settings.role_permissions[session.user.role]
        : session.permissions;

      setSessionData({
        ...session,
        permissions: nextPermissions,
      });

      await loadPanel(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'บันทึกการตั้งค่าไม่สำเร็จ');
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleSavePaperSettings() {
    if (!session) {
      return;
    }

    try {
      setSavingPaperSettings(true);
      const result = await updateSettings(
        session.access_token,
        isDevAdmin
          ? { ...settings, loan_report_paper_settings: paperSettings }
          : {
              group_name: settings.group_name,
              notice: settings.notice,
              allow_registration: settings.allow_registration,
              loan_report_paper_settings: paperSettings,
            } as AppSettings,
      );
      setSettings((current) => ({
        ...current,
        loan_report_paper_settings: paperSettings,
      }));
      setMessage(result.message);
      await loadPanel();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'บันทึกค่าหน้ากระดาษไม่สำเร็จ');
    } finally {
      setSavingPaperSettings(false);
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

  function renderReportsSection() {
    const configuredWorkingDates = reportWorkingDates.filter((item) => item.date);
    const reportYearOptions = buildReportYearOptions(reportYear, currentYear);

    return (
      <div className="devmanager-section-stack">
        <section className="card">
          <div className="topbar devmanager-section-topbar">
            <div>
              <h3 className="section-title">รายงาน</h3>
              <div className="muted">เลือกวันทำการกลุ่มที่กำหนดไว้ในระบบ แล้วดูรายงานบนหน้าเว็บก่อนบันทึกหรือพิมพ์ PDF</div>
            </div>
            <Link to="/devmanager" className="btn btn-secondary">กลับเมนู DevManager</Link>
          </div>

          <div className="grid-two report-config-grid">
            <form
              className="report-filter-card"
              onSubmit={(event) => {
                event.preventDefault();
                void loadReport(reportFilters);
              }}
            >
              <label className="field">
                <span>ประเภทรายงาน</span>
                <select value={reportFilters.reportType} onChange={(event) => setReportFilters((current) => ({ ...current, reportType: event.target.value as LoanReportType }))}>
                  {Object.entries(reportTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>ปีปฏิทิน</span>
                <select value={reportYear} onChange={(event) => setReportYear(Number(event.target.value))}>
                  {reportYearOptions.map((year) => (
                    <option key={year} value={year}>ปี {formatCalendarYear(year)}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>วันทำการกลุ่ม</span>
                <select value={reportFilters.paidDate} onChange={(event) => setReportFilters((current) => ({ ...current, paidDate: event.target.value }))} disabled={loadingReportConfig || configuredWorkingDates.length === 0}>
                  <option value="">เลือกวันทำการ</option>
                  {configuredWorkingDates.map((item) => (
                    <option key={`${reportYear}-${item.month}`} value={item.date ?? ''}>{formatDisplayDate(item.date)}</option>
                  ))}
                </select>
              </label>
              <div className="actions compact-actions">
                <button type="submit" className="btn btn-primary" disabled={loadingReport || !reportFilters.paidDate}>
                  {loadingReport ? 'กำลังสร้างรายงาน...' : 'แสดงรายงาน'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    const nextPaidDate = getLatestConfiguredWorkingDate(reportWorkingDates);
                    setReportFilters({ reportType: 'working-day', paidDate: nextPaidDate });
                    setReportData(null);
                  }}
                >
                  ล้างค่า
                </button>
              </div>
            </form>

            <div className="report-paper-settings-card">
              <h4>ตั้งค่าหน้ากระดาษ</h4>
              <div className="report-paper-preset-row">
                <button type="button" className="btn btn-secondary" onClick={() => applyPaperPreset('portrait')}>
                  Preset A4 แนวตั้ง
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => applyPaperPreset('landscape')}>
                  Preset A4 แนวนอน
                </button>
              </div>
              <div className="field">
                <span>ขนาดกระดาษ</span>
                <select value={paperSettings.paper_size} onChange={(event) => updatePaperSetting('paper_size', event.target.value as LoanReportPaperSettings['paper_size'])}>
                  <option value="a4">A4</option>
                  <option value="letter">Letter</option>
                </select>
              </div>
              <div className="field">
                <span>แนวกระดาษ</span>
                <select value={paperSettings.orientation} onChange={(event) => updatePaperSetting('orientation', event.target.value as LoanReportPaperSettings['orientation'])}>
                  <option value="portrait">แนวตั้ง</option>
                  <option value="landscape">แนวนอน</option>
                </select>
              </div>
              <div className="field">
                <span>ระยะขอบบน (มม.)</span>
                <input type="number" min={6} max={25} value={paperSettings.margin_top_mm} onChange={(event) => updatePaperSetting('margin_top_mm', Number(event.target.value) || defaultPaperSettings.margin_top_mm)} />
              </div>
              <div className="field">
                <span>ระยะขอบขวา (มม.)</span>
                <input type="number" min={6} max={25} value={paperSettings.margin_right_mm} onChange={(event) => updatePaperSetting('margin_right_mm', Number(event.target.value) || defaultPaperSettings.margin_right_mm)} />
              </div>
              <div className="field">
                <span>ระยะขอบล่าง (มม.)</span>
                <input type="number" min={6} max={25} value={paperSettings.margin_bottom_mm} onChange={(event) => updatePaperSetting('margin_bottom_mm', Number(event.target.value) || defaultPaperSettings.margin_bottom_mm)} />
              </div>
              <div className="field">
                <span>ระยะขอบซ้าย (มม.)</span>
                <input type="number" min={6} max={25} value={paperSettings.margin_left_mm} onChange={(event) => updatePaperSetting('margin_left_mm', Number(event.target.value) || defaultPaperSettings.margin_left_mm)} />
              </div>
              <div className="field">
                <span>ขนาดตัวอักษร</span>
                <select value={String(paperSettings.font_scale)} onChange={(event) => updatePaperSetting('font_scale', Number(event.target.value))}>
                  <option value="0.9">เล็ก</option>
                  <option value="1">ปกติ</option>
                  <option value="1.08">ใหญ่</option>
                </select>
              </div>
              <div className="field">
                <span>ความกว้างตาราง (%)</span>
                <input type="number" min={70} max={100} value={paperSettings.table_width_percent} onChange={(event) => updatePaperSetting('table_width_percent', Number(event.target.value) || defaultPaperSettings.table_width_percent)} />
              </div>
              <div className="field">
                <span>ความสูงตาราง (%)</span>
                <input type="number" min={70} max={100} value={paperSettings.table_height_percent} onChange={(event) => updatePaperSetting('table_height_percent', Number(event.target.value) || defaultPaperSettings.table_height_percent)} />
              </div>
              <div className="report-column-settings-block">
                <strong>ขนาดคอลัมน์</strong>
                <div className="report-column-settings-grid">
                  {reportColumnOrder.map((columnKey) => (
                    <div key={columnKey} className="report-column-settings-item">
                      <div className="report-column-settings-title">{reportColumnLabels[columnKey]}</div>
                      <label className="field report-column-setting-field">
                        <span>ชื่อหัวคอลัมน์</span>
                        <input
                          type="text"
                          maxLength={40}
                          value={paperSettings.column_settings[columnKey].header_text}
                          onChange={(event) => updatePaperColumnHeader(columnKey, event.target.value)}
                        />
                      </label>
                      <label className="field report-column-setting-field">
                        <span>กว้าง (มม.)</span>
                        <input
                          type="number"
                          min={6}
                          max={70}
                          step={0.5}
                          value={paperSettings.column_settings[columnKey].width_mm}
                          onChange={(event) => updatePaperColumnSetting(columnKey, 'width_mm', Number(event.target.value) || defaultReportColumnSettings[columnKey].width_mm)}
                        />
                      </label>
                      <label className="field report-column-setting-field">
                        <span>สูงต่อแถว (มม.)</span>
                        <input
                          type="number"
                          min={6}
                          max={20}
                          step={0.5}
                          value={paperSettings.column_settings[columnKey].height_mm}
                          onChange={(event) => updatePaperColumnSetting(columnKey, 'height_mm', Number(event.target.value) || defaultReportColumnSettings[columnKey].height_mm)}
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="actions compact-actions">
                <button type="button" className="btn btn-primary" onClick={() => void handleSavePaperSettings()} disabled={savingPaperSettings}>
                  {savingPaperSettings ? 'กำลังบันทึกค่าหน้ากระดาษ...' : 'บันทึกค่าหน้ากระดาษ'}
                </button>
              </div>
            </div>
          </div>

          {configuredWorkingDates.length === 0 && <div className="notice">ปีนี้ยังไม่มีวันทำการกลุ่มที่ตั้งไว้ จึงยังออกรายงานไม่ได้</div>}

          {reportData && (
            <div className="actions report-export-actions">
              <button type="button" className="btn btn-primary" disabled={savingReportPdf} onClick={() => void handleSaveReportPdf()}>
                {savingReportPdf ? 'กำลังบันทึก PDF...' : 'บันทึก PDF'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={handlePrintReport}>
                พิมพ์ PDF
              </button>
            </div>
          )}
        </section>

        {loadingReport ? (
          <section className="card"><p className="muted">กำลังสร้างรายงาน...</p></section>
        ) : reportData ? (
          <section className="card report-preview-card">
            <div className="topbar report-preview-topbar">
              <div>
                <h3 className="section-title">ตัวอย่างรายงาน</h3>
                <div className="muted">ตรวจสอบหน้ารายงานก่อนบันทึกหรือพิมพ์ได้ทันทีบนหน้าเว็บ</div>
              </div>
              <div className="stats-row">
                <div className="stat-chip">{reportTypeLabels[reportData.report_type]}</div>
                <div className="stat-chip">วันทำการ {formatDisplayDate(reportData.paid_date)}</div>
                <div className="stat-chip">รายการ {reportData.rows.length} แถว</div>
              </div>
            </div>
            {renderReportPreview(reportData)}
          </section>
        ) : (
          <section className="card"><div className="notice">เลือกประเภทรายงานและวันทำการกลุ่ม แล้วกดแสดงรายงานเพื่อดูตัวอย่าง</div></section>
        )}
      </div>
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

    if (activeSection === 'reports') {
      return renderReportsSection();
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
        <nav className="devmanager-subnav" aria-label="เมนู DevManager">
          {sectionItems.map((item) => (
            <Link
              key={item.key}
              to={item.path}
              className={`devmanager-tab ${activeSection === item.key ? 'devmanager-tab-active' : ''}`}
            >
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </Link>
          ))}
        </nav>

        {renderSectionContent()}
      </div>
    </div>
  );
}
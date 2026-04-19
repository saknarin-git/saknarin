import { useEffect, useRef, useState } from 'react';
import { createLoanRecord, deleteLoanRecord, fetchLoans, updateLoanRecord } from '../api/adminApi';
import { fetchLoanPaymentWorkspace, fetchLoanWorkspaceConfig, saveLoanPayment, updateLoanWorkspaceConfig } from '../api/loanWorkspaceApi';
import { AppMenu } from '../components/AppMenu';
import { InputField } from '../components/InputField';
import { useAuth } from '../contexts/AuthContext';
import type {
  LoanPaymentMode,
  LoanPaymentPreview,
  LoanPaymentWorkspaceData,
  LoanRegistryRecord,
  LoanWorkingDateEntry,
  LoanTypeRecord,
  PaginationMeta,
  TitlePrefix,
} from '../types';

const titleOptions: TitlePrefix[] = ['นาย', 'นาง', 'นางสาว', 'เด็กชาย', 'เด็กหญิง'];
const monthLabels = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

type LoanSection = 'payment' | 'registry' | 'settings';

const loanSectionItems: Array<{ key: LoanSection; label: string; description: string }> = [
  { key: 'payment', label: 'รับชำระเงิน', description: 'ทำรายการรับชำระแบบใช้คีย์บอร์ดเป็นหลัก' },
  { key: 'registry', label: 'ทะเบียนสัญญา', description: 'ดู แก้ไข และเพิ่มข้อมูลสัญญาเงินกู้' },
  { key: 'settings', label: 'ตั้งค่าดอกเบี้ยและวันทำการ', description: 'กำหนดประเภทเงินกู้ อัตราดอกเบี้ย และวันทำการกลุ่ม' },
];

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function parseMoneyInput(value: string) {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) {
    return 0;
  }

  const numeric = Number(normalized);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error('จำนวนเงินที่กรอกไม่ถูกต้อง');
  }

  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}

function buildWorkingDates(year: number): LoanWorkingDateEntry[] {
  return monthLabels.map((_, index) => ({
    month: index + 1,
    date: null,
  }));
}

function formatWorkingDate(dateText: string | null) {
  if (!dateText) {
    return 'ยังไม่ได้กำหนด';
  }

  const [year, month, day] = dateText.split('-');
  return `${day}/${month}/${year}`;
}

function buildDraftLoanTypeName(existingLoanTypes: LoanTypeRecord[]) {
  let sequence = existingLoanTypes.length + 1;
  while (existingLoanTypes.some((item) => item.name.trim() === `ประเภทเงินกู้ ${sequence}`)) {
    sequence += 1;
  }

  return `ประเภทเงินกู้ ${sequence}`;
}

function buildPaymentNote(paymentMode: LoanPaymentMode, principalPaid: number, interestInstallmentsPaid: number, contractNo: string) {
  if (paymentMode === 'settlement') {
    return `กลบหนี้สัญญา ${contractNo}`;
  }

  if (interestInstallmentsPaid > 1) {
    return `ชำระดอกเบี้ย ${interestInstallmentsPaid} งวด`;
  }

  if (principalPaid > 0) {
    return 'ชำระต้นพร้อมดอกเบี้ยประจำงวด';
  }

  return 'ชำระเฉพาะดอกเบี้ยประจำงวด';
}

type LoanFormState = {
  contract_no: string;
  member_no: string;
  title: TitlePrefix;
  first_name: string;
  last_name: string;
  loan_type_id: string;
  loan_amount: string;
  outstanding_amount: string;
  status: string;
  contract_date: string;
  guarantor_1: string;
  guarantor_2: string;
};

const defaultForm: LoanFormState = {
  contract_no: '',
  member_no: '',
  title: 'นาย',
  first_name: '',
  last_name: '',
  loan_type_id: '',
  loan_amount: '',
  outstanding_amount: '',
  status: '',
  contract_date: '',
  guarantor_1: '',
  guarantor_2: '',
};

export function LoanManagementPage() {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? '';
  const memberInputRef = useRef<HTMLInputElement | null>(null);
  const overdueInputRef = useRef<HTMLInputElement | null>(null);
  const principalInputRef = useRef<HTMLInputElement | null>(null);
  const previewSaveButtonRef = useRef<HTMLButtonElement | null>(null);
  const [activeSection, setActiveSection] = useState<LoanSection>('payment');
  const [loans, setLoans] = useState<LoanRegistryRecord[]>([]);
  const [loanTypes, setLoanTypes] = useState<LoanTypeRecord[]>([]);
  const [workingCalendarYear, setWorkingCalendarYear] = useState(new Date().getFullYear());
  const [workingDates, setWorkingDates] = useState<LoanWorkingDateEntry[]>(() => buildWorkingDates(new Date().getFullYear()));
  const [pagination, setPagination] = useState<PaginationMeta>({ total: 0, page: 1, page_size: 20, total_pages: 1 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingPaymentWorkspace, setLoadingPaymentWorkspace] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [paymentMessage, setPaymentMessage] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [selectedContractNo, setSelectedContractNo] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<LoanFormState>(defaultForm);
  const [paymentMode, setPaymentMode] = useState<LoanPaymentMode>('normal');
  const [memberLookup, setMemberLookup] = useState('');
  const [paymentWorkspace, setPaymentWorkspace] = useState<LoanPaymentWorkspaceData | null>(null);
  const [paymentDate, setPaymentDate] = useState(todayString());
  const [principalPaidInput, setPrincipalPaidInput] = useState('');
  const [interestInstallmentsInput, setInterestInstallmentsInput] = useState('1');
  const [interestInstallmentsPaid, setInterestInstallmentsPaid] = useState(1);
  const [showOverdueModal, setShowOverdueModal] = useState(false);
  const [preview, setPreview] = useState<LoanPaymentPreview | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  useEffect(() => {
    if (!session) {
      return;
    }

    void loadLoans();
    void loadConfig();
  }, [session]);

  useEffect(() => {
    if (activeSection === 'payment' && !showOverdueModal && !showPreviewModal && !paymentWorkspace) {
      memberInputRef.current?.focus();
    }
  }, [activeSection, paymentWorkspace, showOverdueModal, showPreviewModal]);

  useEffect(() => {
    if (showOverdueModal) {
      overdueInputRef.current?.focus();
      overdueInputRef.current?.select();
    }
  }, [showOverdueModal]);

  useEffect(() => {
    if (showPreviewModal) {
      previewSaveButtonRef.current?.focus();
    }
  }, [showPreviewModal]);

  if (!session) {
    return null;
  }

  const selectedPaymentContract = paymentWorkspace?.selected_contract ?? null;
  const activeLoanTypes = loanTypes.filter((item) => item.active);

  async function loadConfig() {
    setLoadingConfig(true);

    try {
      const response = await fetchLoanWorkspaceConfig(accessToken);
      setLoanTypes(response.data.loan_types);
      setWorkingCalendarYear(response.data.working_calendar_year);
      setWorkingDates(response.data.working_dates);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'โหลดการตั้งค่าสินเชื่อไม่สำเร็จ');
    } finally {
      setLoadingConfig(false);
    }
  }

  async function loadLoans(nextSearch = search, nextPage = pagination.page, nextStatusFilter = statusFilter) {
    setLoading(true);
    setErrorMessage('');

    try {
      const response = await fetchLoans(accessToken, {
        search: nextSearch,
        page: nextPage,
        pageSize: pagination.page_size,
        statusFilter: nextStatusFilter,
      });
      setLoans(response.data.loans);
      setPagination(response.data.pagination);

      if (response.data.loans.length === 0) {
        setSelectedContractNo('');
        setForm(defaultForm);
        setIsCreating(false);
        return;
      }

      if (isCreating) {
        return;
      }

      const activeLoan = response.data.loans.find((item) => item.contract_no === selectedContractNo) ?? response.data.loans[0];
      selectLoan(activeLoan);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'โหลดข้อมูลสินเชื่อไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  function selectLoan(loan: LoanRegistryRecord) {
    setIsCreating(false);
    setSelectedContractNo(loan.contract_no);
    setForm({
      contract_no: loan.contract_no,
      member_no: loan.member_no,
      title: loan.title,
      first_name: loan.first_name,
      last_name: loan.last_name,
      loan_type_id: loan.loan_type_id ?? '',
      loan_amount: String(loan.loan_amount),
      outstanding_amount: String(loan.outstanding_amount),
      status: loan.status ?? '',
      contract_date: loan.contract_date ?? '',
      guarantor_1: loan.guarantor_1,
      guarantor_2: loan.guarantor_2 ?? '',
    });
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setErrorMessage('');

    try {
      const payload = {
        contract_no: form.contract_no,
        member_no: form.member_no,
        title: form.title,
        first_name: form.first_name,
        last_name: form.last_name,
        loan_type_id: form.loan_type_id || null,
        loan_amount: Number(form.loan_amount),
        outstanding_amount: Number(form.outstanding_amount),
        status: form.status,
        contract_date: form.contract_date || null,
        guarantor_1: form.guarantor_1,
        guarantor_2: form.guarantor_2 || null,
      };
      const response = isCreating
        ? await createLoanRecord(accessToken, payload)
        : await updateLoanRecord(accessToken, payload);
      setMessage(response.message);
      await loadLoans(search, pagination.page, statusFilter);
      setIsCreating(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'บันทึกข้อมูลสินเชื่อไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(contractNo: string) {
    const confirmed = window.confirm(`ยืนยันลบข้อมูลสินเชื่อเลขที่สัญญา ${contractNo}`);
    if (!confirmed) {
      return;
    }

    setDeleting(contractNo);
    setMessage('');
    setErrorMessage('');

    try {
      const response = await deleteLoanRecord(accessToken, contractNo);
      setMessage(response.message);
      await loadLoans(search, pagination.page, statusFilter);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'ลบข้อมูลสินเชื่อไม่สำเร็จ');
    } finally {
      setDeleting(null);
    }
  }

  function startCreateMode() {
    setIsCreating(true);
    setSelectedContractNo('');
    setForm({
      ...defaultForm,
      loan_type_id: activeLoanTypes[0]?.id ?? '',
    });
    setMessage('');
    setErrorMessage('');
  }

  function handleSearch() {
    void loadLoans(search, 1, statusFilter);
  }

  async function handleLookupMember(nextMemberNo = memberLookup, nextMode = paymentMode) {
    setLoadingPaymentWorkspace(true);
    setPaymentError('');
    setPaymentMessage('');
    setShowPreviewModal(false);
    setPreview(null);

    try {
      const response = await fetchLoanPaymentWorkspace(accessToken, nextMemberNo, nextMode, paymentDate);
      setPaymentWorkspace(response.data);
      setWorkingCalendarYear(response.data.working_calendar_year);
      setWorkingDates(response.data.working_dates);
      setMemberLookup(nextMemberNo);
      const nextPrincipalValue = nextMode === 'settlement'
        ? String(response.data.selected_contract.outstanding_amount)
        : '';
      setPrincipalPaidInput(nextPrincipalValue);

      if (response.data.selected_contract.overdue_interest_installments > 0) {
        setInterestInstallmentsInput(String(response.data.selected_contract.due_installments_count));
        setInterestInstallmentsPaid(response.data.selected_contract.due_installments_count);
        setShowOverdueModal(true);
      } else {
        const defaultInstallments = response.data.selected_contract.due_installments_count > 0 ? 1 : 0;
        setInterestInstallmentsInput(String(defaultInstallments));
        setInterestInstallmentsPaid(defaultInstallments);
        requestAnimationFrame(() => {
          principalInputRef.current?.focus();
          principalInputRef.current?.select();
        });
      }
    } catch (error) {
      setPaymentWorkspace(null);
      setPaymentError(error instanceof Error ? error.message : 'ค้นหาข้อมูลรับชำระไม่สำเร็จ');
    } finally {
      setLoadingPaymentWorkspace(false);
    }
  }

  function handlePaymentModeChange(nextMode: LoanPaymentMode) {
    setPaymentMode(nextMode);
    setPaymentWorkspace(null);
    setShowPreviewModal(false);
    setShowOverdueModal(false);
    setPreview(null);
    setPrincipalPaidInput('');
    setInterestInstallmentsPaid(1);
    setInterestInstallmentsInput('1');
    setPaymentMessage('');
    setPaymentError('');
    requestAnimationFrame(() => memberInputRef.current?.focus());
  }

  function handleConfirmOverdueInstallments(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedPaymentContract) {
      return;
    }

    const numericValue = Number(interestInstallmentsInput);
    if (!Number.isInteger(numericValue) || numericValue < 0) {
      setPaymentError('จำนวนงวดดอกที่ชำระต้องเป็นเลขจำนวนเต็มตั้งแต่ 0 ขึ้นไป');
      return;
    }

    if (numericValue > selectedPaymentContract.due_installments_count) {
      setPaymentError('จำนวนงวดดอกที่ชำระเกินกว่าที่ถึงกำหนด');
      return;
    }

    setInterestInstallmentsPaid(numericValue);
    setShowOverdueModal(false);
    requestAnimationFrame(() => {
      principalInputRef.current?.focus();
      principalInputRef.current?.select();
    });
  }

  function openPreview(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (!selectedPaymentContract) {
      setPaymentError('กรุณาค้นหาเลขสมาชิกก่อนทำรายการ');
      return;
    }

    try {
      const parsedPrincipal = paymentMode === 'settlement' && principalPaidInput.trim() === ''
        ? selectedPaymentContract.outstanding_amount
        : parseMoneyInput(principalPaidInput);

      if (parsedPrincipal > selectedPaymentContract.outstanding_amount) {
        throw new Error('จำนวนเงินต้นที่ชำระมากกว่ายอดหนี้คงเหลือ');
      }

      const effectiveInstallments = selectedPaymentContract.due_installments_count > 0 ? interestInstallmentsPaid : 0;
      if (parsedPrincipal === 0 && effectiveInstallments === 0) {
        throw new Error('ยังไม่มีทั้งเงินต้นและดอกเบี้ยที่ต้องชำระในรายการนี้');
      }

      const interestPaid = Math.round((selectedPaymentContract.current_interest_due * effectiveInstallments + Number.EPSILON) * 100) / 100;
      const remainingBalance = Math.round((selectedPaymentContract.outstanding_amount - parsedPrincipal + Number.EPSILON) * 100) / 100;
      const nextPreview: LoanPaymentPreview = {
        payment_mode: paymentMode,
        paid_date: paymentDate,
        contract_no: selectedPaymentContract.contract_no,
        member_no: selectedPaymentContract.member_no,
        member_name: `${selectedPaymentContract.title}${selectedPaymentContract.first_name} ${selectedPaymentContract.last_name}`,
        principal_paid: parsedPrincipal,
        interest_paid: interestPaid,
        remaining_balance: remainingBalance,
        interest_installments_paid: effectiveInstallments,
        note: buildPaymentNote(paymentMode, parsedPrincipal, effectiveInstallments, selectedPaymentContract.contract_no),
      };

      setPreview(nextPreview);
      setShowPreviewModal(true);
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'เตรียมข้อมูลสมุดคู่ฝากไม่สำเร็จ');
    }
  }

  async function handleSavePayment() {
    if (!preview) {
      return;
    }

    setSavingPayment(true);
    setPaymentError('');

    try {
      const response = await saveLoanPayment(accessToken, {
        member_no: preview.member_no,
        contract_no: preview.contract_no,
        payment_mode: preview.payment_mode,
        principal_paid: preview.principal_paid,
        interest_installments_paid: preview.interest_installments_paid,
        paid_date: preview.paid_date,
      });

      setPaymentMessage(response.message);
      setShowPreviewModal(false);
      setPreview(null);
      setPaymentWorkspace(null);
      setMemberLookup('');
      setPrincipalPaidInput('');
      setInterestInstallmentsInput('1');
      setInterestInstallmentsPaid(1);
      setPaymentDate(todayString());
      await loadLoans(search, pagination.page, statusFilter);
      requestAnimationFrame(() => memberInputRef.current?.focus());
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'บันทึกรายการรับชำระไม่สำเร็จ');
    } finally {
      setSavingPayment(false);
    }
  }

  function handleAddLoanType() {
    const draftName = buildDraftLoanTypeName(loanTypes);
    setLoanTypes((current) => ([
      ...current,
      {
        id: crypto.randomUUID(),
        name: draftName,
        annual_interest_rate: 12,
        active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]));
  }

  function updateLoanTypeField(id: string, field: 'name' | 'annual_interest_rate' | 'active', value: string | number | boolean) {
    setLoanTypes((current) => current.map((item) => (
      item.id === id
        ? {
            ...item,
            [field]: value,
          }
        : item
    )));
  }

  function updateWorkingDate(month: number, nextDate: string) {
    setWorkingDates((current) => current.map((item) => (
      item.month === month
        ? {
            ...item,
            date: nextDate || null,
          }
        : item
    )));
  }

  async function handleSaveConfig() {
    setSavingConfig(true);
    setMessage('');
    setErrorMessage('');

    try {
      const response = await updateLoanWorkspaceConfig(accessToken, {
        loan_types: loanTypes.map((item) => ({
          id: item.id,
          name: item.name,
          annual_interest_rate: Number(item.annual_interest_rate),
          active: item.active,
        })),
        working_calendar_year: workingCalendarYear,
        working_dates: workingDates,
      });

      setLoanTypes(response.data.loan_types);
      setWorkingCalendarYear(response.data.working_calendar_year);
      setWorkingDates(response.data.working_dates);
      setMessage(response.message);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'บันทึกการตั้งค่าสินเชื่อไม่สำเร็จ');
    } finally {
      setSavingConfig(false);
    }
  }

  function renderPaymentSection() {
    return (
      <div className="loan-workspace-shell">
        <section className="card loan-payment-focus-card">
          <div className="loan-payment-topbar">
            <div>
              <div className="eyebrow">Keyboard First</div>
              <h3 className="section-title">รับชำระเงิน</h3>
              <div className="muted">กรอกเลขสมาชิกแล้วกด Enter ระบบจะเลือกสัญญาที่ยอดหนี้คงเหลือสูงที่สุดขึ้นมาก่อนเสมอ</div>
            </div>
            <div className="loan-mode-toggle" role="tablist" aria-label="เลือกโหมดรับชำระ">
              <button type="button" className={`loan-mode-button ${paymentMode === 'normal' ? 'loan-mode-button-active' : ''}`} onClick={() => handlePaymentModeChange('normal')}>
                รับชำระปกติ
              </button>
              <button type="button" className={`loan-mode-button ${paymentMode === 'settlement' ? 'loan-mode-button-active' : ''}`} onClick={() => handlePaymentModeChange('settlement')}>
                กลบหนี้
              </button>
            </div>
          </div>

          <form className="loan-payment-form" onSubmit={(event) => { event.preventDefault(); void handleLookupMember(); }}>
            <label className="field loan-payment-field">
              <span>เลขสมาชิก</span>
              <input
                ref={memberInputRef}
                value={memberLookup}
                onChange={(event) => setMemberLookup(event.target.value)}
                placeholder="กรอกเลขสมาชิกแล้วกด Enter"
                autoComplete="off"
              />
            </label>
            <label className="field loan-payment-field">
              <span>วันที่รับชำระ</span>
              <input value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} type="date" />
            </label>
            <div className="actions compact-actions">
              <button type="submit" className="btn btn-primary" disabled={loadingPaymentWorkspace}>
                {loadingPaymentWorkspace ? 'กำลังค้นหา...' : 'ค้นหาเลขสมาชิก'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setMemberLookup('');
                  setPaymentWorkspace(null);
                  setPaymentError('');
                  setPaymentMessage('');
                  setPrincipalPaidInput('');
                  setPreview(null);
                  requestAnimationFrame(() => memberInputRef.current?.focus());
                }}
              >
                ล้างหน้าจอ
              </button>
            </div>
          </form>

          {paymentMessage && <div className="notice">{paymentMessage}</div>}
          {paymentError && <div className="alert-error">{paymentError}</div>}

          {selectedPaymentContract && (
            <div className="loan-payment-summary-grid">
              <div className="loan-payment-summary-card">
                <span>สัญญาที่เลือกอัตโนมัติ</span>
                <strong>{selectedPaymentContract.contract_no}</strong>
                <div className="muted">{selectedPaymentContract.title}{selectedPaymentContract.first_name} {selectedPaymentContract.last_name}</div>
              </div>
              <div className="loan-payment-summary-card">
                <span>ประเภทเงินกู้</span>
                <strong>{selectedPaymentContract.loan_type_name}</strong>
                <div className="muted">ดอกเบี้ยรายปี {formatCurrency(selectedPaymentContract.annual_interest_rate)}%</div>
              </div>
              <div className="loan-payment-summary-card">
                <span>ดอกเบี้ยงวดปัจจุบัน</span>
                <strong>{formatCurrency(selectedPaymentContract.current_interest_due)}</strong>
                <div className="muted">ดอกเบี้ย 1 งวด คำนวณจากยอดคงเหลือและอัตรารายปีของประเภทเงินกู้</div>
              </div>
              <div className="loan-payment-summary-card">
                <span>ยอดหนี้คงเหลือ</span>
                <strong>{formatCurrency(selectedPaymentContract.outstanding_amount)}</strong>
                <div className="muted">ห้ามกรอกชำระต้นเกินยอดนี้</div>
              </div>
              <div className="loan-payment-summary-card">
                <span>งวดดอกที่ถึงกำหนด</span>
                <strong>{selectedPaymentContract.due_installments_count} งวด</strong>
                <div className="muted">ค้างจากเดือนก่อน {selectedPaymentContract.overdue_interest_installments} งวด</div>
              </div>
            </div>
          )}

          {selectedPaymentContract && (
            <form className="loan-principal-form" onSubmit={openPreview}>
              <label className="field loan-payment-field loan-payment-field-wide">
                <span>ชำระต้น</span>
                <input
                  ref={principalInputRef}
                  value={principalPaidInput}
                  onChange={(event) => setPrincipalPaidInput(event.target.value)}
                  placeholder={paymentMode === 'settlement' ? 'ถ้าเว้นว่างจะใช้ยอดหนี้คงเหลือทั้งหมด' : 'ถ้าเว้นว่างจะถือว่าชำระเฉพาะดอกเบี้ย'}
                  inputMode="decimal"
                  autoComplete="off"
                />
              </label>
              <div className="loan-payment-inline-metrics">
                <div className="loan-inline-chip">ดอกเบี้ยที่ต้องชำระ {formatCurrency(selectedPaymentContract.current_interest_due * interestInstallmentsPaid)} บาท</div>
                <div className="loan-inline-chip">เลือกชำระดอก {interestInstallmentsPaid} งวด</div>
                <div className="loan-inline-chip">วันทำการถัดไป {formatWorkingDate(selectedPaymentContract.next_working_date)}</div>
              </div>
              <div className="actions compact-actions">
                <button type="submit" className="btn btn-primary">เปิดสมุดคู่ฝาก</button>
              </div>
            </form>
          )}
        </section>

        <section className="card">
          <h3 className="section-title">สัญญาของสมาชิก</h3>
          {!paymentWorkspace ? (
            <p className="muted">หลังจากค้นหาเลขสมาชิก ระบบจะแสดงสัญญาที่เกี่ยวข้อง และเลือกสัญญาที่ยอดหนี้คงเหลือสูงที่สุดขึ้นมาทำรายการให้ก่อน</p>
          ) : (
            <div className="list">
              {paymentWorkspace.contracts.map((contract, index) => (
                <div key={contract.contract_no} className={`list-item ${index === 0 ? 'loan-contract-primary' : ''}`}>
                  <div className="topbar">
                    <div>
                      <strong>{contract.contract_no}</strong>
                      <div className="muted">{contract.loan_type_name} | ดอกเบี้ยรายปี {formatCurrency(contract.annual_interest_rate)}%</div>
                    </div>
                    {index === 0 && <span className="badge badge-approved">สัญญาที่ใช้ทำรายการก่อน</span>}
                  </div>
                  <div className="loan-contract-meta">
                    <div>ยอดคงเหลือ {formatCurrency(contract.outstanding_amount)} บาท</div>
                    <div>ค้างจากเดือนก่อน {contract.overdue_interest_installments} งวด</div>
                    <div>ถึงกำหนดทั้งหมด {contract.due_installments_count} งวด</div>
                    <div>ดอกเบี้ย 1 งวด {formatCurrency(contract.current_interest_due)} บาท</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  function renderRegistrySection() {
    return (
      <div className="grid-two registry-layout">
        <section className="card">
          <div className="section-toolbar">
            <InputField label="ค้นหาเลขที่สัญญา เลขสมาชิก หรือชื่อ" value={search} onChange={(event) => setSearch(event.target.value)} />
            <InputField label="กรองสถานะสินเชื่อ" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} placeholder="เช่น ปกติ, ปิดบัญชี" />
            <div className="actions compact-actions">
              <button type="button" className="btn btn-secondary" onClick={handleSearch}>ค้นหา</button>
              <button type="button" className="btn btn-secondary" onClick={() => { setSearch(''); setStatusFilter(''); void loadLoans('', 1, ''); }}>ล้างคำค้น</button>
              <button type="button" className="btn btn-primary" onClick={startCreateMode}>สร้างสินเชื่อใหม่</button>
            </div>
          </div>

          {message && <div className="notice">{message}</div>}
          {errorMessage && <div className="alert-error">{errorMessage}</div>}

          {loading ? (
            <p className="muted">กำลังโหลดข้อมูลสินเชื่อ...</p>
          ) : (
            <div className="list">
              {loans.length === 0 && <p className="muted">ไม่พบข้อมูลสินเชื่อ</p>}
              {loans.map((loan) => (
                <button
                  key={loan.contract_no}
                  type="button"
                  className={`registry-card ${selectedContractNo === loan.contract_no ? 'registry-card-active' : ''}`}
                  onClick={() => selectLoan(loan)}
                >
                  <div className="topbar registry-card-header">
                    <div>
                      <strong>{loan.contract_no}</strong>
                      <div>สมาชิก {loan.member_no}</div>
                    </div>
                    <span className="badge badge-approved">คงค้าง {formatCurrency(loan.outstanding_amount)}</span>
                  </div>
                  <div>{loan.title}{loan.first_name} {loan.last_name}</div>
                  <div className="registry-meta">ประเภท {loanTypes.find((item) => item.id === loan.loan_type_id)?.name ?? 'ไม่ระบุ'} | สถานะ {loan.status || '-'}</div>
                </button>
              ))}
            </div>
          )}
          <div className="pagination-bar">
            <div className="muted">ทั้งหมด {pagination.total} รายการ | หน้า {pagination.page} / {pagination.total_pages}</div>
            <div className="actions compact-actions">
              <button type="button" className="btn btn-secondary" disabled={pagination.page <= 1 || loading} onClick={() => void loadLoans(search, pagination.page - 1, statusFilter)}>ก่อนหน้า</button>
              <button type="button" className="btn btn-secondary" disabled={pagination.page >= pagination.total_pages || loading} onClick={() => void loadLoans(search, pagination.page + 1, statusFilter)}>ถัดไป</button>
            </div>
          </div>
        </section>

        <section className="card">
          <h3 className="section-title">{isCreating ? 'สร้างข้อมูลสินเชื่อใหม่' : 'แก้ไขข้อมูลสินเชื่อ'}</h3>
          {!isCreating && !selectedContractNo ? (
            <p className="muted">เลือกสัญญาเงินกู้จากรายการด้านซ้ายเพื่อแก้ไขข้อมูล หรือกดสร้างสินเชื่อใหม่</p>
          ) : (
            <form onSubmit={handleSave}>
              <InputField label="เลขที่สัญญา" value={form.contract_no} onChange={(event) => setForm((current) => ({ ...current, contract_no: event.target.value }))} readOnly={!isCreating} required />
              <InputField label="เลขที่สมาชิก" value={form.member_no} onChange={(event) => setForm((current) => ({ ...current, member_no: event.target.value }))} required />
              <label className="field">
                <span>คำนำหน้าชื่อ</span>
                <select value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value as TitlePrefix }))}>
                  {titleOptions.map((title) => <option key={title} value={title}>{title}</option>)}
                </select>
              </label>
              <InputField label="ชื่อ" value={form.first_name} onChange={(event) => setForm((current) => ({ ...current, first_name: event.target.value }))} required />
              <InputField label="สกุล" value={form.last_name} onChange={(event) => setForm((current) => ({ ...current, last_name: event.target.value }))} required />
              <label className="field">
                <span>ประเภทเงินกู้</span>
                <select value={form.loan_type_id} onChange={(event) => setForm((current) => ({ ...current, loan_type_id: event.target.value }))}>
                  <option value="">ไม่ระบุประเภท</option>
                  {loanTypes.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}{item.active ? '' : ' (ปิดใช้งาน)'}</option>
                  ))}
                </select>
              </label>
              <div className="form-grid">
                <InputField label="ยอดเงินกู้" value={form.loan_amount} onChange={(event) => setForm((current) => ({ ...current, loan_amount: event.target.value }))} required />
                <InputField label="ยอดคงค้าง" value={form.outstanding_amount} onChange={(event) => setForm((current) => ({ ...current, outstanding_amount: event.target.value }))} required />
              </div>
              <InputField label="สถานะ" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} />
              <InputField label="วันที่สร้างสัญญา" value={form.contract_date} onChange={(event) => setForm((current) => ({ ...current, contract_date: event.target.value }))} placeholder="YYYY-MM-DD หรือ DD/MM/YYYY" />
              <InputField label="ผู้ค้ำประกันคนที่ 1" value={form.guarantor_1} onChange={(event) => setForm((current) => ({ ...current, guarantor_1: event.target.value }))} required />
              <InputField label="ผู้ค้ำประกันคนที่ 2" value={form.guarantor_2} onChange={(event) => setForm((current) => ({ ...current, guarantor_2: event.target.value }))} />
              <div className="actions">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'กำลังบันทึก...' : isCreating ? 'สร้างข้อมูลสินเชื่อ' : 'บันทึกข้อมูลสินเชื่อ'}
                </button>
                {isCreating ? (
                  <button type="button" className="btn btn-secondary" onClick={() => { setIsCreating(false); if (loans[0]) selectLoan(loans[0]); }}>
                    ยกเลิกการสร้าง
                  </button>
                ) : (
                  <button type="button" className="btn btn-danger" disabled={deleting === selectedContractNo} onClick={() => void handleDelete(selectedContractNo)}>
                    {deleting === selectedContractNo ? 'กำลังลบ...' : 'ลบสินเชื่อ'}
                  </button>
                )}
              </div>
            </form>
          )}
        </section>
      </div>
    );
  }

  function renderSettingsSection() {
    return (
      <div className="grid-two">
        <section className="card">
          <div className="topbar loan-settings-topbar">
            <div>
              <h3 className="section-title">ประเภทเงินกู้และอัตราดอกเบี้ย</h3>
              <div className="muted">กำหนดอัตราดอกเบี้ยรายปีของแต่ละประเภท ระบบจะแปลงเป็นดอกเบี้ย 1 งวดโดยหาร 12 อัตโนมัติ</div>
            </div>
            <div className="actions compact-actions loan-settings-actions">
              <button type="button" className="btn btn-secondary" onClick={handleAddLoanType}>เพิ่มประเภทเงินกู้</button>
              <button type="button" className="btn btn-primary" disabled={savingConfig} onClick={() => void handleSaveConfig()}>
                {savingConfig ? 'กำลังบันทึก...' : 'บันทึกประเภทเงินกู้'}
              </button>
            </div>
          </div>
          {message && <div className="notice">{message}</div>}
          {errorMessage && <div className="alert-error">{errorMessage}</div>}
          {loadingConfig ? (
            <p className="muted">กำลังโหลดการตั้งค่าสินเชื่อ...</p>
          ) : (
            <div className="list">
              {loanTypes.map((loanType) => (
                <div key={loanType.id} className="list-item loan-type-editor">
                  <InputField label="ชื่อประเภทเงินกู้" value={loanType.name} onChange={(event) => updateLoanTypeField(loanType.id, 'name', event.target.value)} />
                  <InputField label="ดอกเบี้ยรายปี (%)" value={String(loanType.annual_interest_rate)} onChange={(event) => updateLoanTypeField(loanType.id, 'annual_interest_rate', Number(event.target.value))} />
                  <label className="loan-type-active-toggle">
                    <input type="checkbox" checked={loanType.active} onChange={(event) => updateLoanTypeField(loanType.id, 'active', event.target.checked)} />
                    <span>เปิดใช้งานประเภทนี้</span>
                  </label>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <h3 className="section-title">วันทำการกลุ่ม</h3>
          <div className="muted">กำหนดวันทำการจริงของแต่ละเดือนในปี {workingCalendarYear} เพื่อใช้เป็นงวดดอกเบี้ยของทั้งกลุ่ม</div>
          <div className="working-day-grid">
            {workingDates.map((item) => (
              <label key={item.month} className={`working-day-card ${item.date ? 'working-day-card-active' : ''}`}>
                <span>{monthLabels[item.month - 1]}</span>
                <input className="working-day-date-input" type="date" value={item.date ?? ''} onChange={(event) => updateWorkingDate(item.month, event.target.value)} />
              </label>
            ))}
          </div>
          {message && <div className="notice">{message}</div>}
          {errorMessage && <div className="alert-error">{errorMessage}</div>}
          <div className="actions">
            <button type="button" className="btn btn-primary" disabled={savingConfig} onClick={() => void handleSaveConfig()}>
              {savingConfig ? 'กำลังบันทึก...' : 'บันทึกวันทำการกลุ่ม'}
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <AppMenu title="สินเชื่อ" />

      <div className="hero">
        <h1>ศูนย์งานสินเชื่อ</h1>
        <p>ทำรายการรับชำระเงิน จัดการทะเบียนสัญญา และกำหนดดอกเบี้ยเงินกู้รายประเภทพร้อมวันทำการของกลุ่มในหน้าเดียว</p>
      </div>

      <div className="devmanager-subnav loan-section-nav">
        {loanSectionItems.map((item) => (
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

      {activeSection === 'payment' && renderPaymentSection()}
      {activeSection === 'registry' && renderRegistrySection()}
      {activeSection === 'settings' && renderSettingsSection()}

      {showOverdueModal && selectedPaymentContract && (
        <div className="modal-overlay" role="presentation">
          <div className="modal-card loan-modal-card">
            <h3 className="section-title">แจ้งเตือนดอกเบี้ยค้างชำระ</h3>
            <div className="muted">สัญญา {selectedPaymentContract.contract_no} ค้างจากเดือนก่อน {selectedPaymentContract.overdue_interest_installments} งวด และถึงกำหนดรวม {selectedPaymentContract.due_installments_count} งวด กรอกจำนวนงวดที่ต้องการชำระแล้วกด Enter</div>
            <form onSubmit={handleConfirmOverdueInstallments}>
              <label className="field">
                <span>จำนวนงวดดอกที่ต้องการชำระ</span>
                <input
                  ref={overdueInputRef}
                  value={interestInstallmentsInput}
                  onChange={(event) => setInterestInstallmentsInput(event.target.value)}
                  inputMode="numeric"
                />
              </label>
              <div className="actions">
                <button type="submit" className="btn btn-primary">ยืนยันจำนวนงวดค้าง</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPreviewModal && preview && (
        <div className="modal-overlay" role="presentation">
          <div className="modal-card passbook-modal-card">
            <h3 className="section-title">สมุดคู่ฝาก</h3>
            <div className="passbook-preview-grid">
              <div className="passbook-row"><span>วัน/เดือน/ปี</span><strong>{preview.paid_date}</strong></div>
              <div className="passbook-row"><span>เลขสมาชิก</span><strong>{preview.member_no}</strong></div>
              <div className="passbook-row"><span>สมาชิก</span><strong>{preview.member_name}</strong></div>
              <div className="passbook-row"><span>เลขที่สัญญา</span><strong>{preview.contract_no}</strong></div>
              <div className="passbook-row"><span>ชำระดอกกี่งวด</span><strong>{preview.interest_installments_paid}</strong></div>
              <div className="passbook-row"><span>ชำระต้น(บาท)</span><strong>{formatCurrency(preview.principal_paid)}</strong></div>
              <div className="passbook-row"><span>ชำระดอกเบี้ย(บาท)</span><strong>{formatCurrency(preview.interest_paid)}</strong></div>
              <div className="passbook-row"><span>หนี้คงเหลือ</span><strong>{formatCurrency(preview.remaining_balance)}</strong></div>
              <div className="passbook-row passbook-row-wide"><span>หมายเหตุ</span><strong>{preview.note}</strong></div>
            </div>
            <div className="actions">
              <button type="button" className="btn btn-secondary" onClick={() => { setShowPreviewModal(false); requestAnimationFrame(() => principalInputRef.current?.focus()); }}>
                ย้อนกลับ
              </button>
              <button ref={previewSaveButtonRef} type="button" className="btn btn-primary" disabled={savingPayment} onClick={() => void handleSavePayment()}>
                {savingPayment ? 'กำลังบันทึกรายการ...' : 'บันทึกรายการ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
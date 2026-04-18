import { useEffect, useState } from 'react';
import { createLoanRecord, deleteLoanRecord, fetchLoans, updateLoanRecord } from '../api/adminApi';
import { AppMenu } from '../components/AppMenu';
import { InputField } from '../components/InputField';
import { useAuth } from '../contexts/AuthContext';
import type { LoanRegistryRecord, PaginationMeta, TitlePrefix } from '../types';

const titleOptions: TitlePrefix[] = ['นาย', 'นาง', 'นางสาว', 'เด็กชาย', 'เด็กหญิง'];

type LoanFormState = {
  contract_no: string;
  member_no: string;
  title: TitlePrefix;
  first_name: string;
  last_name: string;
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
  const [loans, setLoans] = useState<LoanRegistryRecord[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({ total: 0, page: 1, page_size: 20, total_pages: 1 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedContractNo, setSelectedContractNo] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<LoanFormState>(defaultForm);

  useEffect(() => {
    if (!session) {
      return;
    }

    void loadLoans();
  }, [session]);

  if (!session) {
    return null;
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
    setForm(defaultForm);
    setMessage('');
    setErrorMessage('');
  }

  function handleSearch() {
    void loadLoans(search, 1, statusFilter);
  }

  return (
    <div className="page-shell">
      <AppMenu title="สินเชื่อ" />

      <div className="hero">
        <h1>จัดการข้อมูลสินเชื่อ</h1>
        <p>ค้นหา กรองสถานะ แบ่งหน้า สร้างใหม่ แก้ไข และลบสัญญาเงินกู้ในระบบ Supabase</p>
      </div>

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
                    <span className="badge badge-approved">คงค้าง {loan.outstanding_amount}</span>
                  </div>
                  <div>{loan.title}{loan.first_name} {loan.last_name}</div>
                  <div className="registry-meta">ยอดกู้ {loan.loan_amount} | สถานะ {loan.status || '-'}</div>
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
    </div>
  );
}
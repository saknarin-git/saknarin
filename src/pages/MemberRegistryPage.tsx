import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createMemberRecord, deleteMemberRecord, fetchMembers, updateMemberRecord } from '../api/adminApi';
import { InputField } from '../components/InputField';
import { useAuth } from '../contexts/AuthContext';
import type { MemberRegistryRecord, PaginationMeta, TitlePrefix } from '../types';

const titleOptions: TitlePrefix[] = ['นาย', 'นาง', 'นางสาว', 'เด็กชาย', 'เด็กหญิง'];

type MemberFormState = {
  member_no: string;
  title: TitlePrefix;
  first_name: string;
  last_name: string;
  legacy_status: string;
  active: boolean;
};

const defaultForm: MemberFormState = {
  member_no: '',
  title: 'นาย',
  first_name: '',
  last_name: '',
  legacy_status: '',
  active: true,
};

export function MemberRegistryPage() {
  const { session, logout } = useAuth();
  const accessToken = session?.access_token ?? '';
  const [members, setMembers] = useState<MemberRegistryRecord[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({ total: 0, page: 1, page_size: 20, total_pages: 1 });
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedMemberNo, setSelectedMemberNo] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<MemberFormState>(defaultForm);

  useEffect(() => {
    if (!session) {
      return;
    }

    void loadMembers();
  }, [session]);

  if (!session) {
    return null;
  }

  async function loadMembers(nextSearch = search, nextPage = pagination.page, nextFilter = activeFilter) {
    setLoading(true);
    setErrorMessage('');

    try {
      const response = await fetchMembers(accessToken, {
        search: nextSearch,
        page: nextPage,
        pageSize: pagination.page_size,
        activeFilter: nextFilter,
      });
      setMembers(response.data.members);
      setPagination(response.data.pagination);

      if (response.data.members.length === 0) {
        setSelectedMemberNo('');
        setForm(defaultForm);
        setIsCreating(false);
        return;
      }

      if (isCreating) {
        return;
      }

      const activeMember = response.data.members.find((item) => item.member_no === selectedMemberNo) ?? response.data.members[0];
      selectMember(activeMember);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'โหลดทะเบียนสมาชิกไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  function selectMember(member: MemberRegistryRecord) {
    setIsCreating(false);
    setSelectedMemberNo(member.member_no);
    setForm({
      member_no: member.member_no,
      title: member.title,
      first_name: member.first_name,
      last_name: member.last_name,
      legacy_status: member.legacy_status ?? '',
      active: member.active,
    });
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setErrorMessage('');

    try {
      const response = isCreating
        ? await createMemberRecord(accessToken, form)
        : await updateMemberRecord(accessToken, form);
      setMessage(response.message);
      await loadMembers(search, pagination.page, activeFilter);
      setIsCreating(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'บันทึกข้อมูลสมาชิกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(memberNo: string) {
    const confirmed = window.confirm(
      `ยืนยันลบสมาชิก ${memberNo}\nการลบจะลบข้อมูลสินเชื่อและบัญชีผู้ใช้ที่ผูกกับสมาชิกนี้ด้วย`,
    );

    if (!confirmed) {
      return;
    }

    setDeleting(memberNo);
    setMessage('');
    setErrorMessage('');

    try {
      const response = await deleteMemberRecord(accessToken, memberNo);
      setMessage(response.message);
      await loadMembers(search, pagination.page, activeFilter);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'ลบข้อมูลสมาชิกไม่สำเร็จ');
    } finally {
      setDeleting(null);
    }
  }

  function startCreateMode() {
    setIsCreating(true);
    setSelectedMemberNo('');
    setForm(defaultForm);
    setMessage('');
    setErrorMessage('');
  }

  function handleSearch() {
    void loadMembers(search, 1, activeFilter);
  }

  function handleFilterChange(value: 'all' | 'active' | 'inactive') {
    setActiveFilter(value);
    void loadMembers(search, 1, value);
  }

  return (
    <div className="page-shell">
      <div className="topbar">
        <h2>ทะเบียนสมาชิก</h2>
        <div className="actions">
          <Link to="/dashboard" className="btn btn-secondary">กลับหน้าหลัก</Link>
          <Link to="/loans" className="btn btn-secondary">ไปหน้า สินเชื่อ</Link>
          <button type="button" className="btn btn-danger" onClick={logout}>ออกจากระบบ</button>
        </div>
      </div>

      <div className="hero">
        <h1>จัดการทะเบียนสมาชิก</h1>
        <p>ค้นหา กรองสถานะ แบ่งหน้า สร้างใหม่ แก้ไข และลบข้อมูลสมาชิกจากฐานข้อมูล Supabase โดยตรง</p>
      </div>

      <div className="grid-two registry-layout">
        <section className="card">
          <div className="section-toolbar">
            <InputField label="ค้นหาเลขสมาชิก หรือชื่อ" value={search} onChange={(event) => setSearch(event.target.value)} />
            <label className="field">
              <span>กรองสถานะการใช้งาน</span>
              <select value={activeFilter} onChange={(event) => handleFilterChange(event.target.value as 'all' | 'active' | 'inactive')}>
                <option value="all">ทั้งหมด</option>
                <option value="active">ใช้งาน</option>
                <option value="inactive">ปิดใช้งาน</option>
              </select>
            </label>
            <div className="actions compact-actions">
              <button type="button" className="btn btn-secondary" onClick={handleSearch}>ค้นหา</button>
              <button type="button" className="btn btn-secondary" onClick={() => { setSearch(''); setActiveFilter('all'); void loadMembers('', 1, 'all'); }}>ล้างคำค้น</button>
              <button type="button" className="btn btn-primary" onClick={startCreateMode}>สร้างสมาชิกใหม่</button>
            </div>
          </div>

          {message && <div className="notice">{message}</div>}
          {errorMessage && <div className="alert-error">{errorMessage}</div>}

          {loading ? (
            <p className="muted">กำลังโหลดทะเบียนสมาชิก...</p>
          ) : (
            <div className="list">
              {members.length === 0 && <p className="muted">ไม่พบข้อมูลสมาชิก</p>}
              {members.map((member) => (
                <button
                  key={member.member_no}
                  type="button"
                  className={`registry-card ${selectedMemberNo === member.member_no ? 'registry-card-active' : ''}`}
                  onClick={() => selectMember(member)}
                >
                  <div className="topbar registry-card-header">
                    <div>
                      <strong>{member.member_no}</strong>
                      <div>{member.title}{member.first_name} {member.last_name}</div>
                    </div>
                    <span className={`badge ${member.active ? 'badge-approved' : 'badge-rejected'}`}>
                      {member.active ? 'ใช้งาน' : 'ปิดใช้งาน'}
                    </span>
                  </div>
                  <div className="registry-meta">สถานะเดิม: {member.legacy_status || '-'}</div>
                  <div className="registry-meta">บัญชีผู้ใช้ {member.linked_users} รายการ | สินเชื่อ {member.loan_contracts} รายการ</div>
                </button>
              ))}
            </div>
          )}
          <div className="pagination-bar">
            <div className="muted">ทั้งหมด {pagination.total} รายการ | หน้า {pagination.page} / {pagination.total_pages}</div>
            <div className="actions compact-actions">
              <button type="button" className="btn btn-secondary" disabled={pagination.page <= 1 || loading} onClick={() => void loadMembers(search, pagination.page - 1, activeFilter)}>ก่อนหน้า</button>
              <button type="button" className="btn btn-secondary" disabled={pagination.page >= pagination.total_pages || loading} onClick={() => void loadMembers(search, pagination.page + 1, activeFilter)}>ถัดไป</button>
            </div>
          </div>
        </section>

        <section className="card">
          <h3 className="section-title">{isCreating ? 'สร้างข้อมูลสมาชิกใหม่' : 'แก้ไขข้อมูลสมาชิก'}</h3>
          {!isCreating && !selectedMemberNo ? (
            <p className="muted">เลือกสมาชิกจากรายการด้านซ้ายเพื่อแก้ไขข้อมูล หรือกดสร้างสมาชิกใหม่</p>
          ) : (
            <form onSubmit={handleSave}>
              <InputField label="เลขที่สมาชิก" value={form.member_no} onChange={(event) => setForm((current) => ({ ...current, member_no: event.target.value }))} readOnly={!isCreating} required />
              <label className="field">
                <span>คำนำหน้าชื่อ</span>
                <select value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value as TitlePrefix }))}>
                  {titleOptions.map((title) => <option key={title} value={title}>{title}</option>)}
                </select>
              </label>
              <InputField label="ชื่อ" value={form.first_name} onChange={(event) => setForm((current) => ({ ...current, first_name: event.target.value }))} required />
              <InputField label="สกุล" value={form.last_name} onChange={(event) => setForm((current) => ({ ...current, last_name: event.target.value }))} required />
              <InputField label="สถานะเดิมจากฐานข้อมูลเก่า" value={form.legacy_status} onChange={(event) => setForm((current) => ({ ...current, legacy_status: event.target.value }))} />
              <label className="field">
                <span>สถานะการใช้งาน</span>
                <select value={String(form.active)} onChange={(event) => setForm((current) => ({ ...current, active: event.target.value === 'true' }))}>
                  <option value="true">ใช้งาน</option>
                  <option value="false">ปิดใช้งาน</option>
                </select>
              </label>
              <div className="muted">{isCreating ? 'สมาชิกใหม่จะพร้อมสำหรับการสมัครใช้งานหรือผูกกับสินเชื่อทันที' : 'การแก้ไขชื่อสมาชิกจะอัปเดตไปยังบัญชีผู้ใช้และสินเชื่อที่ผูกกับสมาชิกนี้ด้วย'}</div>
              <div className="actions">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'กำลังบันทึก...' : isCreating ? 'สร้างข้อมูลสมาชิก' : 'บันทึกข้อมูลสมาชิก'}
                </button>
                {isCreating ? (
                  <button type="button" className="btn btn-secondary" onClick={() => { setIsCreating(false); if (members[0]) selectMember(members[0]); }}>
                    ยกเลิกการสร้าง
                  </button>
                ) : (
                  <button type="button" className="btn btn-danger" disabled={deleting === selectedMemberNo} onClick={() => void handleDelete(selectedMemberNo)}>
                    {deleting === selectedMemberNo ? 'กำลังลบ...' : 'ลบสมาชิก'}
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
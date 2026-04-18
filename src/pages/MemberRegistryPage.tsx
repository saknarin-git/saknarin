import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteMemberRecord, fetchMembers, updateMemberRecord } from '../api/adminApi';
import { InputField } from '../components/InputField';
import { useAuth } from '../contexts/AuthContext';
import type { MemberRegistryRecord, TitlePrefix } from '../types';

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
  const [members, setMembers] = useState<MemberRegistryRecord[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedMemberNo, setSelectedMemberNo] = useState('');
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

  async function loadMembers(nextSearch = search) {
    setLoading(true);
    setErrorMessage('');

    try {
      const response = await fetchMembers(session.access_token, nextSearch);
      setMembers(response.data.members);

      if (response.data.members.length === 0) {
        setSelectedMemberNo('');
        setForm(defaultForm);
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
      const response = await updateMemberRecord(session.access_token, form);
      setMessage(response.message);
      await loadMembers();
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
      const response = await deleteMemberRecord(session.access_token, memberNo);
      setMessage(response.message);
      await loadMembers();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'ลบข้อมูลสมาชิกไม่สำเร็จ');
    } finally {
      setDeleting(null);
    }
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
        <p>ค้นหา แก้ไข และลบข้อมูลสมาชิกจากฐานข้อมูล Supabase โดยตรง</p>
      </div>

      <div className="grid-two registry-layout">
        <section className="card">
          <div className="section-toolbar">
            <InputField label="ค้นหาเลขสมาชิก หรือชื่อ" value={search} onChange={(event) => setSearch(event.target.value)} />
            <div className="actions compact-actions">
              <button type="button" className="btn btn-secondary" onClick={() => void loadMembers(search)}>ค้นหา</button>
              <button type="button" className="btn btn-secondary" onClick={() => { setSearch(''); void loadMembers(''); }}>ล้างคำค้น</button>
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
        </section>

        <section className="card">
          <h3 className="section-title">แก้ไขข้อมูลสมาชิก</h3>
          {!selectedMemberNo ? (
            <p className="muted">เลือกสมาชิกจากรายการด้านซ้ายเพื่อแก้ไขข้อมูล</p>
          ) : (
            <form onSubmit={handleSave}>
              <InputField label="เลขที่สมาชิก" value={form.member_no} readOnly />
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
              <div className="muted">การแก้ไขชื่อสมาชิกจะอัปเดตไปยังบัญชีผู้ใช้และสินเชื่อที่ผูกกับสมาชิกนี้ด้วย</div>
              <div className="actions">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูลสมาชิก'}
                </button>
                <button type="button" className="btn btn-danger" disabled={deleting === selectedMemberNo} onClick={() => void handleDelete(selectedMemberNo)}>
                  {deleting === selectedMemberNo ? 'กำลังลบ...' : 'ลบสมาชิก'}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
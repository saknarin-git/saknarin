import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginUser, registerUser, searchMembers } from '../api/authApi';
import { InputField } from '../components/InputField';
import { APP_GROUP_NAME } from '../constants/appBrand';
import { useAuth } from '../contexts/AuthContext';
import type { MemberRecord, RegisterPayload, TitlePrefix } from '../types';

const TITLE_OPTIONS: TitlePrefix[] = ['นาย', 'นาง', 'นางสาว', 'เด็กชาย', 'เด็กหญิง'];

const initialRegisterForm: RegisterPayload = {
  member_no: '',
  title: 'นาย',
  first_name: '',
  last_name: '',
  username: '',
  password: '',
};

export function LoginPage() {
  const navigate = useNavigate();
  const { setSessionData } = useAuth();
  const [matches, setMatches] = useState<MemberRecord[]>([]);
  const [memberLookupMessage, setMemberLookupMessage] = useState('กรอกคำนำหน้า ชื่อ และสกุล เพื่อค้นหาเลขสมาชิกอัตโนมัติ');
  const [registerForm, setRegisterForm] = useState<RegisterPayload>(initialRegisterForm);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);

  const canLookupMember = useMemo(
    () => registerForm.first_name.trim().length >= 2 && registerForm.last_name.trim().length >= 2,
    [registerForm.first_name, registerForm.last_name],
  );

  useEffect(() => {
    if (!canLookupMember) {
      setMatches([]);
      setMemberLookupMessage('กรอกคำนำหน้า ชื่อ และสกุล เพื่อค้นหาเลขสมาชิกอัตโนมัติ');
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const result = await searchMembers({
          title: registerForm.title,
          first_name: registerForm.first_name,
          last_name: registerForm.last_name,
        });

        setMatches(result.data);

        if (result.data.length === 1) {
          setRegisterForm((current) => ({ ...current, member_no: result.data[0].member_no }));
          setMemberLookupMessage(`พบเลขสมาชิก ${result.data[0].member_no} อัตโนมัติแล้ว`);
        } else if (result.data.length > 1) {
          setMemberLookupMessage('พบหลายรายการ กรุณาเลือกเลขสมาชิกที่ถูกต้อง');
        } else {
          setRegisterForm((current) => ({ ...current, member_no: '' }));
          setMemberLookupMessage('ไม่พบข้อมูลสมาชิกในฐานข้อมูล กรุณาตรวจสอบชื่อ-สกุล');
        }
      } catch (error) {
        setMatches([]);
        setMemberLookupMessage(error instanceof Error ? error.message : 'ค้นหาสมาชิกไม่สำเร็จ');
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [canLookupMember, registerForm.first_name, registerForm.last_name, registerForm.title]);

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFeedback('');

    try {
      const result = await registerUser(registerForm);
      setFeedback(result.message);
      setRegisterForm(initialRegisterForm);
      setMatches([]);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'สมัครสมาชิกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFeedback('');

    try {
      const result = await loginUser(loginForm);

      if (!result.data) {
        throw new Error('ไม่พบข้อมูลการเข้าสู่ระบบ');
      }

      setSessionData(result.data);
      navigate('/dashboard');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-shell">
      <div className="hero">
        <h1>{APP_GROUP_NAME}</h1>
        <p>ระบบสมัครสมาชิก เข้าสู่ระบบ และอนุมัติผู้ใช้งานผ่านหน้า DevManager</p>
      </div>

      {feedback && <div className="notice">{feedback}</div>}

      <div className="grid-two">
        <section className="card">
          <h2>เข้าสู่ระบบ</h2>
          <form onSubmit={handleLogin}>
            <InputField
              label="Username"
              value={loginForm.username}
              onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))}
              required
            />
            <InputField
              label="Password"
              type="password"
              value={loginForm.password}
              onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
              required
            />
            <div className="actions">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                เข้าสู่ระบบ
              </button>
            </div>
          </form>
        </section>

        <section className="card">
          <h2>สมัครสมาชิกใหม่</h2>
          <form onSubmit={handleRegister}>
            <div className="form-grid">
              <label className="field">
                <span>คำนำหน้า</span>
                <select
                  value={registerForm.title}
                  onChange={(event) =>
                    setRegisterForm((current) => ({ ...current, title: event.target.value as TitlePrefix }))
                  }
                >
                  {TITLE_OPTIONS.map((title) => (
                    <option key={title} value={title}>
                      {title}
                    </option>
                  ))}
                </select>
              </label>
              <InputField
                label="ชื่อ"
                value={registerForm.first_name}
                onChange={(event) => setRegisterForm((current) => ({ ...current, first_name: event.target.value }))}
                required
              />
              <InputField
                label="สกุล"
                value={registerForm.last_name}
                onChange={(event) => setRegisterForm((current) => ({ ...current, last_name: event.target.value }))}
                required
              />
            </div>

            <div className="notice">{memberLookupMessage}</div>

            {!!matches.length && (
              <div className="list" style={{ marginBottom: '12px' }}>
                {matches.map((member) => (
                  <button
                    key={member.member_no}
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setRegisterForm((current) => ({ ...current, member_no: member.member_no }))}
                  >
                    เลือกสมาชิกเลขที่ {member.member_no} - {member.title}{member.first_name} {member.last_name}
                  </button>
                ))}
              </div>
            )}

            <div className="form-grid">
              <InputField
                label="เลขสมาชิก"
                value={registerForm.member_no}
                onChange={(event) => setRegisterForm((current) => ({ ...current, member_no: event.target.value }))}
                placeholder="ระบบค้นหาอัตโนมัติ"
                required
              />
              <InputField
                label="Username (ห้ามซ้ำ)"
                value={registerForm.username}
                onChange={(event) => setRegisterForm((current) => ({ ...current, username: event.target.value.trim() }))}
                required
              />
              <InputField
                label="Password"
                type="password"
                value={registerForm.password}
                onChange={(event) => setRegisterForm((current) => ({ ...current, password: event.target.value }))}
                required
              />
            </div>

            <div className="actions">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                สมัครสมาชิก
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
import { useEffect, useState } from 'react';
import { AppMenu } from '../components/AppMenu';
import { fetchSystemOverview } from '../api/overviewApi';
import { SystemOverviewPanel } from '../components/SystemOverviewPanel';
import { useAuth } from '../contexts/AuthContext';
import type { AdminOverview, AppSettings } from '../types';
import { APP_GROUP_NAME } from '../constants/appBrand';

const defaultSettings: AppSettings = {
  group_name: APP_GROUP_NAME,
  notice: '',
  allow_registration: true,
};

const defaultOverview: AdminOverview = {
  members_count: 0,
  active_members_count: 0,
  inactive_members_count: 0,
  users_count: 0,
  approved_users_count: 0,
  pending_users_count: 0,
  officer_users_count: 0,
  admin_users_count: 0,
  loan_contracts_count: 0,
  active_loan_contracts_count: 0,
  closed_loan_contracts_count: 0,
  total_loan_amount: 0,
  total_outstanding_amount: 0,
};

export function DashboardPage() {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? '';
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [overview, setOverview] = useState<AdminOverview>(defaultOverview);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    void loadOverview(accessToken);
  }, [accessToken]);

  async function loadOverview(token: string) {
    try {
      const response = await fetchSystemOverview(token);
      setSettings(response.data.settings);
      setOverview(response.data.overview);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'ไม่สามารถโหลดแดชบอร์ดภาพรวมของระบบได้');
    }
  }

  if (!session) {
    return null;
  }

  return (
    <div className="page-shell">
      <AppMenu title="แดชบอร์ดภาพรวมระบบ" />

      <div className="hero">
        <h1>แดชบอร์ดสรุปภาพรวมของระบบ</h1>
        <p>ผู้ใช้ทุกคนที่ล็อกอินแล้วสามารถติดตามภาพรวมของกลุ่มได้จากหน้านี้</p>
      </div>

      {errorMessage && <div className="alert-error">{errorMessage}</div>}

      <SystemOverviewPanel
        overview={overview}
        settings={settings}
        title="สรุปภาพรวมของกลุ่ม"
        description="แดชบอร์ดกลางสำหรับผู้ใช้ทุกคน ใช้ดูภาพรวมของสมาชิก บัญชีผู้ใช้งาน และภาพรวมสินเชื่อในระบบ"
      />
    </div>
  );
}
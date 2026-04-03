import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../api/config";

type InstitutionalConfig = {
  enabled: boolean;
  institution_name: string;
  auth_type: string;
  login_url: string;
  ezproxy_prefix: string;
  username: string;
  password: string;
  headless: boolean;
};

type SessionStatus = {
  authenticated: boolean;
  last_login_time: string | null;
  cookie_count: number;
  session_active: boolean;
  session_healthy?: boolean;
};

type Props = { open: boolean };

export default function InstitutionalAccessSettings({ open }: Props) {
  const [config, setConfig] = useState<InstitutionalConfig>({
    enabled: false,
    institution_name: "",
    auth_type: "ezproxy",
    login_url: "",
    ezproxy_prefix: "",
    username: "",
    password: "",
    headless: true,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [status, setStatus] = useState<SessionStatus | null>(null);

  // 加载配置
  useEffect(() => {
    if (!open) return;
    setSaved(false);
    setTestResult(null);

    fetch(`${API_BASE_URL}/api/settings/institutional-access`)
      .then((res) => res.json())
      .then((data: InstitutionalConfig) => setConfig(data))
      .catch((err) => console.error("加载机构访问配置失败", err));

    // 加载 session 状态
    fetch(`${API_BASE_URL}/api/settings/institutional-access/status`)
      .then((res) => res.json())
      .then((data: SessionStatus) => setStatus(data))
      .catch(() => {});
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/settings/institutional-access`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
        }
      );
      if (!res.ok) throw new Error("保存失败");
      setSaved(true);
    } catch (err) {
      console.error(err);
      setError("保存配置失败");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    // 先保存再测试
    await handleSave();

    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/settings/institutional-access/test`,
        { method: "POST" }
      );
      const data = await res.json();
      setTestResult({
        success: data.success,
        message: data.message || (data.success ? "登录成功" : "登录失败"),
      });
      if (data.status) setStatus(data.status);
    } catch (err) {
      setTestResult({ success: false, message: "测试请求失败" });
    } finally {
      setTesting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid #334155",
    background: "#1e293b",
    color: "#e2e8f0",
    fontSize: "13px",
    boxSizing: "border-box",
  };

  return (
    <section className="settings-section">
      <h3>🏛️ 机构访问</h3>
      <p className="settings-description">
        配置大学/机构的 EZProxy 或 Shibboleth 登录信息，用于下载付费期刊 PDF
        全文。配置后可在文献库中一键下载或批量下载论文 PDF。
      </p>

      {error && <div className="settings-error">错误: {error}</div>}

      {/* Session 状态指示 */}
      {status && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 12px",
            borderRadius: "6px",
            background: status.authenticated
              ? "rgba(34, 197, 94, 0.1)"
              : "rgba(148, 163, 184, 0.1)",
            marginBottom: "12px",
            fontSize: "13px",
          }}
        >
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: status.authenticated ? "#22c55e" : "#94a3b8",
              display: "inline-block",
            }}
          />
          <span style={{ color: status.authenticated ? "#22c55e" : "#94a3b8" }}>
            {status.authenticated
              ? `已认证 (${status.cookie_count} cookies)`
              : "未认证"}
          </span>
          {status.last_login_time && (
            <span style={{ color: "#64748b", fontSize: "12px" }}>
              上次登录:{" "}
              {new Date(status.last_login_time).toLocaleString("zh-CN")}
            </span>
          )}
        </div>
      )}

      {/* 启用开关 */}
      <label
        className="settings-row"
        style={{ cursor: "pointer", userSelect: "none" }}
      >
        <span>启用机构访问</span>
        <div
          onClick={() =>
            setConfig((prev) => ({ ...prev, enabled: !prev.enabled }))
          }
          style={{
            width: "44px",
            height: "24px",
            borderRadius: "12px",
            background: config.enabled ? "#3b82f6" : "#475569",
            position: "relative",
            cursor: "pointer",
            transition: "background 0.2s",
          }}
        >
          <div
            style={{
              width: "20px",
              height: "20px",
              borderRadius: "50%",
              background: "#fff",
              position: "absolute",
              top: "2px",
              left: config.enabled ? "22px" : "2px",
              transition: "left 0.2s",
            }}
          />
        </div>
      </label>

      {/* 配置表单 */}
      <label className="settings-row">
        <span>机构名称</span>
        <input
          type="text"
          value={config.institution_name}
          placeholder="例: University of Nottingham"
          onChange={(e) =>
            setConfig((prev) => ({
              ...prev,
              institution_name: e.target.value,
            }))
          }
          style={inputStyle}
        />
      </label>

      <label className="settings-row">
        <span>认证类型</span>
        <select
          value={config.auth_type}
          onChange={(e) =>
            setConfig((prev) => ({ ...prev, auth_type: e.target.value }))
          }
          style={{ ...inputStyle, cursor: "pointer" }}
        >
          <option value="ezproxy">EZProxy</option>
          <option value="shibboleth">Shibboleth / OpenAthens</option>
        </select>
      </label>

      <label className="settings-row">
        <span>登录页 URL</span>
        <input
          type="text"
          value={config.login_url}
          placeholder="例: https://ezproxy.nottingham.ac.uk/login"
          onChange={(e) =>
            setConfig((prev) => ({ ...prev, login_url: e.target.value }))
          }
          style={inputStyle}
        />
      </label>

      {config.auth_type === "ezproxy" && (
        <label className="settings-row">
          <span>EZProxy 前缀</span>
          <input
            type="text"
            value={config.ezproxy_prefix}
            placeholder="例: https://ezproxy.nottingham.ac.uk/login?url="
            onChange={(e) =>
              setConfig((prev) => ({
                ...prev,
                ezproxy_prefix: e.target.value,
              }))
            }
            style={inputStyle}
          />
        </label>
      )}

      <label className="settings-row">
        <span>用户名</span>
        <input
          type="text"
          value={config.username}
          placeholder="大学用户名 / 学号"
          onChange={(e) =>
            setConfig((prev) => ({ ...prev, username: e.target.value }))
          }
          style={inputStyle}
        />
      </label>

      <label className="settings-row">
        <span>密码</span>
        <input
          type="password"
          value={config.password}
          placeholder="大学密码"
          onChange={(e) =>
            setConfig((prev) => ({ ...prev, password: e.target.value }))
          }
          style={inputStyle}
        />
      </label>

      {/* Headless 开关 */}
      <label
        className="settings-row"
        style={{ cursor: "pointer", userSelect: "none" }}
      >
        <div>
          <span>无头浏览器模式</span>
          <div
            style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}
          >
            关闭后可看到浏览器窗口（用于 MFA 手动验证）
          </div>
        </div>
        <div
          onClick={() =>
            setConfig((prev) => ({ ...prev, headless: !prev.headless }))
          }
          style={{
            width: "44px",
            height: "24px",
            borderRadius: "12px",
            background: config.headless ? "#3b82f6" : "#475569",
            position: "relative",
            cursor: "pointer",
            transition: "background 0.2s",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: "20px",
              height: "20px",
              borderRadius: "50%",
              background: "#fff",
              position: "absolute",
              top: "2px",
              left: config.headless ? "22px" : "2px",
              transition: "left 0.2s",
            }}
          />
        </div>
      </label>

      {/* 测试结果 */}
      {testResult && (
        <div
          style={{
            padding: "8px 12px",
            borderRadius: "6px",
            background: testResult.success
              ? "rgba(34, 197, 94, 0.1)"
              : "rgba(239, 68, 68, 0.1)",
            color: testResult.success ? "#22c55e" : "#ef4444",
            fontSize: "13px",
            marginTop: "8px",
          }}
        >
          {testResult.success ? "✓" : "✗"} {testResult.message}
        </div>
      )}

      {/* 操作按钮 */}
      <div
        className="settings-row"
        style={{ marginTop: "12px", gap: "8px", display: "flex" }}
      >
        <button
          className="settings-secondary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "保存中..." : saved ? "✓ 已保存" : "保存配置"}
        </button>
        <button
          className="settings-secondary"
          onClick={handleTest}
          disabled={testing || !config.login_url || !config.username}
          style={{
            background: testing ? "#475569" : "#1d4ed8",
            color: "#fff",
            opacity:
              testing || !config.login_url || !config.username ? 0.5 : 1,
          }}
        >
          {testing ? "测试登录中..." : "测试登录"}
        </button>
      </div>
    </section>
  );
}

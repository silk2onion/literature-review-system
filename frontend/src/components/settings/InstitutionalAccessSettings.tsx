import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../api/config";
import { useLocale } from "../../hooks/useLocale";

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
  const { t } = useLocale();
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

  useEffect(() => {
    if (!open) return;
    setSaved(false);
    setTestResult(null);

    fetch(`${API_BASE_URL}/api/settings/institutional-access`)
      .then((res) => res.json())
      .then((data: InstitutionalConfig) => setConfig(data))
      .catch((err) => console.error("Failed to load institutional config", err));

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
      if (!res.ok) throw new Error(t("common.saveFailed"));
      setSaved(true);
    } catch (err) {
      console.error(err);
      setError(t("settings.institutional.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
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
        message: data.message || (data.success ? t("settings.institutional.loginSuccess") : t("settings.institutional.loginFailed")),
      });
      if (data.status) setStatus(data.status);
    } catch (err) {
      setTestResult({ success: false, message: t("settings.institutional.testFailed") });
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
      <h3>🏛️ {t("settings.institutional.title")}</h3>
      <p className="settings-description">
        {t("settings.institutional.description")}
      </p>

      {error && <div className="settings-error">{t("common.error")} {error}</div>}

      {/* Session status indicator */}
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
              ? t("settings.institutional.authenticated", { cookieCount: status.cookie_count })
              : t("settings.institutional.notAuthenticated")}
          </span>
          {status.last_login_time && (
            <span style={{ color: "#64748b", fontSize: "12px" }}>
              {t("settings.institutional.lastLogin")}{" "}
              {new Date(status.last_login_time).toLocaleString()}
            </span>
          )}
        </div>
      )}

      {/* Enable toggle */}
      <label
        className="settings-row"
        style={{ cursor: "pointer", userSelect: "none" }}
      >
        <span>{t("settings.institutional.enableAccess")}</span>
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

      {/* Config form */}
      <label className="settings-row">
        <span>{t("settings.institutional.institutionName")}</span>
        <input
          type="text"
          value={config.institution_name}
          placeholder={t("settings.institutional.institutionNamePlaceholder")}
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
        <span>{t("settings.institutional.authType")}</span>
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
        <span>{t("settings.institutional.loginUrl")}</span>
        <input
          type="text"
          value={config.login_url}
          placeholder={t("settings.institutional.loginUrlPlaceholder")}
          onChange={(e) =>
            setConfig((prev) => ({ ...prev, login_url: e.target.value }))
          }
          style={inputStyle}
        />
      </label>

      {config.auth_type === "ezproxy" && (
        <label className="settings-row">
          <span>{t("settings.institutional.ezproxyPrefix")}</span>
          <input
            type="text"
            value={config.ezproxy_prefix}
            placeholder={t("settings.institutional.ezproxyPrefixPlaceholder")}
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
        <span>{t("settings.institutional.username")}</span>
        <input
          type="text"
          value={config.username}
          placeholder={t("settings.institutional.usernamePlaceholder")}
          onChange={(e) =>
            setConfig((prev) => ({ ...prev, username: e.target.value }))
          }
          style={inputStyle}
        />
      </label>

      <label className="settings-row">
        <span>{t("settings.institutional.password")}</span>
        <input
          type="password"
          value={config.password}
          placeholder={t("settings.institutional.passwordPlaceholder")}
          onChange={(e) =>
            setConfig((prev) => ({ ...prev, password: e.target.value }))
          }
          style={inputStyle}
        />
      </label>

      {/* Headless toggle */}
      <label
        className="settings-row"
        style={{ cursor: "pointer", userSelect: "none" }}
      >
        <div>
          <span>{t("settings.institutional.headlessMode")}</span>
          <div
            style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}
          >
            {t("settings.institutional.headlessDescription")}
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

      {/* Test result */}
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

      {/* Action buttons */}
      <div
        className="settings-row"
        style={{ marginTop: "12px", gap: "8px", display: "flex" }}
      >
        <button
          className="settings-secondary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? t("common.saving") : saved ? t("common.saved") : t("settings.institutional.saveConfig")}
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
          {testing ? t("settings.institutional.testingLogin") : t("settings.institutional.testLogin")}
        </button>
      </div>
    </section>
  );
}

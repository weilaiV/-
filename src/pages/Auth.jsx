import React, { useState } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  LoaderCircle,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { api } from "../api";
import { ErrorBox } from "../components/ui";

const REMEMBERED_ACCOUNT_KEY = "keran.auth.rememberedUsername";

function readRememberedAccount() {
  try {
    const account = window.localStorage.getItem(REMEMBERED_ACCOUNT_KEY);
    return /^[a-zA-Z0-9_.-]{3,40}$/.test(account || "") ? account : "";
  } catch {
    return "";
  }
}

export default function Auth({ needsSetup, requiresSetupToken, onLogin }) {
  const [rememberedAccount] = useState(readRememberedAccount);
  const [form, setForm] = useState({
    username: needsSetup ? "" : rememberedAccount,
    password: "",
    name: "",
    setupToken: "",
  });
  const [rememberAccount, setRememberAccount] = useState(
    !needsSetup && Boolean(rememberedAccount),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [visible, setVisible] = useState(false);
  const update = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  function changeRememberAccount(event) {
    const checked = event.target.checked;
    setRememberAccount(checked);
    if (!checked) {
      try {
        window.localStorage.removeItem(REMEMBERED_ACCOUNT_KEY);
      } catch {
        // Storage restrictions must not prevent local sign-in.
      }
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api(
        needsSetup ? "/auth/setup" : "/auth/login",
        form,
      );
      try {
        if (!needsSetup && rememberAccount) {
          window.localStorage.setItem(REMEMBERED_ACCOUNT_KEY, form.username);
        } else {
          window.localStorage.removeItem(REMEMBERED_ACCOUNT_KEY);
        }
      } catch {
        // Remembering an account is optional; passwords are never stored here.
      }
      onLogin(result.user);
    } catch (err) {
      setError(err.message || "登录失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ref-login">
      <div className="ref-login-atmosphere" aria-hidden="true">
        <span className="ref-login-orbit" />
        <span className="ref-login-glow" />
      </div>
      <header className="ref-login-brand-header">
        <div className="ref-login-brand-sign" aria-label="科然数智">
          <span className="ref-login-monogram" aria-hidden="true">
            KR
          </span>
          <span className="ref-login-brand-divider" aria-hidden="true" />
          <span className="ref-login-brand-name">科然数智</span>
        </div>
      </header>
      <main className="ref-login-main">
        <section className="ref-login-story" aria-labelledby="ref-login-slogan">
          <div className="ref-login-copy">
            <p className="ref-login-eyebrow">KERAN DIGITAL INTELLIGENCE</p>
            <h1 id="ref-login-slogan">
              让数据浮出水面
              <br />
              <em>让决策深入本质</em>
            </h1>
            <p className="ref-login-description">
              连接经营数据、组织协同与智能分析，
              <br />
              从看见结果，到理解结果背后的每一层原因。
            </p>
            <ul className="ref-login-capabilities" aria-label="平台能力">
              {[
                ["01", "经营全景"],
                ["02", "组织协同"],
                ["03", "智能决策"],
              ].map(([index, title]) => (
                <li key={index}>
                  <span className="ref-login-capability-index">{index}</span>
                  <span className="ref-login-capability-name">{title}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="ref-login-scene" aria-hidden="true">
            <div className="ref-login-iceberg-top" />
            <div className="ref-login-waterline" />
            <div className="ref-login-iceberg-depth" />
          </div>
        </section>
        <form
          className="ref-login-panel"
          onSubmit={submit}
          aria-labelledby="ref-login-title"
          aria-busy={busy}
        >
          <div className="ref-login-kicker">
            <ShieldCheck size={15} aria-hidden="true" />
            <span>SECURE WORKSPACE</span>
          </div>
          <h2 id="ref-login-title">
            {needsSetup ? "开启数智经营" : "欢迎回来"}
          </h2>
          <p className="ref-login-subtitle">
            {needsSetup
              ? "创建首位管理员，开启企业经营工作台。"
              : "登录科然数智，进入企业经营工作台"}
          </p>
          <ErrorBox message={error} />
          {needsSetup && (
            <div className="ref-login-field">
              <label htmlFor="ref-login-name">姓名</label>
              <div className="ref-login-input">
                <UserRound size={17} aria-hidden="true" />
                <input
                  id="ref-login-name"
                  name="name"
                  autoComplete="name"
                  value={form.name}
                  onChange={update}
                  maxLength={40}
                  disabled={busy}
                  required
                  placeholder="你的姓名"
                />
              </div>
            </div>
          )}
          <div className="ref-login-field">
            <label htmlFor="ref-login-username">账号</label>
            <div className="ref-login-input">
              <UserRound size={17} aria-hidden="true" />
              <input
                id="ref-login-username"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={form.username}
                onChange={update}
                pattern="[a-zA-Z0-9_.-]{3,40}"
                title="3～40 位字母、数字、点、横线或下划线"
                minLength={3}
                maxLength={40}
                disabled={busy}
                required
                placeholder={needsSetup ? "设置管理员账号" : "请输入账号"}
              />
            </div>
          </div>
          <div className="ref-login-field">
            <label htmlFor="ref-login-password">密码</label>
            <div className="ref-login-input">
              <LockKeyhole size={17} aria-hidden="true" />
              <input
                id="ref-login-password"
                name="password"
                type={visible ? "text" : "password"}
                autoComplete={needsSetup ? "new-password" : "current-password"}
                value={form.password}
                onChange={update}
                minLength={needsSetup ? 12 : 1}
                maxLength={128}
                aria-describedby={
                  needsSetup ? "ref-login-password-hint" : undefined
                }
                disabled={busy}
                required
                placeholder={needsSetup ? "设置至少 12 位密码" : "请输入密码"}
              />
              <button
                className="ref-login-password-toggle"
                type="button"
                aria-label={visible ? "隐藏密码" : "显示密码"}
                aria-controls="ref-login-password"
                aria-pressed={visible}
                disabled={busy}
                onClick={() => setVisible((current) => !current)}
              >
                {visible ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            {needsSetup && (
              <p className="ref-login-field-hint" id="ref-login-password-hint">
                请设置至少 12 位的新密码。
              </p>
            )}
          </div>
          {needsSetup && requiresSetupToken && (
            <div className="ref-login-field">
              <label htmlFor="ref-login-setup-token">初始化令牌</label>
              <div className="ref-login-input">
                <ShieldCheck size={17} aria-hidden="true" />
                <input
                  id="ref-login-setup-token"
                  name="setupToken"
                  type="password"
                  autoComplete="off"
                  value={form.setupToken}
                  onChange={update}
                  disabled={busy}
                  required
                  placeholder="由服务器管理员提供"
                />
              </div>
            </div>
          )}
          <div className="ref-login-options">
            {!needsSetup && (
              <label className="ref-login-remember">
                <input
                  type="checkbox"
                  checked={rememberAccount}
                  onChange={changeRememberAccount}
                  disabled={busy}
                />
                <span>
                  记住我 <small>仅记住账号</small>
                </span>
              </label>
            )}
            <span className="ref-login-security">
              <i aria-hidden="true" />
              本地安全登录
            </span>
          </div>
          <button className="ref-login-submit" type="submit" disabled={busy}>
            <span>
              {busy
                ? needsSetup
                  ? "正在创建…"
                  : "正在登录…"
                : needsSetup
                  ? "创建工作空间"
                  : "进入系统"}
            </span>
            {busy ? (
              <LoaderCircle
                className="ref-login-loading"
                size={17}
                aria-hidden="true"
              />
            ) : (
              <ArrowRight size={17} aria-hidden="true" />
            )}
          </button>
          <p className="ref-login-note">
            {needsSetup
              ? "请自行设置管理员账号与新密码。"
              : "如需开通账号，请联系企业管理员。"}
          </p>
        </form>
      </main>
      <footer className="ref-login-footer">
        <span>© {new Date().getFullYear()} 科然数智</span>
        <i aria-hidden="true" />
        <span>让经营看得见</span>
      </footer>
    </div>
  );
}

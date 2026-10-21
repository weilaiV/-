import React, { useState } from "react";
import {
  ArrowRight,
  ShieldCheck,
  ChartNoAxesCombined,
  Eye,
  EyeOff,
} from "lucide-react";
import { api } from "../api";
import { ErrorBox } from "../components/ui";
export default function Auth({ needsSetup, requiresSetupToken, onLogin }) {
  const [form, setForm] = useState({
    username: "",
    password: "",
    name: "",
    setupToken: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [visible, setVisible] = useState(false);
  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api(
        needsSetup ? "/auth/setup" : "/auth/login",
        form,
      );
      onLogin(result.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-brand">
        <span className="brand-symbol">K</span>
        <span>科然数智</span>
      </div>
      <div className="auth-layout">
        <div className="auth-story">
          <span className="eyebrow">KERAN · BUSINESS INSIGHTS</span>
          <h1>
            让数据连接业务
            <br />
            让经营<span>看得见。</span>
          </h1>
          <p>
            从每一笔交易，到每一次决策。
            <br />
            在一个工作台，掌握企业经营全貌。
          </p>
          <div className="auth-art">
            <div className="art-top">
              <ChartNoAxesCombined size={18} />
              <span>经营，有迹可循</span>
              <i />
            </div>
            <div className="art-bars">
              {[32, 49, 39, 61, 52, 78, 68, 90, 83, 100, 92, 116].map(
                (v, i) => (
                  <div
                    key={i}
                    style={{ height: v, opacity: 0.35 + i * 0.05 }}
                  />
                ),
              )}
            </div>
            <div className="art-bottom">
              <span>连接数据</span>
              <span>洞察变化</span>
              <span>辅助决策</span>
            </div>
          </div>
        </div>
        <form className="auth-card" onSubmit={submit}>
          <span className="welcome-label">你的企业经营工作台</span>
          <h2>{needsSetup ? "开启数智经营" : "欢迎回来"}</h2>
          <p>
            {needsSetup
              ? "创建首位管理员，开始搭建你的工作空间。"
              : "登录科然数智，继续掌握经营动态。"}
          </p>
          <ErrorBox message={error} />
          {needsSetup && (
            <label>
              姓名
              <input
                name="name"
                autoComplete="name"
                value={form.name}
                onChange={update}
                maxLength={40}
                required
                placeholder="你的姓名"
              />
            </label>
          )}
          <label>
            账号
            <input
              name="username"
              autoComplete="username"
              value={form.username}
              onChange={update}
              pattern="[a-zA-Z0-9_.-]{3,40}"
              title="3～40 位字母、数字、点、横线或下划线"
              required
              placeholder={needsSetup ? "设置管理员账号" : "请输入账号"}
            />
          </label>
          <label>
            密码
            <div className="password-input">
              <input
                name="password"
                type={visible ? "text" : "password"}
                autoComplete={needsSetup ? "new-password" : "current-password"}
                value={form.password}
                onChange={update}
                minLength={needsSetup ? 12 : 1}
                maxLength={128}
                required
                placeholder={needsSetup ? "设置至少 12 位密码" : "请输入密码"}
              />
              <button
                type="button"
                aria-label={visible ? "隐藏密码" : "显示密码"}
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>
          {needsSetup && requiresSetupToken && (
            <label>
              初始化令牌
              <input
                name="setupToken"
                type="password"
                value={form.setupToken}
                onChange={update}
                required
                placeholder="由服务器管理员提供"
              />
            </label>
          )}
          <div className="auth-safe">
            <ShieldCheck size={15} />
            账号由企业管理员统一管理
          </div>
          <button className="primary auth-submit" disabled={busy}>
            {busy
              ? "正在安全连接…"
              : needsSetup
                ? "创建工作空间"
                : "进入工作台"}
            <ArrowRight size={17} />
          </button>
          <div className="auth-note">
            {needsSetup
              ? "请自行设置新密码，无需使用参考网站的账号。"
              : "如需开通账号，请联系企业管理员。"}
          </div>
        </form>
      </div>
      <footer>
        © {new Date().getFullYear()} 科然数智 <span>让经营看得见</span>
      </footer>
    </div>
  );
}

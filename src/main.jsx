import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  FileText,
  Upload,
  Users as UsersIcon,
  LogOut,
  ChevronRight,
  RefreshCw,
  Menu,
  X,
  ShieldCheck,
  ArrowUpRight,
  Info,
} from "lucide-react";
import { api, today, shiftDay, query } from "./api";
import { ErrorBox, Loading } from "./components/ui";
import Filters from "./components/Filters";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Records from "./pages/Records";
import Imports from "./pages/Imports";
import Users from "./pages/Users";
import "./styles.css";
const pages = {
  overview: {
    name: "老板工作台",
    description: "看清经营全貌，让每一次决策都有据可依。",
    icon: LayoutDashboard,
  },
  records: {
    name: "经营明细",
    description: "从汇总到明细，每一笔经营数据都可追溯。",
    icon: FileText,
  },
  imports: {
    name: "数据导入",
    description: "连接业务数据，建立统一的经营视图。",
    icon: Upload,
    admin: true,
  },
  users: {
    name: "团队与权限",
    description: "让合适的人，看到合适的数据。",
    icon: UsersIcon,
    admin: true,
  },
};
function App() {
  const [user, setUser] = useState(null);
  const [auth, setAuth] = useState(null);
  const [bootError, setBootError] = useState("");
  const [page, setPage] = useState(location.hash.slice(1) || "overview");
  const [filters, setFilters] = useState({
    start: shiftDay(today(), -29),
    end: today(),
    channel: "",
  });
  const [data, setData] = useState(null);
  const [channels, setChannels] = useState([]);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  async function boot() {
    try {
      const status = await api("/auth/status");
      setAuth(status);
      if (!status.needsSetup) {
        try {
          setUser((await api("/auth/me")).user);
        } catch (e) {
          if (e.status !== 401) throw e;
        }
      }
    } catch (e) {
      setBootError(e.message);
    }
  }
  useEffect(() => {
    boot();
    const handler = () => setPage(location.hash.slice(1) || "overview");
    addEventListener("hashchange", handler);
    return () => removeEventListener("hashchange", handler);
  }, []);
  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    setData(null);
    setError("");
    api("/overview" + query(filters))
      .then((r) => {
        if (active) {
          setData(r);
          setChannels(r.availableChannels);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          if (e.status === 401) setUser(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user, filters, revision]);
  const current =
    pages[page] && (!pages[page].admin || user?.role === "admin")
      ? page
      : "overview";
  function navigate(target) {
    location.hash = target;
    setPage(target);
    setMobile(false);
  }
  async function seedDemo() {
    setBusy(true);
    setError("");
    try {
      await api("/demo", {});
      setFilters({ start: shiftDay(today(), -29), end: today(), channel: "" });
      setRevision((r) => r + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function clearDemo() {
    setBusy(true);
    setError("");
    try {
      await api("/demo/clear", { confirm: "清除演示数据" });
      setClearOpen(false);
      setRevision((r) => r + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    try {
      await api("/auth/logout", {});
      setUser(null);
      setData(null);
      setAuth({ ...auth, needsSetup: false });
      location.hash = "";
    } catch (e) {
      setError(e.message);
    }
  }
  if (bootError)
    return (
      <div className="boot-error">
        <ErrorBox message={"连接服务失败：" + bootError} />
        <button className="secondary" onClick={() => location.reload()}>
          重新连接
        </button>
      </div>
    );
  if (!auth) return <Loading />;
  if (!user)
    return (
      <Auth
        {...auth}
        onLogin={(u) => {
          setUser(u);
          setAuth({ ...auth, needsSetup: false });
        }}
      />
    );
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (mobile ? "mobile-open" : "")}>
        <a className="brand" href="#overview" aria-label="科然数智工作台">
          <span className="brand-symbol">K</span>
          <span>
            科然数智<small>KERAN INSIGHTS</small>
          </span>
        </a>
        <div className="workspace-switch">
          <span className="workspace-avatar">科</span>
          <div>
            <b>企业经营空间</b>
            <small>内部协作工作台</small>
          </div>
          <ShieldCheck size={15} />
        </div>
        <div className="nav-label">经营管理</div>
        <nav aria-label="主导航">
          {Object.entries(pages)
            .filter(([, p]) => !p.admin || user.role === "admin")
            .map(([key, { name, icon: Icon }]) => (
              <a
                href={"#" + key}
                key={key}
                onClick={() => {
                  setMobile(false);
                  setPage(key);
                }}
                className={current === key ? "active" : ""}
                aria-current={current === key ? "page" : undefined}
              >
                <Icon size={19} />
                <span>{name}</span>
                {current === key && <ChevronRight size={14} />}
              </a>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-motto">
            <div className="motto-line" />
            数智驱动经营<small>让每一份数据，都产生价值</small>
          </div>
          <div className="sidebar-status">
            <i className="live-dot" />
            本地开发环境 <span>v0.1</span>
          </div>
        </div>
      </aside>
      {mobile && (
        <div className="sidebar-scrim" onClick={() => setMobile(false)} />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="打开导航"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <span>工作台</span>
            <ChevronRight size={14} />
            <b>{pages[current].name}</b>
          </div>
          <div className="topbar-right">
            <span className="today-label">
              {new Intl.DateTimeFormat("zh-CN", {
                timeZone: "Asia/Shanghai",
                month: "long",
                day: "numeric",
                weekday: "long",
              }).format(new Date())}
            </span>
            <span className="topbar-divider" />
            <span className="avatar">{user.name.slice(0, 1)}</span>
            <div className="user-profile">
              <b>{user.name}</b>
              <small>{user.role === "admin" ? "企业管理员" : "只读成员"}</small>
            </div>
            <button
              className="icon-button"
              aria-label="退出登录"
              title="退出登录"
              onClick={logout}
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">BUSINESS WORKSPACE</div>
              <h1>
                {pages[current].name}
                <span className="heading-dot" />
              </h1>
              <p>{pages[current].description}</p>
            </div>
            <button
              className="secondary refresh"
              disabled={loading}
              onClick={() => setRevision((r) => r + 1)}
            >
              <RefreshCw size={15} className={loading ? "spin" : ""} />
              刷新数据
            </button>
          </div>
          {data?.hasDemo && (
            <div className="demo-banner">
              <Info size={16} />
              <span>
                当前展示合成演示数据，仅用于体验功能，不代表真实经营情况。
              </span>
              {user.role === "admin" && (
                <button onClick={() => setClearOpen(true)}>
                  清除演示数据 <ChevronRight size={13} />
                </button>
              )}
            </div>
          )}
          {["overview", "records"].includes(current) && (
            <Filters
              filters={filters}
              setFilters={setFilters}
              channels={channels}
            />
          )}
          <ErrorBox message={error} />
          {current === "overview" ? (
            loading ? (
              <Loading />
            ) : data ? (
              <Dashboard
                data={data}
                user={user}
                navigate={navigate}
                seedDemo={seedDemo}
                busy={busy}
              />
            ) : null
          ) : current === "records" ? (
            <Records filters={filters} revision={revision} />
          ) : current === "imports" ? (
            <Imports
              onImported={() => setRevision((r) => r + 1)}
              hasDemo={data?.hasDemo}
              clearDemo={() => setClearOpen(true)}
            />
          ) : (
            <Users />
          )}
          <footer className="app-footer">
            <span>© {new Date().getFullYear()} 科然数智</span>
            <span>
              <ShieldCheck size={12} />
              企业内部工作空间
            </span>
          </footer>
        </main>
      </div>
      {clearOpen && (
        <div className="modal-backdrop">
          <section
            className="modal confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-demo-title"
          >
            <h2 id="clear-demo-title">清除合成演示数据？</h2>
            <p>
              将移除系统生成的演示记录和演示导入批次。账号和真实经营数据会保留。之后可导入自己的数据。
            </p>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setClearOpen(false)}>
                取消
              </button>
              <button className="primary" disabled={busy} onClick={clearDemo}>
                {busy ? "正在清除…" : "确认清除演示数据"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);

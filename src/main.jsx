import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Menu,
  Grid2X2,
  Search,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  X,
  RefreshCw,
  House,
  Database,
  ShoppingBag,
  ChartNoAxesCombined,
  UsersRound,
  ShoppingCart,
  ChartColumnBig,
  Network,
  Presentation,
  Image,
  Settings,
  LogOut,
  FileText,
  Upload,
  ShieldCheck,
  ArrowRight,
  Info,
} from "lucide-react";
import { api, today, shiftDay, query } from "./api";
import { Loading, ErrorBox } from "./components/ui";
import Filters from "./components/Filters";
import Dialog from "./components/Dialog";
import MetricDetail from "./components/MetricDetail";
import WorkbenchSettings from "./components/WorkbenchSettings";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Records from "./pages/Records";
import Imports from "./pages/Imports";
import Users from "./pages/Users";
import Expenses from "./pages/Expenses";
import Accounting from "./pages/Accounting";
import CompanyFinance from "./pages/CompanyFinance";
import { panelKeys, visitTab, closeTab } from "./workbench.mjs";
import catalog from "./reference-catalog.json";
import "./styles.css";
import "./reference.css";

const pageDefinitions = {
  home: { title: "工作台", group: "workbench", icon: House },
  overview: {
    title: "老板工作台",
    group: "workbench",
    icon: ChartNoAxesCombined,
  },
  quick: { title: "快捷工作", group: "workbench", icon: Grid2X2 },
  records: { title: "经营明细", group: "finance", icon: FileText },
  financeCompany: {
    title: "公司经营总览",
    group: "finance",
    icon: ChartNoAxesCombined,
  },
  financeAccounting: { title: "核算中心", group: "finance", icon: Database },
  financeExpenses: { title: "费用管理", group: "finance", icon: FileText },
  imports: { title: "数据导入", group: "system", icon: Upload, admin: true },
  users: {
    title: "团队与权限",
    group: "system",
    icon: UsersRound,
    admin: true,
  },
};
const moduleIcons = {
  workbench: House,
  finance: Database,
  product: ShoppingBag,
  operations: ChartNoAxesCombined,
  customer: UsersRound,
  supply: ShoppingCart,
  talent: ChartColumnBig,
  collaboration: Network,
  dataAI: Presentation,
  visualWorkbench: Image,
  system: Settings,
};
const routeActions = {
  "/index": "home",
  "/workspace/owner": "overview",
  "/workspace/quick": "quick",
  "/workspace/settings": "settings",
  "/shujufenxi": "financeCompany",
  "/caiwuduizhang/erphesaun": "financeAccounting",
  "/caiwuduizhang/expense": "financeExpenses",
};
function App() {
  const [auth, setAuth] = useState(null),
    [user, setUser] = useState(null),
    [bootError, setBootError] = useState("");
  const [page, setPage] = useState(location.hash.slice(1) || "overview"),
    [tabs, setTabs] = useState(["home", "overview"]);
  const [filters, setFilters] = useState({
      start: shiftDay(today(), -29),
      end: today(),
      channel: "",
    }),
    [recordScope, setRecordScope] = useState({});
  const [data, setData] = useState(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false),
    [directory, setDirectory] = useState(null),
    [searchOpen, setSearchOpen] = useState(false),
    [search, setSearch] = useState("");
  const [profile, setProfile] = useState(false),
    [tabMenu, setTabMenu] = useState(false),
    [settings, setSettings] = useState(false),
    [visiblePanels, setVisiblePanels] = useState(panelKeys),
    [metric, setMetric] = useState(null),
    [clearOpen, setClearOpen] = useState(false);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const status = await api("/auth/status");
        if (!active) return;
        setAuth(status);
        if (!status.needsSetup) {
          try {
            const result = await api("/auth/me");
            if (active) setUser(result.user);
          } catch (e) {
            if (e.status !== 401) throw e;
          }
        }
      } catch (e) {
        if (active) setBootError(e.message);
      }
    })();
    const hash = () => {
      const target = location.hash.slice(1) || "overview";
      setPage(target);
      if (pageDefinitions[target])
        setTabs((previous) => visitTab(previous, target));
    };
    const hotkey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (event.target.closest?.('[role="dialog"]')) return;
        setSearchOpen((value) => !value);
      }
    };
    window.addEventListener("hashchange", hash);
    window.addEventListener("keydown", hotkey);
    return () => {
      active = false;
      window.removeEventListener("hashchange", hash);
      window.removeEventListener("keydown", hotkey);
    };
  }, []);
  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    setError("");
    api("/overview" + query(filters))
      .then((result) => {
        if (active) setData(result);
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setData(null);
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
  useEffect(() => {
    if (!user) return;
    let active = true;
    api("/preferences")
      .then((result) => {
        if (active) setVisiblePanels(result.visiblePanels);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [user]);
  const current =
    pageDefinitions[page] &&
    (!pageDefinitions[page].admin || user?.role === "admin")
      ? page
      : "overview";
  const activeGroup = pageDefinitions[current].group;
  const allowedPages = Object.keys(pageDefinitions).filter(
    (key) => !pageDefinitions[key].admin || user?.role === "admin",
  );
  const directoryGroup = catalog.groups.find((group) => group.id === directory);
  const searchEntries = useMemo(
    () => [
      ...catalog.groups.flatMap((group) =>
        group.entries.map((entry, index) => ({
          ...entry,
          id: `${group.id}:${index}`,
          module: group.title,
          action: entry.paths.map((path) => routeActions[path]).find(Boolean),
        })),
      ),
      ...["records", "imports", "users"].map((key) => ({
        id: key,
        title: pageDefinitions[key].title,
        module: "本地数据与管理",
        action: key,
        paths: [],
      })),
    ],
    [],
  );
  function openDirectory(group) {
    setDirectory(group);
    setExpanded(false);
    setProfile(false);
    setTabMenu(false);
  }
  function navigate(target) {
    if (target === "settings") {
      setDirectory(null);
      setSearchOpen(false);
      setSettings(true);
      return;
    }
    if (!allowedPages.includes(target)) return;
    location.hash = target;
    setPage(target);
    setTabs((previous) => visitTab(previous, target));
    setExpanded(false);
    setDirectory(null);
    setSearchOpen(false);
    setProfile(false);
    setTabMenu(false);
  }
  function closeOne(target) {
    const result = closeTab(tabs, target, current);
    setTabs(result.tabs);
    if (result.active !== current) {
      location.hash = result.active;
      setPage(result.active);
    }
  }
  function onRecords(scope = {}) {
    setMetric(null);
    setRecordScope({
      ...(scope.shop ? { shop: scope.shop } : {}),
      ...(scope.product ? { product: scope.product } : {}),
      ...(scope.channel ? { channel: scope.channel } : {}),
    });
    navigate("records");
  }
  async function seedDemo() {
    setBusy(true);
    setError("");
    try {
      await api("/demo", {});
      setFilters({ start: shiftDay(today(), -29), end: today(), channel: "" });
      setRevision((value) => value + 1);
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
      setRevision((value) => value + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function savePanels(selected) {
    const result = await api("/preferences", { visiblePanels: selected });
    setVisiblePanels(result.visiblePanels);
  }
  async function logout() {
    try {
      await api("/auth/logout", {});
      setUser(null);
      setData(null);
      setVisiblePanels(panelKeys);
      setTabs(["home", "overview"]);
      setProfile(false);
      setMetric(null);
      setAuth({ ...auth, needsSetup: false });
      location.hash = "overview";
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
        onLogin={(account) => {
          setAuth((previous) => ({ ...previous, needsSetup: false }));
          setUser(account);
        }}
      />
    );
  const utilities = (
    <div className="directory-utilities">
      <h3>本地数据与管理</h3>
      {["records", "imports", "users"]
        .filter((key) => allowedPages.includes(key))
        .map((key) => {
          const Icon = pageDefinitions[key].icon;
          return (
            <button key={key} onClick={() => navigate(key)}>
              <Icon size={17} />
              {pageDefinitions[key].title}
              <ChevronRight size={14} />
            </button>
          );
        })}
    </div>
  );
  return (
    <div className={"reference-shell " + (expanded ? "rail-expanded" : "")}>
      <aside className="reference-rail" aria-label="经营模块导航">
        <a
          href="#overview"
          className="rail-brand"
          aria-label="科然数智，老板工作台"
        >
          <span>K</span>
          {expanded && (
            <b>
              科然数智<small>KERAN INSIGHTS</small>
            </b>
          )}
        </a>
        <nav>
          {catalog.groups.map((group) => {
            const Icon = moduleIcons[group.id] || Grid2X2;
            return (
              <button
                key={group.id}
                aria-label={group.title}
                title={group.title}
                className={activeGroup === group.id ? "selected" : ""}
                onClick={() => {
                  openDirectory(group.id);
                }}
              >
                <Icon size={21} />
                {expanded && <span>{group.title}</span>}
              </button>
            );
          })}
        </nav>
        {expanded && (
          <div className="rail-motto">
            数智驱动经营<small>KERAN INSIGHTS</small>
          </div>
        )}
      </aside>
      {expanded && (
        <button
          className="rail-overlay"
          aria-label="关闭模块导航"
          onClick={() => setExpanded(false)}
        />
      )}
      <div className="reference-content">
        <header className="reference-header">
          <div className="reference-toolbar">
            <button
              className="icon-button"
              aria-label="展开导航"
              onClick={() => setExpanded(!expanded)}
            >
              <Menu size={19} />
            </button>
            <div className="reference-breadcrumb">
              <button onClick={() => navigate("home")}>工作台</button>
              {activeGroup !== "workbench" && (
                <>
                  <span>/</span>
                  <button onClick={() => openDirectory(activeGroup)}>
                    {
                      catalog.groups.find((group) => group.id === activeGroup)
                        ?.title
                    }
                  </button>
                </>
              )}
              <span>/</span>
              <b>{pageDefinitions[current].title}</b>
            </div>
            <div className="reference-toolbar-actions">
              <button
                className="toolbar-directory"
                aria-label="打开当前模块页面目录"
                onClick={() => openDirectory(activeGroup)}
              >
                <Grid2X2 size={15} />
                目录
              </button>
              <button
                className="toolbar-search"
                aria-label="搜索页面和功能，快捷键 Control K"
                title="搜索页面和功能 (Ctrl K)"
                onClick={() => setSearchOpen(true)}
              >
                <Search size={18} />
              </button>
              <div className="profile-anchor">
                <button
                  className="reference-user"
                  aria-expanded={profile}
                  aria-label={user.name + "，打开账户菜单"}
                  onClick={() => setProfile(!profile)}
                >
                  <span className="reference-avatar">
                    {user.name.slice(0, 1)}
                  </span>
                  <span>
                    {user.name}
                    <small>科然经营空间</small>
                  </span>
                  <ChevronDown size={12} />
                </button>
                {profile && (
                  <div className="profile-menu">
                    <div>
                      {user.username}
                      <small>
                        {user.role === "admin" ? "管理员" : "只读成员"}
                      </small>
                    </div>
                    {allowedPages.includes("imports") && (
                      <button onClick={() => navigate("imports")}>
                        数据导入
                      </button>
                    )}
                    {allowedPages.includes("users") && (
                      <button onClick={() => navigate("users")}>
                        团队与权限
                      </button>
                    )}
                    <button onClick={logout}>
                      <LogOut size={14} />
                      退出登录
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="reference-tags">
            <div className="reference-tags-list">
              {tabs
                .filter((key) => allowedPages.includes(key))
                .map((key) => {
                  const Icon = pageDefinitions[key].icon;
                  return (
                    <span
                      className={
                        "reference-tag " + (current === key ? "active" : "")
                      }
                      key={key}
                    >
                      <button onClick={() => navigate(key)}>
                        <Icon size={12} />
                        {pageDefinitions[key].title}
                      </button>
                      {key !== "home" && (
                        <button
                          className="tag-close"
                          aria-label={
                            "关闭" + pageDefinitions[key].title + "标签"
                          }
                          onClick={() => closeOne(key)}
                        >
                          <X size={11} />
                        </button>
                      )}
                    </span>
                  );
                })}
            </div>
            <div className="tag-menu-anchor">
              <button
                className="icon-button"
                aria-label="页面标签操作"
                onClick={() => setTabMenu(!tabMenu)}
              >
                <ChevronDown size={13} />
              </button>
              {tabMenu && (
                <div className="tag-context-menu">
                  <button
                    onClick={() => {
                      setTabs(
                        current === "home" ? ["home"] : ["home", current],
                      );
                      setTabMenu(false);
                    }}
                  >
                    关闭其他标签
                  </button>
                  <button
                    onClick={() => {
                      setTabs(["home"]);
                      location.hash = "home";
                      setPage("home");
                      setTabMenu(false);
                    }}
                  >
                    关闭全部标签
                  </button>
                </div>
              )}
            </div>
            <button
              className="reference-refresh"
              disabled={loading}
              onClick={() => setRevision((value) => value + 1)}
            >
              <RefreshCw size={12} className={loading ? "spin" : ""} />
              刷新
            </button>
          </div>
        </header>
        <main
          className={
            "reference-main " + (current === "overview" ? "is-cockpit" : "")
          }
        >
          <ErrorBox message={error} />
          {!data && !loading && (
            <div className="oc-onboarding">
              <span>经营数据未加载，可恢复有效周期后重试。</span>
              <button
                className="secondary"
                onClick={() => {
                  setFilters({
                    start: shiftDay(today(), -29),
                    end: today(),
                    channel: "",
                  });
                  setRecordScope({});
                  setRevision((value) => value + 1);
                }}
              >
                恢复近30天并重试
              </button>
            </div>
          )}
          {data?.hasDemo && (
            <div className="reference-demo">
              <Info size={13} />
              <span>合成演示数据 · 非真实经营数据</span>
              {user.role === "admin" && (
                <button onClick={() => setClearOpen(true)}>清除演示数据</button>
              )}
            </div>
          )}
          {current === "overview" ? (
            loading ? (
              <Loading />
            ) : (
              data && (
                <Dashboard
                  data={data}
                  user={user}
                  navigate={navigate}
                  seedDemo={seedDemo}
                  busy={busy}
                  filters={filters}
                  setFilters={setFilters}
                  onMetric={setMetric}
                  onRecords={onRecords}
                  visiblePanels={visiblePanels}
                  onSettings={() => setSettings(true)}
                />
              )
            )
          ) : current === "financeCompany" ? (
            <CompanyFinance
              user={user}
              revision={revision}
              navigate={navigate}
              onRecords={(scope, period) => {
                setFilters({
                  start: period.start,
                  end: period.end,
                  channel: "",
                });
                onRecords(scope);
              }}
            />
          ) : current === "financeAccounting" ? (
            <Accounting
              user={user}
              revision={revision}
              onChanged={() => setRevision((value) => value + 1)}
            />
          ) : current === "financeExpenses" ? (
            <Expenses
              user={user}
              revision={revision}
              onChanged={() => setRevision((value) => value + 1)}
            />
          ) : current === "records" ? (
            <>
              <Filters
                filters={{ ...filters, channel: recordScope.channel || "" }}
                setFilters={(update) => {
                  const next =
                    typeof update === "function"
                      ? update({
                          ...filters,
                          channel: recordScope.channel || "",
                        })
                      : update;
                  setFilters({ start: next.start, end: next.end, channel: "" });
                  setRecordScope((previous) => ({
                    ...previous,
                    channel: next.channel,
                  }));
                }}
                channels={data?.availableChannels || []}
              />
              <Records
                filters={filters}
                scope={recordScope}
                onClearScope={() => setRecordScope({})}
                revision={revision}
              />
            </>
          ) : current === "imports" ? (
            <Imports
              onImported={() => setRevision((value) => value + 1)}
              hasDemo={data?.hasDemo}
              clearDemo={() => setClearOpen(true)}
            />
          ) : current === "users" ? (
            <Users />
          ) : (
            <section className="reference-quick">
              <header>
                <h1>{current === "quick" ? "快捷工作" : "工作台"}</h1>
                <p>从常用入口开始，查看经营数据与团队工作。</p>
              </header>
              <div className="quick-cards">
                {["overview", "records", "imports", "users"]
                  .filter((key) => allowedPages.includes(key))
                  .map((key) => {
                    const Icon = pageDefinitions[key].icon;
                    return (
                      <button key={key} onClick={() => navigate(key)}>
                        <Icon size={24} />
                        <b>{pageDefinitions[key].title}</b>
                        <span>
                          进入页面 <ArrowRight size={13} />
                        </span>
                      </button>
                    );
                  })}
              </div>
              <h2>经营模块</h2>
              <div className="module-cards">
                {catalog.groups.map((group) => {
                  const Icon = moduleIcons[group.id] || Grid2X2;
                  return (
                    <button
                      key={group.id}
                      onClick={() => openDirectory(group.id)}
                    >
                      <Icon size={20} />
                      <div>
                        <b>{group.title}</b>
                        <small>{group.description}</small>
                      </div>
                      <ChevronRight size={16} />
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </main>
      </div>
      {directoryGroup && (
        <Dialog
          title={directoryGroup.title}
          subtitle={directoryGroup.description}
          onClose={() => setDirectory(null)}
          className="directory-dialog"
        >
          <div className="directory-note">
            本模块已启用{" "}
            {
              directoryGroup.entries.filter((entry) =>
                entry.paths.some((path) => routeActions[path]),
              ).length
            }{" "}
            / {directoryGroup.entries.length}{" "}
            个入口；标注“待还原”的功能尚未开发完成。
          </div>
          {Object.entries(
            Object.groupBy(
              directoryGroup.entries,
              (entry) => entry.section || "模块页面",
            ),
          ).map(([section, entries]) => (
            <section className="directory-section" key={section}>
              <h3>{section}</h3>
              <div>
                {entries.map((entry, index) => {
                  const action = entry.paths
                    .map((path) => routeActions[path])
                    .find(Boolean);
                  return (
                    <button
                      key={index}
                      disabled={!action}
                      onClick={() => navigate(action)}
                    >
                      <span>{entry.title}</span>
                      {action ? (
                        <ChevronRight size={15} />
                      ) : (
                        <small>待还原</small>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          {utilities}
        </Dialog>
      )}
      {searchOpen && (
        <Dialog
          title="搜索页面和功能"
          subtitle="Control K 快速打开"
          onClose={() => setSearchOpen(false)}
          className="search-dialog"
        >
          <div className="reference-search-input">
            <Search size={17} />
            <input
              autoFocus
              aria-label="搜索页面"
              placeholder="输入页面或模块名称"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="search-results">
            {searchEntries
              .filter(
                (entry) =>
                  (!pageDefinitions[entry.action]?.admin ||
                    user.role === "admin") &&
                  (!search ||
                    `${entry.title}${entry.module}`
                      .toLowerCase()
                      .includes(search.toLowerCase())),
              )
              .slice(0, 35)
              .map((entry) => (
                <button
                  key={entry.id}
                  disabled={!entry.action}
                  onClick={() => navigate(entry.action)}
                >
                  <div>
                    <b>{entry.title}</b>
                    <small>{entry.module}</small>
                  </div>
                  {entry.action ? (
                    <ArrowRight size={15} />
                  ) : (
                    <small>待还原</small>
                  )}
                </button>
              ))}
          </div>
        </Dialog>
      )}
      {settings && (
        <WorkbenchSettings
          visiblePanels={visiblePanels}
          onSave={savePanels}
          onClose={() => setSettings(false)}
        />
      )}{" "}
      {metric && data && (
        <MetricDetail
          key={metric}
          metric={metric}
          data={data}
          onClose={() => setMetric(null)}
          onMetric={setMetric}
          onRecords={onRecords}
        />
      )}{" "}
      {clearOpen && (
        <Dialog
          title="清除合成演示数据？"
          onClose={() => setClearOpen(false)}
          className="clear-dialog"
        >
          <p>仅移除系统合成的演示记录和批次，账号与真实经营数据会保留。</p>
          <footer>
            <button className="secondary" onClick={() => setClearOpen(false)}>
              取消
            </button>
            <button className="primary" disabled={busy} onClick={clearDemo}>
              {busy ? "正在清除…" : "确认清除演示数据"}
            </button>
          </footer>
        </Dialog>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);

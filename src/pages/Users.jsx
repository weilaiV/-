import React, { useEffect, useState } from "react";
import { UserPlus, ShieldCheck, Users as UsersIcon, X } from "lucide-react";
import { api } from "../api";
import { DataTable, ErrorBox, Panel, Loading } from "../components/ui";
export default function Users() {
  const [users, setUsers] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    username: "",
    name: "",
    password: "",
    role: "viewer",
  });
  function load() {
    api("/users")
      .then((r) => setUsers(r.users))
      .catch((e) => setError(e.message));
  }
  useEffect(load, []);
  async function save(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api("/users", form);
      setOpen(false);
      setForm({ username: "", name: "", password: "", role: "viewer" });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Panel
        title="团队账号"
        icon={UsersIcon}
        extra={
          <button
            className="primary"
            onClick={() => {
              setError("");
              setOpen(true);
            }}
          >
            <UserPlus size={16} />
            新增账号
          </button>
        }
      >
        <ErrorBox message={!open ? error : ""} />
        {users ? (
          <DataTable headers={["姓名", "登录账号", "角色", "权限范围"]}>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <span className="user-cell">
                    <span className="avatar small-avatar">
                      {u.name.slice(0, 1)}
                    </span>
                    {u.name}
                  </span>
                </td>
                <td>{u.username}</td>
                <td>
                  <span
                    className={
                      "tag " + (u.role === "admin" ? "gold" : "neutral")
                    }
                  >
                    {u.role === "admin" ? "管理员" : "只读成员"}
                  </span>
                </td>
                <td className="muted">
                  {u.role === "admin"
                    ? "查看经营数据、导入数据、管理账号"
                    : "查看经营驾驶舱与明细"}
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <Loading />
        )}
        <div className="permissions-note">
          <ShieldCheck size={17} />
          账号和权限由企业内部管理员维护，成员无法自行注册。
        </div>
      </Panel>
      {open && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-user-title"
          >
            <div className="modal-heading">
              <h2 id="new-user-title">新增团队账号</h2>
              <button aria-label="关闭" onClick={() => setOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={save}>
              <ErrorBox message={error} />
              <label>
                姓名
                <input
                  required
                  name="name"
                  autoComplete="off"
                  maxLength={40}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label>
                登录账号
                <input
                  required
                  name="username"
                  autoComplete="off"
                  pattern="[a-zA-Z0-9_.-]{3,40}"
                  title="3～40 位字母、数字、点、横线或下划线"
                  value={form.username}
                  onChange={(e) =>
                    setForm({ ...form, username: e.target.value })
                  }
                />
              </label>
              <label>
                初始密码
                <input
                  required
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  placeholder="至少 12 位，请单独告知该成员"
                />
              </label>
              <label>
                角色
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  <option value="viewer">只读成员</option>
                  <option value="admin">管理员</option>
                </select>
              </label>
              <button className="primary" disabled={busy}>
                {busy ? "正在创建…" : "创建账号"}
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

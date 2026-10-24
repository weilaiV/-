import React, { useState } from "react";
import Dialog from "./Dialog";
import { panelKeys, panelLabels } from "../workbench.mjs";
import { ErrorBox } from "./ui";
export default function WorkbenchSettings({ visiblePanels, onSave, onClose }) {
  const [selected, setSelected] = useState(visiblePanels);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    try {
      await onSave(selected);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="工作台配置"
      subtitle="按你的工作习惯调整展示内容"
      onClose={onClose}
      className="settings-dialog"
    >
      <ErrorBox message={error} />
      <div className="settings-tools">
        <span>展示板块</span>
        <button className="text-button" onClick={() => setSelected(panelKeys)}>
          恢复默认
        </button>
      </div>
      <div className="settings-grid">
        {panelKeys.map((key) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={selected.includes(key)}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...selected, key]
                    : selected.filter((item) => item !== key),
                )
              }
            />
            {panelLabels[key]}
          </label>
        ))}
      </div>
      <p className="settings-note">
        配置只影响你的工作台展示，不会修改经营数据或其他成员的配置。
      </p>
      <footer>
        <button className="secondary" onClick={onClose}>
          取消
        </button>
        <button className="primary" onClick={save} disabled={busy}>
          {busy ? "正在保存…" : "保存配置"}
        </button>
      </footer>
    </Dialog>
  );
}

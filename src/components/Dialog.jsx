import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
export default function Dialog({
  title,
  subtitle,
  onClose,
  children,
  className = "",
  drawer = false,
}) {
  const node = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node.current?.focus();
    function key(event) {
      if (event.key === "Escape") {
        event.stopPropagation();
        close.current();
      }
      if (event.key === "Tab") {
        const items = [
          ...node.current.querySelectorAll(
            'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]',
          ),
        ].filter((item) => item.getClientRects().length);
        if (!items.length) {
          event.preventDefault();
          return;
        }
        const first = items[0],
          last = items.at(-1);
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === node.current)
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === node.current)
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className={"reference-modal-backdrop " + (drawer ? "as-drawer" : "")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={node}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={"reference-dialog " + className}
      >
        <header>
          <div>
            {subtitle && <p>{subtitle}</p>}
            <h2>{title}</h2>
          </div>
          <button
            className="icon-button"
            aria-label={"关闭" + title}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useCockpitStore } from "@/lib/store";
import type { ViewType } from "@/lib/store";

const shortcuts = [
  { keys: ["j", "k"], description: "Navigate issue list" },
  { keys: ["↑", "↓"], description: "Navigate issue list (arrows)" },
  { keys: ["1"], description: "Draft Jira ticket" },
  { keys: ["2"], description: "Close issue" },
  { keys: ["3"], description: "Mark as investigate" },
  { keys: ["4"], description: "Add to watchlist" },
  { keys: ["s"], description: "Suppress issue" },
  { keys: ["u"], description: "Undo last decision" },
  { keys: ["/"], description: "Focus search bar" },
  { keys: ["?"], description: "Toggle this help" },
  { keys: ["Esc"], description: "Close modal / deselect" },
];

function Key({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px",
      background: "#1C2333", border: "1px solid #1F2D45",
      borderRadius: "2px", padding: "2px 6px", color: "#9BAAC4",
      display: "inline-block", minWidth: "22px", textAlign: "center",
    }}>
      {children}
    </span>
  );
}

export function KeyboardHints() {
  const { keyboardHintsOpen, setKeyboardHintsOpen, setCurrentView } = useCockpitStore();

  return (
    <DialogPrimitive.Root open={keyboardHintsOpen} onOpenChange={setKeyboardHintsOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="sta-modal-overlay" />
        <DialogPrimitive.Content
          aria-label="Keyboard shortcuts"
          style={{
            position: "fixed", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(400px, calc(100vw - 2rem))",
            zIndex: 51,
          }}
        >
          <div className="sta-modal">
            <div className="sta-modal-header">
              <DialogPrimitive.Title style={{ margin: 0, font: "inherit", display: "inline" }}>
                Keyboard Shortcuts
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Description className="sr-only">
              Navigate the cockpit faster with these keyboard shortcuts.
            </DialogPrimitive.Description>

            <div style={{ padding: "8px 0" }}>
              {shortcuts.map((s, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 20px",
                    borderBottom: i < shortcuts.length - 1 ? "1px solid #1a1f28" : "none",
                  }}
                >
                  <span style={{ fontSize: "13px", color: "#9BAAC4" }}>{s.description}</span>
                  <div style={{ display: "flex", gap: "4px", marginLeft: "16px", flexShrink: 0 }}>
                    {s.keys.map((k, j) => <Key key={j}>{k}</Key>)}
                  </div>
                </div>
              ))}
            </div>

            <div className="sta-modal-footer" style={{ justifyContent: "space-between" }}>
              <button
                className="sta-btn"
                onClick={() => {
                  setKeyboardHintsOpen(false);
                  setCurrentView("help" as ViewType);
                }}
                style={{ color: "#2DD4BF" }}
              >
                Full guide →
              </button>
              <button className="sta-btn" onClick={() => setKeyboardHintsOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

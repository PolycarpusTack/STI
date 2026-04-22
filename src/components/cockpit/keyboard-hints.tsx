"use client";

import { useCockpitStore } from "@/lib/store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const shortcuts = [
  { keys: ["↑", "↓"], description: "Navigate issue list" },
  { keys: ["Enter"], description: "Select issue" },
  { keys: ["1"], description: "Draft Jira ticket" },
  { keys: ["2"], description: "Close issue" },
  { keys: ["3"], description: "Mark as investigate" },
  { keys: ["4"], description: "Add to watchlist" },
  { keys: ["S"], description: "Suppress issue" },
  { keys: ["U"], description: "Undo last decision" },
  { keys: ["/"], description: "Focus search bar" },
  { keys: ["?"], description: "Toggle this help" },
  { keys: ["Esc"], description: "Close modal / deselect" },
];

export function KeyboardHints() {
  const { keyboardHintsOpen, setKeyboardHintsOpen } = useCockpitStore();

  return (
    <Dialog
      open={keyboardHintsOpen}
      onOpenChange={setKeyboardHintsOpen}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Navigate the cockpit faster with these keyboard shortcuts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 py-2">
          {shortcuts.map((shortcut, i) => (
            <div key={i}>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-sm text-foreground">
                  {shortcut.description}
                </span>
                <div className="flex items-center gap-1">
                  {shortcut.keys.map((key, j) => (
                    <kbd
                      key={j}
                      className="inline-flex items-center justify-center rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs font-medium text-foreground min-w-[1.75rem]"
                    >
                      {key}
                    </kbd>
                  ))}
                </div>
              </div>
              {i < shortcuts.length - 1 && <Separator />}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

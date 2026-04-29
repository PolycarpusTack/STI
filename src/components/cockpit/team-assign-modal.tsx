"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { getIsoWeek, formatWeekRange } from "@/lib/iso-week";

interface TeamRole {
  id: string;
  name: string;
  sortOrder: number;
}

interface TeamMember {
  id: string;
  name: string;
  defaultRoleId: string | null;
}

interface RotaWeek {
  id: string;
  isoYear: number;
  isoWeek: number;
}

interface TeamAssignModalProps {
  open: boolean;
  onClose: () => void;
  /** If provided, editing an existing rota week. If null, assigning a new week. */
  editRota: { id: string; isoYear: number; isoWeek: number; notes: string; assignments: Record<string, string> } | null;
}

const MONO: React.CSSProperties = {
  fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)",
};

function buildUpcomingWeeks(existingRotas: RotaWeek[], count = 12): Array<{ isoYear: number; isoWeek: number }> {
  const { isoYear, isoWeek } = getIsoWeek(new Date());
  const existing = new Set(existingRotas.map((r) => `${r.isoYear}-${r.isoWeek}`));
  const result: Array<{ isoYear: number; isoWeek: number }> = [];
  let y = isoYear;
  let w = isoWeek + 1;
  while (result.length < count) {
    // Advance week, handling year-end (week 52/53 → week 1 of next year)
    if (w > 52) {
      // Check if isoYear has week 53
      const dec28 = new Date(Date.UTC(y, 11, 28));
      const lastWeek = getIsoWeek(dec28).isoWeek;
      if (w > lastWeek) { w = 1; y++; }
    }
    if (!existing.has(`${y}-${w}`)) {
      result.push({ isoYear: y, isoWeek: w });
    }
    w++;
  }
  return result;
}

export function TeamAssignModal({ open, onClose, editRota }: TeamAssignModalProps) {
  const queryClient = useQueryClient();

  const { data: roles = [] } = useQuery<TeamRole[]>({
    queryKey: ["team-roles"],
    queryFn: () => fetch("/api/team/roles").then((r) => r.json()),
    enabled: open,
  });

  const { data: members = [] } = useQuery<TeamMember[]>({
    queryKey: ["team-members"],
    queryFn: () => fetch("/api/team/members").then((r) => r.json()),
    enabled: open,
  });

  const { data: rotaWeeks = [] } = useQuery<RotaWeek[]>({
    queryKey: ["team-rota"],
    queryFn: () => fetch("/api/team/rota").then((r) => r.json()),
    enabled: open && !editRota,
  });

  const upcomingWeeks = buildUpcomingWeeks(rotaWeeks);

  const [selectedWeek, setSelectedWeek] = useState<{ isoYear: number; isoWeek: number } | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [showAllFor, setShowAllFor] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editRota) {
      setSelectedWeek({ isoYear: editRota.isoYear, isoWeek: editRota.isoWeek });
      setAssignments(editRota.assignments);
      setNotes(editRota.notes);
    } else {
      setSelectedWeek(upcomingWeeks[0] ?? null);
      setAssignments({});
      setNotes("");
    }
    setShowAllFor(new Set());
  }, [open, editRota]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const week = editRota ?? selectedWeek;
      if (!week) return;
      const body = {
        isoYear: week.isoYear,
        isoWeek: week.isoWeek,
        notes,
        assignments: Object.entries(assignments)
          .filter(([, memberId]) => memberId)
          .map(([roleId, memberId]) => ({ roleId, memberId })),
      };
      const res = await fetch("/api/team/rota", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-rota"] });
      onClose();
    },
  });

  if (!open) return null;

  const isEdit = !!editRota;
  const currentWeek = isEdit ? { isoYear: editRota.isoYear, isoWeek: editRota.isoWeek } : selectedWeek;
  const weekLabel = currentWeek
    ? `Week ${currentWeek.isoWeek} · ${formatWeekRange(currentWeek.isoYear, currentWeek.isoWeek)}`
    : "—";

  function membersForRole(role: TeamRole): TeamMember[] {
    if (showAllFor.has(role.id)) return members;
    return members.filter((m) => m.defaultRoleId === role.id);
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(7,11,18,0.8)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
      }}
    >
      <div style={{
        background: "#111827", border: "1px solid #1F2D45", borderRadius: "4px",
        padding: "20px 22px", width: "300px", boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        ...MONO,
      }}>
        <div style={{
          fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase",
          color: "#9BAAC4", marginBottom: "16px", paddingBottom: "10px",
          borderBottom: "1px solid #1F2D45",
        }}>
          ▸ {isEdit ? `Edit · ${weekLabel}` : "Assign Week"}
        </div>

        {/* Week picker (new assignment only) */}
        {!isEdit && (
          <div style={{ marginBottom: "12px" }}>
            <div style={{ fontSize: "9px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#2DD4BF", marginBottom: "5px" }}>
              Week
            </div>
            <select
              className="sta-input"
              style={{ width: "100%", color: "#2DD4BF" }}
              value={selectedWeek ? `${selectedWeek.isoYear}-${selectedWeek.isoWeek}` : ""}
              onChange={(e) => {
                const [y, w] = e.target.value.split("-").map(Number);
                setSelectedWeek({ isoYear: y, isoWeek: w });
              }}
            >
              {upcomingWeeks.map(({ isoYear, isoWeek }) => (
                <option key={`${isoYear}-${isoWeek}`} value={`${isoYear}-${isoWeek}`}>
                  Week {isoWeek} · {formatWeekRange(isoYear, isoWeek)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* One dropdown per role */}
        {roles.map((role) => {
          const filtered = membersForRole(role);
          const showingAll = showAllFor.has(role.id);
          return (
            <div key={role.id} style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "9px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#3D4F68", marginBottom: "5px", display: "flex", alignItems: "center", gap: "6px" }}>
                {role.name}
                <span style={{ background: "#1C2333", border: "1px solid #1F2D45", color: "#5E6F8A", padding: "0 5px", borderRadius: "2px", fontSize: "8px" }}>
                  {filtered.length}
                </span>
              </div>
              <select
                className="sta-input"
                style={{ width: "100%" }}
                value={assignments[role.id] ?? ""}
                onChange={(e) => setAssignments((prev) => ({ ...prev, [role.id]: e.target.value }))}
              >
                <option value="">— unassigned —</option>
                {filtered.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              {!showingAll && members.length > filtered.length && (
                <button
                  onClick={() => setShowAllFor((prev) => new Set([...prev, role.id]))}
                  style={{ background: "none", border: "none", color: "#2E3F5C", fontSize: "9px", cursor: "pointer", padding: "2px 0", fontFamily: "inherit", textDecoration: "underline" }}
                >
                  Show all team members ↓
                </button>
              )}
            </div>
          );
        })}

        {/* Notes */}
        <div style={{ marginBottom: "12px" }}>
          <div style={{ fontSize: "9px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#3D4F68", marginBottom: "5px" }}>
            Notes <span style={{ color: "#2E3F5C", textTransform: "none", letterSpacing: "0" }}>(optional)</span>
          </div>
          <textarea
            className="sta-input"
            style={{ width: "100%", resize: "none", height: "48px" }}
            placeholder="e.g. covering for sick leave"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "14px", paddingTop: "12px", borderTop: "1px solid #1F2D45" }}>
          <button className="sta-btn" onClick={onClose}>Cancel</button>
          <button
            className="sta-btn primary"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || (!isEdit && !selectedWeek)}
          >
            {saveMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getIsoWeek, formatWeekRange } from "@/lib/iso-week";
import { TeamAssignModal } from "./team-assign-modal";

// ─── Types ───────────────────────────────────────────────────────────────────

interface TeamRole { id: string; name: string; sortOrder: number; }
interface TeamMember { id: string; name: string; defaultRoleId: string | null; defaultRole: TeamRole | null; weeksOnDuty: number; }
interface RotaEntry { id: string; roleId: string; memberId: string; role: TeamRole; member: TeamMember; }
interface RotaWeek { id: string; isoYear: number; isoWeek: number; notes: string; entries: RotaEntry[]; }

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONO: React.CSSProperties = {
  fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)",
};

function SectionHeader({ label, action }: { label: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
      <div style={{ ...MONO, fontSize: "9px", letterSpacing: "0.14em", textTransform: "uppercase", color: "#2DD4BF" }}>
        {label}
      </div>
      {action}
    </div>
  );
}

function AddBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "#1C2F4A", border: "1px solid #2DD4BF44", color: "#2DD4BF",
        padding: "3px 10px", borderRadius: "2px", ...MONO, fontSize: "9px", cursor: "pointer",
        display: "inline-flex", alignItems: "center", gap: "4px",
      }}
    >
      {children}
    </button>
  );
}

function EditBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none", border: "1px solid #1F2D45", color: "#3D4F68",
        padding: "2px 8px", borderRadius: "2px", ...MONO, fontSize: "9px", cursor: "pointer",
      }}
    >
      Edit
    </button>
  );
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none", border: "1px solid #3A1515", color: "#7A2020",
        padding: "2px 8px", borderRadius: "2px", ...MONO, fontSize: "9px", cursor: "pointer",
      }}
    >
      ✕
    </button>
  );
}

function RoleTag({ name }: { name: string }) {
  return (
    <span style={{
      background: "#1A2535", border: "1px solid #1F2D45",
      padding: "1px 6px", borderRadius: "2px", ...MONO, fontSize: "9px", color: "#5E6F8A",
    }}>
      {name}
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span style={{
      width: "22px", height: "22px", background: "#1C2F4A", border: "1px solid #2DD4BF44",
      borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center",
      ...MONO, fontSize: "9px", color: "#2DD4BF", marginRight: "8px", verticalAlign: "middle", flexShrink: 0,
    }}>
      {initials}
    </span>
  );
}

function buildScheduleRows(
  rota: RotaWeek[],
  currentYear: number,
  currentWeek: number
): Array<{ isoYear: number; isoWeek: number; rota: RotaWeek | null; kind: "past" | "current" | "future" }> {
  const rotaByKey = new Map(rota.map((r) => [`${r.isoYear}-${r.isoWeek}`, r]));
  const rows: Array<{ isoYear: number; isoWeek: number; rota: RotaWeek | null; kind: "past" | "current" | "future" }> = [];

  // 4 past weeks
  for (let offset = 4; offset >= 1; offset--) {
    let y = currentYear;
    let w = currentWeek - offset;
    while (w <= 0) { y--; w += 52; }
    rows.push({ isoYear: y, isoWeek: w, rota: rotaByKey.get(`${y}-${w}`) ?? null, kind: "past" });
  }

  // Current week
  rows.push({ isoYear: currentYear, isoWeek: currentWeek, rota: rotaByKey.get(`${currentYear}-${currentWeek}`) ?? null, kind: "current" });

  // Future: all assigned weeks + enough blanks to reach 3 unassigned
  const futureAssigned = rota.filter(
    (r) => r.isoYear > currentYear || (r.isoYear === currentYear && r.isoWeek > currentWeek)
  );
  const shown = new Set<string>();
  for (const r of futureAssigned) {
    rows.push({ isoYear: r.isoYear, isoWeek: r.isoWeek, rota: r, kind: "future" });
    shown.add(`${r.isoYear}-${r.isoWeek}`);
  }
  let blanks = 0;
  let y = currentYear;
  let w = currentWeek + 1;
  while (blanks < 3) {
    if (w > 52) { w = 1; y++; }
    const key = `${y}-${w}`;
    if (!shown.has(key)) {
      rows.push({ isoYear: y, isoWeek: w, rota: null, kind: "future" });
      blanks++;
    }
    w++;
  }

  return rows;
}

// ─── Sections ────────────────────────────────────────────────────────────────

function ThisWeekSection({
  roles,
  currentRota,
  currentYear,
  currentWeek,
  onEdit,
}: {
  roles: TeamRole[];
  currentRota: RotaWeek | null;
  currentYear: number;
  currentWeek: number;
  onEdit: () => void;
}) {
  return (
    <section style={{ padding: "16px 22px", borderBottom: "1px solid #1F2D45" }}>
      <SectionHeader
        label="▸ This Week"
        action={<EditBtn onClick={onEdit} />}
      />
      <div style={{
        display: "inline-flex", alignItems: "center", gap: "6px",
        background: "#1C2F4A", border: "1px solid #2DD4BF44", color: "#2DD4BF",
        padding: "4px 12px", borderRadius: "3px", ...MONO, fontSize: "10px", marginBottom: "14px",
      }}>
        <span>●</span>
        Week {currentWeek} · {formatWeekRange(currentYear, currentWeek)}
      </div>
      <div style={{ display: "flex", gap: "10px" }}>
        {roles.map((role) => {
          const entry = currentRota?.entries.find((e) => e.roleId === role.id);
          return (
            <div key={role.id} style={{
              flex: 1, background: "#111827", border: "1px solid #2DD4BF22",
              borderRadius: "3px", padding: "12px 16px",
            }}>
              <div style={{ ...MONO, fontSize: "9px", letterSpacing: "0.14em", textTransform: "uppercase", color: "#3D4F68", marginBottom: "6px" }}>
                {role.name}
              </div>
              <div style={{ color: entry ? "#F0F4FF" : "#2E3F5C", fontSize: "14px", marginBottom: "2px", ...MONO }}>
                {entry ? entry.member.name : "— unassigned —"}
              </div>
              {entry && (
                <div style={{ ...MONO, fontSize: "9px", color: "#3D4F68" }}>
                  Since Mon {formatWeekRange(currentYear, currentWeek).split("–")[0].trim()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ScheduleSection({
  roles,
  rows,
  onEdit,
  onAssignNew,
}: {
  roles: TeamRole[];
  rows: ReturnType<typeof buildScheduleRows>;
  onEdit: (rota: RotaWeek) => void;
  onAssignNew: () => void;
}) {
  const thStyle: React.CSSProperties = {
    background: "#111827", color: "#3D4F68", ...MONO, fontSize: "9px",
    letterSpacing: "0.10em", textTransform: "uppercase",
    padding: "6px 12px", textAlign: "left", borderBottom: "1px solid #1F2D45", fontWeight: "normal",
  };
  const tdBase: React.CSSProperties = { padding: "7px 12px", borderBottom: "1px solid #1C2333", verticalAlign: "middle", ...MONO };

  return (
    <section style={{ padding: "16px 22px", borderBottom: "1px solid #1F2D45" }}>
      <SectionHeader label="▸ Schedule" action={<AddBtn onClick={onAssignNew}>+ Assign Week</AddBtn>} />
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
        <thead>
          <tr>
            <th style={thStyle}>Week</th>
            <th style={thStyle}>Dates</th>
            {roles.map((r) => <th key={r.id} style={thStyle}>{r.name}</th>)}
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ isoYear, isoWeek, rota, kind }) => {
            const isCurrent = kind === "current";
            const rowStyle: React.CSSProperties = isCurrent
              ? { background: "#0F1E2E" }
              : {};
            const textColor = kind === "past" ? "#3D4F68" : kind === "future" ? "#5E6F8A" : "#F0F4FF";
            return (
              <tr key={`${isoYear}-${isoWeek}`} style={rowStyle}>
                <td style={{
                  ...tdBase,
                  color: isCurrent ? "#2DD4BF" : textColor,
                  borderLeft: isCurrent ? "2px solid #2DD4BF" : undefined,
                }}>
                  Wk {isoWeek}{isCurrent ? " ●" : ""}
                </td>
                <td style={{ ...tdBase, color: textColor }}>{formatWeekRange(isoYear, isoWeek)}</td>
                {roles.map((role) => {
                  const entry = rota?.entries.find((e) => e.roleId === role.id);
                  return (
                    <td key={role.id} style={{ ...tdBase, color: entry ? textColor : "#2E3F5C", fontStyle: entry ? "normal" : "italic" }}>
                      {entry ? entry.member.name : "— unassigned —"}
                    </td>
                  );
                })}
                <td style={{ ...tdBase }}>
                  {rota
                    ? <EditBtn onClick={() => onEdit(rota)} />
                    : kind !== "past" && (
                        <AddBtn onClick={onAssignNew}>Assign</AddBtn>
                      )
                  }
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function RolesSection({ roles }: { roles: TeamRole[] }) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const addMutation = useMutation({
    mutationFn: () =>
      fetch("/api/team/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), sortOrder: roles.length + 1 }),
      }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-roles"] });
      setNewName("");
      setAdding(false);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/team/roles/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: (data) => {
      if (data.ok) {
        queryClient.invalidateQueries({ queryKey: ["team-roles"] });
      } else if (data.error) {
        toast.error(data.error);
      }
    },
  });

  return (
    <section style={{ padding: "16px 22px", borderBottom: "1px solid #1F2D45" }}>
      <SectionHeader
        label="▸ Roles"
        action={<AddBtn onClick={() => setAdding(true)}>+ Add Role</AddBtn>}
      />
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        {roles.map((role) => (
          <div key={role.id} style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            background: "#111827", border: "1px solid #1F2D45",
            padding: "4px 10px", borderRadius: "3px", ...MONO, fontSize: "10px", color: "#9BAAC4",
          }}>
            {role.name}
            <button
              onClick={() => removeMutation.mutate(role.id)}
              style={{ background: "none", border: "none", color: "#3D4F68", cursor: "pointer", fontSize: "9px", padding: 0, fontFamily: "inherit" }}
              title="Remove role"
            >
              ✕
            </button>
          </div>
        ))}
        {adding && (
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <input
              className="sta-input"
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) addMutation.mutate();
                if (e.key === "Escape") { setAdding(false); setNewName(""); }
              }}
              placeholder="Role name"
              style={{ width: "140px" }}
            />
            <button
              className="sta-btn primary"
              onClick={() => newName.trim() && addMutation.mutate()}
              disabled={addMutation.isPending || !newName.trim()}
            >
              {addMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : "Add"}
            </button>
            <button className="sta-btn" onClick={() => { setAdding(false); setNewName(""); }}>Cancel</button>
          </div>
        )}
      </div>
    </section>
  );
}

function RosterSection({ members, roles }: { members: TeamMember[]; roles: TeamRole[] }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRoleId, setNewRoleId] = useState("");

  const addMutation = useMutation({
    mutationFn: () =>
      fetch("/api/team/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), defaultRoleId: newRoleId || null }),
      }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      setNewName("");
      setNewRoleId("");
      setAdding(false);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/team/members/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: (data) => {
      if (data.ok) {
        queryClient.invalidateQueries({ queryKey: ["team-members"] });
      } else if (data.error) {
        toast.error(data.error);
      }
    },
  });

  const thStyle: React.CSSProperties = {
    background: "#111827", color: "#3D4F68", ...MONO, fontSize: "9px",
    letterSpacing: "0.10em", textTransform: "uppercase",
    padding: "6px 12px", textAlign: "left", borderBottom: "1px solid #1F2D45", fontWeight: "normal",
  };
  const tdStyle: React.CSSProperties = { padding: "7px 12px", borderBottom: "1px solid #1C2333", ...MONO, fontSize: "11px", verticalAlign: "middle" };

  return (
    <section style={{ padding: "16px 22px" }}>
      <SectionHeader
        label="▸ Roster"
        action={<AddBtn onClick={() => setAdding(true)}>+ Add Person</AddBtn>}
      />
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Default Role</th>
            <th style={thStyle}>Weeks on duty</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td style={tdStyle}>
                <Avatar name={m.name} />
                <span style={{ color: "#F0F4FF" }}>{m.name}</span>
              </td>
              <td style={tdStyle}>
                {m.defaultRole ? <RoleTag name={m.defaultRole.name} /> : <span style={{ color: "#3D4F68" }}>—</span>}
              </td>
              <td style={{ ...tdStyle, color: "#3D4F68" }}>{m.weeksOnDuty}</td>
              <td style={tdStyle}><RemoveBtn onClick={() => removeMutation.mutate(m.id)} /></td>
            </tr>
          ))}
          {adding && (
            <tr>
              <td style={tdStyle} colSpan={4}>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input
                    className="sta-input"
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") { setAdding(false); setNewName(""); setNewRoleId(""); } }}
                    placeholder="Name"
                    style={{ flex: 1 }}
                  />
                  <select
                    className="sta-input"
                    value={newRoleId}
                    onChange={(e) => setNewRoleId(e.target.value)}
                    style={{ width: "160px" }}
                  >
                    <option value="">No default role</option>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <button
                    className="sta-btn primary"
                    onClick={() => newName.trim() && addMutation.mutate()}
                    disabled={addMutation.isPending || !newName.trim()}
                  >
                    {addMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : "Add"}
                  </button>
                  <button className="sta-btn" onClick={() => { setAdding(false); setNewName(""); setNewRoleId(""); }}>Cancel</button>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export function TeamView() {
  const [modalState, setModalState] = useState<{
    open: boolean;
    editRota: { id: string; isoYear: number; isoWeek: number; notes: string; assignments: Record<string, string> } | null;
  }>({ open: false, editRota: null });

  const { data: roles = [] } = useQuery<TeamRole[]>({
    queryKey: ["team-roles"],
    queryFn: () => fetch("/api/team/roles").then((r) => r.json()),
  });

  const { data: members = [] } = useQuery<TeamMember[]>({
    queryKey: ["team-members"],
    queryFn: () => fetch("/api/team/members").then((r) => r.json()),
  });

  const { data: rotaWeeks = [] } = useQuery<RotaWeek[]>({
    queryKey: ["team-rota"],
    queryFn: () => fetch("/api/team/rota").then((r) => r.json()),
  });

  const { isoYear: currentYear, isoWeek: currentWeek } = getIsoWeek(new Date());
  const currentRota = rotaWeeks.find((r) => r.isoYear === currentYear && r.isoWeek === currentWeek) ?? null;
  const scheduleRows = buildScheduleRows(rotaWeeks, currentYear, currentWeek);

  function openEdit(rota: RotaWeek) {
    const assignments: Record<string, string> = {};
    for (const e of rota.entries) assignments[e.roleId] = e.memberId;
    setModalState({ open: true, editRota: { id: rota.id, isoYear: rota.isoYear, isoWeek: rota.isoWeek, notes: rota.notes, assignments } });
  }

  function openAssignNew() {
    setModalState({ open: true, editRota: null });
  }

  function openCurrentWeekEdit() {
    if (currentRota) {
      openEdit(currentRota);
    } else {
      setModalState({ open: true, editRota: { id: "", isoYear: currentYear, isoWeek: currentWeek, notes: "", assignments: {} } });
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{
        background: "#111827", borderBottom: "1px solid #1F2D45",
        padding: "10px 22px", ...MONO, fontSize: "10px",
        letterSpacing: "0.12em", textTransform: "uppercase", color: "#9BAAC4", flexShrink: 0,
      }}>
        Team
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        <ThisWeekSection
          roles={roles}
          currentRota={currentRota}
          currentYear={currentYear}
          currentWeek={currentWeek}
          onEdit={openCurrentWeekEdit}
        />
        <ScheduleSection
          roles={roles}
          rows={scheduleRows}
          onEdit={openEdit}
          onAssignNew={openAssignNew}
        />
        <RolesSection roles={roles} />
        <RosterSection members={members} roles={roles} />
      </div>

      <TeamAssignModal
        open={modalState.open}
        onClose={() => setModalState({ open: false, editRota: null })}
        editRota={modalState.editRota}
      />
    </div>
  );
}

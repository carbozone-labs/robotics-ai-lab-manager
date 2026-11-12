import { useEffect, useState } from "react";
import { api } from "../api";
import { Badge, Field, Page, Table, useToast } from "../ui";

export default function SettingsPage() {
  const toast = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [u, setU] = useState({ username: "", full_name: "", password: "", role: "lab_assistant", can_mark_attendance: false });
  const load = () => api("/api/auth/users").then(setUsers);
  useEffect(() => { load(); }, []);
  return (
    <Page title="Application Settings">
      <div className="card space-y-3"><h2 className="font-medium">Users &amp; roles</h2>
        <p className="text-xs text-slate-400">admin: everything. lab_assistant: issue/return, timetable, teachers, assets, maintenance. teacher: view, and report a problem in the Maintenance Register.</p>
        <Table cols={["Username", "Name", "Role", "Attendance", "Status", ""]} rows={users.map((x) => [x.username, x.full_name, x.role, x.can_mark_attendance ? "Yes" : "-", <Badge s={x.is_active ? "Active" : "Inactive"} />,
          <button className="btn-ghost" onClick={async () => { try { await api(`/api/auth/users/${x.id}/active?active=${!x.is_active}`, { method: "PATCH" }); load(); } catch (e: any) { toast("err", e.message); } }}>{x.is_active ? "Disable" : "Enable"}</button>])} />
        <div className="grid gap-2 md:grid-cols-5">
          <Field label="Username"><input className="input" value={u.username} onChange={(e) => setU({ ...u, username: e.target.value })} /></Field>
          <Field label="Full name"><input className="input" value={u.full_name} onChange={(e) => setU({ ...u, full_name: e.target.value })} /></Field>
          <Field label="Password (8+)"><input className="input" type="password" value={u.password} onChange={(e) => setU({ ...u, password: e.target.value })} /></Field>
          <Field label="Role"><select className="input" value={u.role} onChange={(e) => setU({ ...u, role: e.target.value })}><option value="admin">admin</option><option value="lab_assistant">lab_assistant</option><option value="teacher">teacher</option></select></Field>
          <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={u.can_mark_attendance} onChange={(e) => setU({ ...u, can_mark_attendance: e.target.checked })} />Can mark attendance</label></div>
        <button className="btn" disabled={!u.username || u.password.length < 8} onClick={async () => { try { await api("/api/auth/users", { json: u }); toast("ok", "User created"); setU({ ...u, username: "", full_name: "", password: "" }); load(); } catch (e: any) { toast("err", e.message); } }}>Create user</button></div>
      <div className="card text-sm text-slate-300"><h2 className="mb-1 font-medium text-slate-50">Where things moved</h2>
        <p>Batches and Divisions now have their own pages under Student Management. Import, backup and restore are under Data Management; CSV exports are under CSV Export.</p></div>
    </Page>
  );
}

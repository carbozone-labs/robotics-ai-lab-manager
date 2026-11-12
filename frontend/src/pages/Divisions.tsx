import { useEffect, useState } from "react";
import { api } from "../api";
import { Badge, Confirm, Field, Page, Spinner, Table, useToast } from "../ui";

export default function Divisions() {
  const toast = useToast();
  const [rows, setRows] = useState<any[] | null>(null); const [name, setName] = useState(""); const [del, setDel] = useState<any>(null);
  const load = () => api("/api/divisions").then(setRows);
  useEffect(() => { load(); }, []);
  const add = async () => { try { await api(`/api/divisions?name=${encodeURIComponent(name.trim())}`, { method: "POST" }); setName(""); toast("ok", "Division added"); load(); } catch (e: any) { toast("err", e.message); } };
  const remove = async () => { try { await api(`/api/divisions/${del.id}`, { method: "DELETE" }); toast("ok", "Division deleted"); load(); } catch (e: any) { toast("err", e.message); } setDel(null); };
  return (
    <Page title="Divisions">
      <div className="card flex flex-wrap items-end gap-2"><div className="w-64"><Field label="New division"><input className="input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && add()} /></Field></div>
        <button className="btn" disabled={!name.trim()} onClick={add}>Add division</button></div>
      <div className="card">{!rows ? <Spinner /> : <Table empty="No divisions yet. Import students or add a division above." cols={["Division", "Active students", "Timetable sessions", "Source", ""]}
        rows={rows.map((d) => [d.name, d.students, d.sessions, <Badge s={d.registered ? "Active" : "Inactive"} />, d.registered ? <button className="btn-ghost" onClick={() => setDel(d)}>Delete</button> : <span className="text-xs text-slate-500">from student records</span>])} />}</div>
      <p className="text-xs text-slate-400">Divisions that exist on student records are listed automatically. Divisions you add here become available in the timetable.</p>
      <Confirm open={!!del} danger title="Delete division" body={`Delete division ${del?.name}? Only possible when no student, attendance record or timetable entry uses it.`} onYes={remove} onNo={() => setDel(null)} />
    </Page>
  );
}

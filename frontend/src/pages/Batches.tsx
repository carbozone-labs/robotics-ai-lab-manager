import { useEffect, useState } from "react";
import { api } from "../api";
import { Confirm, Field, Modal, Page, Spinner, Table, useToast } from "../ui";

export default function Batches() {
  const toast = useToast();
  const [rows, setRows] = useState<any[] | null>(null); const [name, setName] = useState(""); const [ren, setRen] = useState<any>(null); const [del, setDel] = useState<any>(null);
  const load = () => api("/api/batches/detail").then(setRows);
  useEffect(() => { load(); }, []);
  const add = async () => { try { await api(`/api/batches?name=${encodeURIComponent(name.trim())}`, { method: "POST" }); setName(""); toast("ok", "Batch added"); load(); } catch (e: any) { toast("err", e.message); } };
  const rename = async () => { try { await api(`/api/batches/${ren.id}?name=${encodeURIComponent(ren.name.trim())}`, { method: "PUT" }); toast("ok", "Batch renamed everywhere"); setRen(null); load(); } catch (e: any) { toast("err", e.message); } };
  const remove = async () => { try { await api(`/api/batches/${del.id}`, { method: "DELETE" }); toast("ok", "Batch deleted"); load(); } catch (e: any) { toast("err", e.message); } setDel(null); };
  return (
    <Page title="Batches">
      <div className="card flex flex-wrap items-end gap-2"><div className="w-64"><Field label="New batch name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && add()} /></Field></div>
        <button className="btn" disabled={!name.trim()} onClick={add}>Add batch</button></div>
      <div className="card">{!rows ? <Spinner /> : <Table empty="No batches yet. Add one above, or they are created automatically from the timetable." cols={["Batch", "Issue slips", "Timetable sessions", ""]}
        rows={rows.map((b) => [b.name, b.slips, b.sessions, <div className="flex gap-1"><button className="btn-ghost" onClick={() => setRen({ id: b.id, name: b.name })}>Rename</button><button className="btn-ghost" onClick={() => setDel(b)}>Delete</button></div>])} />}</div>
      <p className="text-xs text-slate-400">Batches are shared by Issue Items, Attendance sessions and the Lab Timetable. Renaming updates existing issue slips and timetable entries too.</p>
      <Modal open={!!ren} title="Rename batch" onClose={() => setRen(null)}>{ren && <div className="space-y-3"><Field label="Batch name"><input className="input" value={ren.name} onChange={(e) => setRen({ ...ren, name: e.target.value })} /></Field>
        <button className="btn w-full" disabled={!ren.name.trim()} onClick={rename}>Save</button></div>}</Modal>
      <Confirm open={!!del} danger title="Delete batch" body={`Delete batch ${del?.name}? Only possible when no issue slip or timetable entry uses it.`} onYes={remove} onNo={() => setDel(null)} />
    </Page>
  );
}

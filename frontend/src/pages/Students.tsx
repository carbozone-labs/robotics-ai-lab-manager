import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api, qs } from "../api";
import { Badge, Field, Modal, Page, Pager, Spinner, Table, useToast } from "../ui";

export default function Students({ admin }: { admin: boolean }) {
  const toast = useToast();
  const [q, setQ] = useState(""); const [div, setDiv] = useState(""); const [page, setPage] = useState(1); const [data, setData] = useState<any>(null);
  const [divs, setDivs] = useState<string[]>([]); const [batch, setBatch] = useState(""); const [bset, setBset] = useState<string[]>([]); const [asg, setAsg] = useState<any>(null); const [edit, setEdit] = useState<any>(null); const [prof, setProf] = useState<any>(null);
  const load = () => api(`/api/students?${qs({ q, division: div, batch, page, size: 25 })}`).then(setData);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q, div, batch, page]);
  useEffect(() => { api("/api/students/divisions").then(setDivs); api("/api/batches").then(setBset); }, [data?.total]);
  const assign = async () => { try { const r = await api("/api/students/assign-batch", { json: { ...asg, roll_from: +asg.roll_from, roll_to: +asg.roll_to } }); toast("ok", `${r.updated} student(s) moved to ${asg.batch.toUpperCase()}`); setAsg(null); load(); } catch (e: any) { toast("err", e.message); } };
  const save = async () => {
    try { await api(edit.id ? `/api/students/${edit.id}` : "/api/students", { method: edit.id ? "PUT" : "POST", json: { prn: edit.prn, name: edit.name, division: edit.division, roll_no: edit.roll_no, batch: edit.batch } });
      toast("ok", "Student saved"); setEdit(null); load(); } catch (e: any) { toast("err", e.message); }
  };
  return (
    <Page title="Students" actions={<><button className="btn-ghost" onClick={() => setAsg({ division: div, batch: "B1", roll_from: "", roll_to: "" })}>Assign batches</button><button className="btn" onClick={() => setEdit({ prn: "", name: "", division: "", roll_no: "", batch: "" })}><Plus size={16} />Add student</button></>}>
      <div className="card flex flex-wrap gap-2">
        <input className="input max-w-sm" placeholder="Search PRN, name or roll number…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select className="input max-w-[10rem]" value={div} onChange={(e) => { setDiv(e.target.value); setPage(1); }}><option value="">All divisions</option>{divs.map((d) => <option key={d}>{d}</option>)}</select>
        <select className="input max-w-[10rem]" value={batch} onChange={(e) => { setBatch(e.target.value); setPage(1); }}><option value="">All batches</option>{bset.map((b) => <option key={b}>{b}</option>)}</select>
      </div>
      <div className="card">{!data ? <Spinner /> : <>
        <Table empty="No students yet. Import the student CSV from Import / Export." cols={["PRN", "Name", "Division", "Batch", "Roll No", ""]}
          rows={data.items.map((s: any) => [s.prn, s.name, s.division, s.batch || "-", s.roll_no, <div className="flex gap-1">
            <button className="btn-ghost" onClick={async () => setProf(await api(`/api/students/${s.id}/profile`))}>Profile</button>
            <button className="btn-ghost" onClick={() => setEdit(s)}>Edit</button></div>])} />
        <Pager page={page} size={25} total={data.total} onPage={setPage} /></>}</div>
      <Modal open={!!edit} title={edit?.id ? "Edit student" : "Add student"} onClose={() => setEdit(null)}>{edit && <div className="space-y-3">
        {(["prn", "name", "division", "roll_no"] as const).map((k) => <Field key={k} label={{ prn: "PRN (text)", name: "Student name", division: "Division", roll_no: "Roll no (text)" }[k]}>
          <input className="input" value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /></Field>)}
        <Field label="Batch" hint="B1 / B2 / B3 - used for batch-wise attendance"><input className="input" list="stu-batches" value={edit.batch || ""} onChange={(e) => setEdit({ ...edit, batch: e.target.value })} /><datalist id="stu-batches">{bset.map((b) => <option key={b} value={b} />)}</datalist></Field>
        <button className="btn w-full" disabled={!edit.prn.trim() || !edit.name.trim() || !edit.division.trim() || !edit.roll_no.trim()} onClick={save}>Save</button></div>}</Modal>
      <Modal open={!!asg} title="Assign batch by roll number range" onClose={() => setAsg(null)}>{asg && <div className="space-y-3">
        <Field label="Division"><select className="input" value={asg.division} onChange={(e) => setAsg({ ...asg, division: e.target.value })}><option value="">Select...</option>{divs.map((d) => <option key={d}>{d}</option>)}</select></Field>
        <Field label="Batch"><input className="input" list="stu-batches" value={asg.batch} onChange={(e) => setAsg({ ...asg, batch: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Roll no from"><input className="input" inputMode="numeric" value={asg.roll_from} onChange={(e) => setAsg({ ...asg, roll_from: e.target.value })} /></Field>
          <Field label="Roll no to"><input className="input" inputMode="numeric" value={asg.roll_to} onChange={(e) => setAsg({ ...asg, roll_to: e.target.value })} /></Field></div>
        <p className="text-xs text-slate-400">Example: CSAIML-B, batch B1, roll 1 to 25. Repeat for B2, B3. You can also add a "Batch" column in the student CSV.</p>
        <button className="btn w-full" disabled={!asg.division || !asg.batch.trim() || asg.roll_from === "" || asg.roll_to === ""} onClick={assign}>Assign</button></div>}</Modal>
      <Modal open={!!prof} title="Student profile" onClose={() => setProf(null)}>{prof && <div className="space-y-3 text-sm">
        <div><b>{prof.name}</b> · PRN {prof.prn} · Div {prof.division}{prof.batch ? ` / ${prof.batch}` : ""} · Roll {prof.roll_no}</div>
        <div className="grid grid-cols-2 gap-2"><div className="card">Total issued: <b>{prof.total_items_issued}</b></div><div className="card">Currently issued: <b>{prof.currently_issued}</b></div>
          <div className="card">Pending returns: <b>{prof.pending_returns}</b></div><div className="card">Attendance: <b>{prof.attendance_pct == null ? "—" : `${prof.attendance_pct}%`}</b></div></div>
        <h3 className="font-medium">Equipment history</h3><Table empty="Nothing issued" cols={["Slip", "Date", "Item", "Qty", "Status"]} rows={prof.issue_history.map((h: any) => [h.slip_no, h.date, h.item, h.qty, <Badge s={h.status} />])} />
        <h3 className="font-medium">Attendance history</h3><Table empty="No attendance recorded" cols={["Date", "Session", "Status"]} rows={prof.attendance_history.map((a: any) => [a.date, a.session, <Badge s={a.status} />])} /></div>}</Modal>
    </Page>
  );
}

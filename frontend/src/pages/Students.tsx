import { useEffect, useState } from "react";
import { Plus, QrCode } from "lucide-react";
import { api, qs } from "../api";
import { Badge, Field, Modal, Page, Pager, Spinner, Table, useToast } from "../ui";

export default function Students({ admin }: { admin: boolean }) {
  const toast = useToast();
  const [q, setQ] = useState(""); const [div, setDiv] = useState(""); const [page, setPage] = useState(1); const [data, setData] = useState<any>(null);
  const [divs, setDivs] = useState<string[]>([]); const [edit, setEdit] = useState<any>(null); const [prof, setProf] = useState<any>(null); const [qr, setQr] = useState<string | null>(null);
  const load = () => api(`/api/students?${qs({ q, division: div, page, size: 25 })}`).then(setData);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q, div, page]);
  useEffect(() => { api("/api/students/divisions").then(setDivs); }, [data?.total]);
  const save = async () => {
    try { await api(edit.id ? `/api/students/${edit.id}` : "/api/students", { method: edit.id ? "PUT" : "POST", json: { prn: edit.prn, name: edit.name, division: edit.division, roll_no: edit.roll_no } });
      toast("ok", "Student saved"); setEdit(null); load(); } catch (e: any) { toast("err", e.message); }
  };
  const showQr = async (id: number) => { const b = await api<Blob>(`/api/attendance/qr/${id}`); setQr(URL.createObjectURL(b)); };
  return (
    <Page title="Students" actions={<button className="btn" onClick={() => setEdit({ prn: "", name: "", division: "", roll_no: "" })}><Plus size={16} />Add student</button>}>
      <div className="card flex flex-wrap gap-2">
        <input className="input max-w-sm" placeholder="Search PRN, name or roll number…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select className="input max-w-[10rem]" value={div} onChange={(e) => { setDiv(e.target.value); setPage(1); }}><option value="">All divisions</option>{divs.map((d) => <option key={d}>{d}</option>)}</select>
      </div>
      <div className="card">{!data ? <Spinner /> : <>
        <Table empty="No students yet. Import the student CSV from Import / Export." cols={["PRN", "Name", "Division", "Roll No", ""]}
          rows={data.items.map((s: any) => [s.prn, s.name, s.division, s.roll_no, <div className="flex gap-1">
            <button className="btn-ghost" onClick={async () => setProf(await api(`/api/students/${s.id}/profile`))}>Profile</button>
            <button className="btn-ghost" onClick={() => setEdit(s)}>Edit</button><button className="btn-ghost" onClick={() => showQr(s.id)} aria-label="QR"><QrCode size={16} /></button></div>])} />
        <Pager page={page} size={25} total={data.total} onPage={setPage} /></>}</div>
      <Modal open={!!edit} title={edit?.id ? "Edit student" : "Add student"} onClose={() => setEdit(null)}>{edit && <div className="space-y-3">
        {(["prn", "name", "division", "roll_no"] as const).map((k) => <Field key={k} label={{ prn: "PRN (text)", name: "Student name", division: "Division", roll_no: "Roll no (text)" }[k]}>
          <input className="input" value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /></Field>)}
        <button className="btn w-full" disabled={!edit.prn.trim() || !edit.name.trim() || !edit.division.trim() || !edit.roll_no.trim()} onClick={save}>Save</button></div>}</Modal>
      <Modal open={!!qr} title="Student attendance QR" onClose={() => setQr(null)}>{qr && <div className="space-y-2 text-center"><img src={qr} alt="QR" className="mx-auto w-56" /><button className="btn-ghost" onClick={() => window.print()}>Print</button></div>}</Modal>
      <Modal open={!!prof} title="Student profile" onClose={() => setProf(null)}>{prof && <div className="space-y-3 text-sm">
        <div><b>{prof.name}</b> · PRN {prof.prn} · Div {prof.division} · Roll {prof.roll_no}</div>
        <div className="grid grid-cols-2 gap-2"><div className="card">Total issued: <b>{prof.total_items_issued}</b></div><div className="card">Currently issued: <b>{prof.currently_issued}</b></div>
          <div className="card">Pending returns: <b>{prof.pending_returns}</b></div><div className="card">Attendance: <b>{prof.attendance_pct == null ? "—" : `${prof.attendance_pct}%`}</b></div></div>
        <h3 className="font-medium">Equipment history</h3><Table empty="Nothing issued" cols={["Slip", "Date", "Item", "Qty", "Status"]} rows={prof.issue_history.map((h: any) => [h.slip_no, h.date, h.item, h.qty, <Badge s={h.status} />])} />
        <h3 className="font-medium">Attendance history</h3><Table empty="No attendance recorded" cols={["Date", "Session", "Status"]} rows={prof.attendance_history.map((a: any) => [a.date, a.session, <Badge s={a.status} />])} /></div>}</Modal>
    </Page>
  );
}

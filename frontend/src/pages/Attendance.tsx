import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { api, today } from "../api";
import { Badge, Field, Page, Spinner, Table, useToast } from "../ui";

const STATUSES = ["Present", "Absent", "Late", "Leave"];
export default function Attendance() {
  const toast = useToast();
  const [date, setDate] = useState(today()); const [div, setDiv] = useState(""); const [session, setSession] = useState("");
  const [divs, setDivs] = useState<string[]>([]); const [batches, setBatches] = useState<string[]>([]); const [sum, setSum] = useState<any>(null);
  const [rows, setRows] = useState<any[] | null>(null); const [marks, setMarks] = useState<Record<number, string>>({}); const [q, setQ] = useState(""); const [scan, setScan] = useState(false);
  const scanner = useRef<Html5Qrcode | null>(null);
  const refreshSum = () => api(`/api/attendance/summary?on=${date}`).then(setSum);
  useEffect(() => { api("/api/students/divisions").then(setDivs); api("/api/batches").then(setBatches); }, []);
  useEffect(() => { refreshSum(); }, [date]);
  const load = async () => {
    setRows(null);
    const r = await api(`/api/attendance/sheet?session_date=${date}&division=${encodeURIComponent(div)}&session_name=${encodeURIComponent(session)}`);
    setRows(r.students); setMarks(Object.fromEntries(r.students.filter((s: any) => s.status).map((s: any) => [s.id, s.status])));
  };
  const all = (st: string) => setMarks(Object.fromEntries((rows || []).map((s) => [s.id, st])));
  const save = async () => {
    try { const entries = Object.entries(marks).map(([id, status]) => ({ student_id: +id, status }));
      const r = await api("/api/attendance", { json: { session_date: date, division: div, session_name: session, entries } });
      toast("ok", `Saved: ${r.created} new, ${r.edited} edited`); refreshSum(); } catch (e: any) { toast("err", e.message); }
  };
  const startScan = async () => {
    setScan(true);
    setTimeout(async () => {
      const s = new Html5Qrcode("qr-reader"); scanner.current = s;
      let last = "";
      try { await s.start({ facingMode: "environment" }, { fps: 8, qrbox: 220 }, async (text) => {
        if (text === last) return; last = text;
        try { const r = await api("/api/attendance/scan", { json: { token: text, session_date: date, division: div, session_name: session } }); toast("ok", `${r.student.name} marked present`); setMarks((m) => ({ ...m })); load(); refreshSum(); }
        catch (e: any) { toast("err", e.message); }
        setTimeout(() => (last = ""), 2500);
      }, () => {}); } catch { toast("err", "Camera unavailable — use manual attendance"); setScan(false); }
    }, 50);
  };
  const stopScan = async () => { try { await scanner.current?.stop(); } catch { /* not running */ } setScan(false); };
  const ready = div && session.trim();
  const shown = (rows || []).filter((s) => !q || `${s.prn} ${s.name} ${s.roll_no}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Page title="Attendance">
      {sum && <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {[["Total students", sum.total_students], ["Present", sum.present], ["Absent", sum.absent], ["Late", sum.late], ["On leave", sum.leave], ["Attendance %", `${sum.percentage}%`]].map(([k, v]) =>
          <div key={k as string} className="card"><div className="text-xs text-slate-500">{k}</div><div className="text-2xl font-semibold text-brand-700">{v}</div></div>)}</div>}
      <div className="card grid gap-3 md:grid-cols-4">
        <Field label="Date"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Division"><select className="input" value={div} onChange={(e) => setDiv(e.target.value)}><option value="">Select…</option>{divs.map((d) => <option key={d}>{d}</option>)}</select></Field>
        <Field label="Session / batch"><input className="input" list="sessions" value={session} onChange={(e) => setSession(e.target.value)} placeholder="e.g. Morning" /><datalist id="sessions">{batches.map((b) => <option key={b} value={b} />)}</datalist></Field>
        <div className="flex items-end"><button className="btn w-full" disabled={!ready} onClick={load}>Load students</button></div>
      </div>
      {rows === null && ready && <Spinner />}
      {rows && <div className="card space-y-3">
        <div className="flex flex-wrap gap-2"><input className="input max-w-xs" placeholder="Search student…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn-ghost" onClick={() => all("Present")}>Mark all present</button><button className="btn-ghost" onClick={() => all("Absent")}>Mark all absent</button>
          <button className="btn-ghost" onClick={scan ? stopScan : startScan}>{scan ? "Stop QR scan" : "Scan QR"}</button>
          <button className="btn" onClick={save} disabled={!Object.keys(marks).length}>Save attendance</button></div>
        {scan && <div id="qr-reader" className="max-w-xs" />}
        <Table empty="No students in this division" cols={["PRN", "Student", "Division", "Roll No", "Status"]}
          rows={shown.map((s) => [s.prn, s.name, s.division, s.roll_no, <div className="flex flex-wrap items-center gap-1">{STATUSES.map((st) =>
            <button key={st} onClick={() => setMarks({ ...marks, [s.id]: st })} className={`rounded-full border px-2 py-0.5 text-xs ${marks[s.id] === st ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300"}`}>{st}</button>)}{!marks[s.id] && <Badge s="Not marked" />}</div>])} /></div>}
    </Page>
  );
}

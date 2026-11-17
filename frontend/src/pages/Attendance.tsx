import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { AlertTriangle } from "lucide-react";
import { api, today } from "../api";
import { Badge, Empty, Field, Page, Spinner, Table, useToast } from "../ui";

const STATUSES = ["Present", "Absent", "Late", "Leave"];
type Sel = { division: string; batch: string; session_name: string; timetable_id: number | null; title: string };

export default function Attendance() {
  const toast = useToast();
  const [date, setDate] = useState(today());
  const [sessions, setSessions] = useState<any[] | null>(null);
  const [sum, setSum] = useState<any>(null);
  const [sel, setSel] = useState<Sel | null>(null);
  const [manual, setManual] = useState({ division: "", batch: "", session_name: "" });
  const [divs, setDivs] = useState<string[]>([]); const [batches, setBatches] = useState<string[]>([]);
  const [rows, setRows] = useState<any[] | null>(null); const [unassigned, setUnassigned] = useState(0); const [incl, setIncl] = useState(false);
  const [marks, setMarks] = useState<Record<number, string>>({}); const [q, setQ] = useState(""); const [scan, setScan] = useState(false);
  const scanner = useRef<Html5Qrcode | null>(null);

  const refreshSum = () => api(`/api/attendance/summary?on=${date}`).then(setSum).catch(() => {});
  const refreshSessions = () => api(`/api/attendance/sessions?on=${date}`).then(setSessions).catch((e: any) => { setSessions([]); toast("err", e.message); });
  useEffect(() => { api("/api/students/divisions").then(setDivs); api("/api/batches").then(setBatches); }, []);
  useEffect(() => { setSel(null); setRows(null); setSessions(null); refreshSessions(); refreshSum(); }, [date]);

  const load = async (s: Sel, withUnassigned = incl) => {
    setRows(null);
    const qs = new URLSearchParams({ session_date: date, division: s.division, batch: s.batch, session_name: s.session_name, include_unassigned: String(withUnassigned) });
    const r = await api(`/api/attendance/sheet?${qs}`);
    setRows(r.students); setUnassigned(r.unassigned);
    setMarks(Object.fromEntries(r.students.filter((x: any) => x.status).map((x: any) => [x.id, x.status])));
  };
  const pick = (s: Sel) => { setSel(s); setQ(""); stopScan(); load(s).catch((e: any) => toast("err", e.message)); };
  const pickSession = (r: any) => pick({ division: r.division, batch: r.batch, session_name: r.session_name, timetable_id: r.id,
    title: `${r.time_from}-${r.time_to} · ${r.subject} · ${r.division} / ${r.batch}` });
  const all = (st: string) => setMarks(Object.fromEntries((rows || []).map((s) => [s.id, st])));
  const save = async () => {
    if (!sel) return;
    try {
      const entries = Object.entries(marks).map(([id, status]) => ({ student_id: +id, status }));
      const r = await api("/api/attendance", { json: { session_date: date, division: sel.division, batch: sel.batch, session_name: sel.session_name, timetable_id: sel.timetable_id, entries } });
      toast("ok", `Saved: ${r.created} new, ${r.edited} edited`); refreshSum(); refreshSessions();
    } catch (e: any) { toast("err", e.message); }
  };
  const startScan = async () => {
    if (!sel) return;
    setScan(true);
    setTimeout(async () => {
      const s = new Html5Qrcode("qr-reader"); scanner.current = s; let last = "";
      try {
        await s.start({ facingMode: "environment" }, { fps: 8, qrbox: 220 }, async (text) => {
          if (text === last) return; last = text;
          try { const r = await api("/api/attendance/scan", { json: { token: text, session_date: date, division: sel.division, batch: sel.batch, session_name: sel.session_name, timetable_id: sel.timetable_id } });
            toast("ok", `${r.student.name} marked present`); load(sel); refreshSum(); refreshSessions(); }
          catch (e: any) { toast("err", e.message); }
          setTimeout(() => (last = ""), 2500);
        }, () => {});
      } catch { toast("err", "Camera unavailable - use manual attendance"); setScan(false); }
    }, 50);
  };
  const stopScan = async () => { try { await scanner.current?.stop(); } catch { /* not running */ } setScan(false); };
  useEffect(() => () => { scanner.current?.stop().catch(() => {}); }, []);

  const shown = (rows || []).filter((s) => !q || `${s.prn} ${s.name} ${s.roll_no}`.toLowerCase().includes(q.toLowerCase()));
  const counts = STATUSES.map((st) => [st, Object.values(marks).filter((v) => v === st).length] as const);
  const dayName = new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long" });

  return (
    <Page title="Attendance">
      {sum && <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {[["Students", sum.total_students], ["Present (day)", sum.present], ["Absent (day)", sum.absent], ["Late (day)", sum.late], ["On leave", sum.leave], ["Attendance %", `${sum.percentage}%`]].map(([k, v]) =>
          <div key={k as string} className="card"><div className="text-xs text-slate-500">{k}</div><div className="text-2xl font-semibold text-cyan-300">{v}</div></div>)}</div>}

      <div className="card space-y-3">
        <div className="grid gap-3 md:grid-cols-4"><Field label="Date"><input className="input" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></Field></div>
        <h2 className="text-sm font-medium text-slate-200">Practical sessions on {dayName} <span className="font-normal text-slate-400">(from Lab Timetable - pick one to take attendance of that batch)</span></h2>
        {!sessions ? <Spinner /> : sessions.length === 0 ? <Empty text={`No lab session is scheduled on ${dayName}. Use "Extra session" below if needed.`} /> :
          <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-4">{sessions.map((r) => {
            const on = sel?.timetable_id === r.id;
            return <button key={r.id} onClick={() => pickSession(r)} className={`rounded-lg border p-2 text-left text-xs transition ${on ? "border-cyan-400 bg-cyan-400/15" : "border-slate-700 bg-slate-900/60 hover:border-cyan-400/50"}`}>
              <div className="font-mono text-cyan-200">{r.time_from} - {r.time_to}</div>
              <div className="font-medium text-slate-100">{r.division} / {r.batch}</div>
              <div className="text-slate-300">{r.subject}</div>
              <div className="text-slate-400">{r.teacher_name}</div>
              <div className={`mt-1 ${r.marked ? "text-emerald-300" : "text-amber-300"}`}>{r.marked ? `${r.marked} marked` : "Not taken yet"}</div></button>;
          })}</div>}
        <details className="text-sm"><summary className="cursor-pointer text-slate-300">Extra session (not in timetable)</summary>
          <div className="mt-2 grid gap-3 md:grid-cols-4">
            <Field label="Division"><select className="input" value={manual.division} onChange={(e) => setManual({ ...manual, division: e.target.value })}><option value="">Select...</option>{divs.map((d) => <option key={d}>{d}</option>)}</select></Field>
            <Field label="Batch"><select className="input" value={manual.batch} onChange={(e) => setManual({ ...manual, batch: e.target.value })}><option value="">All batches</option>{batches.map((b) => <option key={b}>{b}</option>)}</select></Field>
            <Field label="Session name"><input className="input" value={manual.session_name} onChange={(e) => setManual({ ...manual, session_name: e.target.value })} placeholder="e.g. Extra practical" /></Field>
            <div className="flex items-end"><button className="btn w-full" disabled={!manual.division || !manual.session_name.trim()}
              onClick={() => pick({ division: manual.division, batch: manual.batch, session_name: manual.session_name.trim(), timetable_id: null, title: `${manual.session_name.trim()} · ${manual.division}${manual.batch ? " / " + manual.batch : ""}` })}>Load students</button></div>
          </div></details>
      </div>

      {sel && rows === null && <Spinner />}
      {sel && rows && <div className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-medium text-slate-50">{sel.title}</h2>
          <div className="flex flex-wrap gap-2 text-xs">{counts.map(([k, v]) => <span key={k} className="chip">{k}: {v}</span>)}<span className="chip">Not marked: {rows.length - Object.keys(marks).length}</span></div></div>
        {sel.batch && unassigned > 0 && <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-xs text-amber-200">
          <AlertTriangle size={16} />{unassigned} student(s) of {sel.division} have no batch yet, so they are not in this list.
          <label className="flex items-center gap-1"><input type="checkbox" checked={incl} onChange={(e) => { setIncl(e.target.checked); load(sel, e.target.checked); }} />Show them too</label>
          <span>Or assign batches in Students &rarr; Assign batches.</span></div>}
        <div className="flex flex-wrap gap-2"><input className="input max-w-xs" placeholder="Search student..." value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn-ghost" onClick={() => all("Present")}>Mark all present</button><button className="btn-ghost" onClick={() => all("Absent")}>Mark all absent</button>
          <button className="btn-ghost" onClick={scan ? stopScan : startScan}>{scan ? "Stop QR scan" : "Scan QR"}</button>
          <button className="btn" onClick={save} disabled={!Object.keys(marks).length}>Save attendance</button></div>
        {scan && <div id="qr-reader" className="max-w-xs" />}
        <Table empty="No students found for this division and batch." cols={["Roll No", "PRN", "Student", "Batch", "Status"]}
          rows={shown.map((s) => [s.roll_no, s.prn, s.name, s.batch || "-", <div className="flex flex-wrap items-center gap-1">{STATUSES.map((st) =>
            <button key={st} onClick={() => setMarks({ ...marks, [s.id]: st })} className={`rounded-full border px-2 py-0.5 text-xs ${marks[s.id] === st ? "border-cyan-400 bg-cyan-400/20 text-cyan-100" : "border-slate-600 text-slate-300"}`}>{st}</button>)}{!marks[s.id] && <Badge s="Not marked" />}</div>])} /></div>}
    </Page>
  );
}

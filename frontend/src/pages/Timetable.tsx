import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus, Printer } from "lucide-react";
import { api, qs } from "../api";
import { Badge, Confirm, Empty, Field, Modal, Page, Problems, Spinner, Table, useToast } from "../ui";

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const todayName = () => { const n = DAYS[(new Date().getDay() + 6) % 7]; return n || "Monday"; };      // Sunday -> Monday
const BLANK = { id: 0, day: "Monday", time_from: "09:00", time_to: "11:00", batch: "", division: "", subject: "", teacher_id: "", lab: "", remarks: "" };
const hm = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

export function EntryTable({ rows, actions }: { rows: any[]; actions?: (r: any) => any }) {
  return <Table empty="No sessions" cols={["Day", "Time", "Batch", "Division", "Subject", "Teacher", "Lab/Room", "Remarks", ...(actions ? [""] : [])]}
    rows={rows.map((r) => [r.day, <span className="font-mono">{r.time_from} - {r.time_to}</span>, r.batch, r.division || "-", r.subject, r.teacher_name, r.lab || "-", r.remarks || "", ...(actions ? [actions(r)] : [])])} />;
}

/** Mon-Sat columns; each session is a card. `onPick` makes the cards editable. */
export function WeekGrid({ rows, onPick, now }: { rows: any[]; onPick?: (r: any) => void; now?: boolean }) {
  const t = todayName(), cur = hm();
  return (
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
      {DAYS.map((d) => {
        const list = rows.filter((r) => r.day === d);
        return (
          <div key={d} className={`print-card rounded-xl border p-2 ${now && d === t ? "border-cyan-400/60 bg-cyan-400/5" : "border-slate-700/60"}`}>
            <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-cyan-300">{d}{now && d === t && <span className="text-[10px] text-cyan-200">TODAY</span>}</div>
            {list.length === 0 && <div className="py-3 text-center text-xs text-slate-500">No practicals</div>}
            <div className="space-y-2">{list.map((r) => {
              const live = now && d === t && r.time_from <= cur && cur < r.time_to;
              return <button key={r.id} onClick={() => onPick?.(r)} className={`w-full rounded-lg border p-2 text-left text-xs transition ${live ? "live border-cyan-400 bg-cyan-400/15" : "border-slate-700 bg-slate-900/60 hover:border-cyan-400/50"}`}>
                <div className="font-mono text-cyan-200">{r.time_from} - {r.time_to}</div>
                <div className="font-medium text-slate-100">{r.subject}</div>
                <div className="text-slate-300">{r.batch}{r.division ? ` / ${r.division}` : ""}</div>
                <div className="text-slate-400">{r.teacher_name}{r.lab ? ` \u00b7 ${r.lab}` : ""}</div>
                {r.remarks && <div className="mt-1 italic text-slate-500">{r.remarks}</div>}
              </button>;
            })}</div>
          </div>);
      })}
    </div>
  );
}

type View = "day" | "week" | "batch" | "teacher" | "all";
export default function Timetable() {
  const toast = useToast();
  const [view, setView] = useState<View>("week"); const [day, setDay] = useState(todayName());
  const [f, setF] = useState({ q: "", batch: "", division: "", teacher_id: "", lab: "" });
  const [rows, setRows] = useState<any[] | null>(null); const [teachers, setTeachers] = useState<any[]>([]); const [batches, setBatches] = useState<string[]>([]);
  const [divs, setDivs] = useState<string[]>([]); const [labs, setLabs] = useState<string[]>([]); const [clash, setClash] = useState<any[]>([]); const [showClash, setShowClash] = useState(false);
  const [edit, setEdit] = useState<any>(null); const [warn, setWarn] = useState<any[] | null>(null); const [live, setLive] = useState<any[]>([]); const [del, setDel] = useState<any>(null);
  const load = () => {
    api(`/api/timetable?${qs({ ...f, day: view === "day" ? day : "" })}`).then(setRows);
    api("/api/timetable/conflicts").then(setClash).catch(() => {});
    api("/api/timetable/meta").then((m) => setLabs(m.labs));
  };
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [f, view, day]);
  useEffect(() => { api("/api/teachers").then(setTeachers); api("/api/batches").then(setBatches); api("/api/divisions").then((d) => setDivs(d.map((x: any) => x.name))); }, []);

  const body = (e: any) => ({ ...e, teacher_id: +e.teacher_id, id: e.id || undefined });
  const problems: string[] = [];
  if (edit) {
    if (!edit.batch.trim()) problems.push("Batch is required");
    if (!edit.subject.trim()) problems.push("Subject is required");
    if (!edit.teacher_id) problems.push("Choose a teacher (add teachers in Teacher Management)");
    if (edit.time_from >= edit.time_to) problems.push("Time To must be later than Time From");
  }
  // live conflict warning while the form is open
  useEffect(() => {
    if (!edit || problems.length) { setLive([]); return; }
    const t = setTimeout(() => api("/api/timetable/check", { json: body(edit) }).then((r) => setLive(r.conflicts)).catch(() => setLive([])), 300);
    return () => clearTimeout(t);
  }, [edit?.day, edit?.time_from, edit?.time_to, edit?.batch, edit?.division, edit?.teacher_id, edit?.lab]);

  const save = async (allow = false) => {
    try {
      await api(edit.id ? `/api/timetable/${edit.id}` : "/api/timetable", { method: edit.id ? "PUT" : "POST", json: { ...body(edit), allow_conflicts: allow } });
      toast("ok", allow ? "Saved with conflicts" : "Timetable entry saved"); setEdit(null); setWarn(null); load();
    } catch (e: any) {
      if (e.status === 409 && e.data?.conflicts) setWarn(e.data.conflicts); else toast("err", e.message);
    }
  };
  const doDelete = async () => { try { await api(`/api/timetable/${del.id}`, { method: "DELETE" }); toast("ok", "Entry deleted"); setEdit(null); load(); } catch (e: any) { toast("err", e.message); } setDel(null); };
  const openEdit = (r: any) => setEdit({ ...BLANK, ...r, teacher_id: String(r.teacher_id) });
  const set = (k: string, v: string) => setEdit({ ...edit, [k]: v });
  const f2 = (k: string, v: string) => setF({ ...f, [k]: v });

  const grouped = useMemo(() => {
    const key = view === "batch" ? (r: any) => `${r.batch}${r.division ? " / " + r.division : ""}` : (r: any) => r.teacher_name;
    const m: Record<string, any[]> = {}; (rows || []).forEach((r) => (m[key(r)] ||= []).push(r)); return Object.entries(m).sort(([a], [b]) => a.localeCompare(b));
  }, [rows, view]);
  const rowActions = (r: any) => <div className="flex gap-1"><button className="btn-ghost" onClick={() => openEdit(r)}>Edit</button><button className="btn-ghost" onClick={() => setDel(r)}>Delete</button></div>;
  const tab = (v: View, label: string) => <button key={v} onClick={() => setView(v)} className={`rounded-lg px-3 py-1.5 text-sm transition ${view === v ? "bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-400/50" : "text-slate-300 hover:bg-white/5"}`}>{label}</button>;

  return (
    <Page title="Lab Timetable" actions={<><button className="btn-ghost" onClick={() => window.print()}><Printer size={16} />Print</button>
      <button className="btn" onClick={() => { setLive([]); setEdit({ ...BLANK, day: view === "day" ? day : "Monday" }); }}><Plus size={16} />Add entry</button></>}>
      {clash.length > 0 && <div className="no-print card flex flex-wrap items-center gap-3 !border-amber-400/40 !bg-amber-400/10 text-sm text-amber-200">
        <AlertTriangle size={18} />{clash.length} overlapping timetable pair(s) detected.<button className="underline" onClick={() => setShowClash(true)}>Review</button></div>}
      <div className="no-print card space-y-3">
        <div className="flex flex-wrap gap-1">{tab("week", "Weekly")}{tab("day", "Daily")}{tab("batch", "By batch")}{tab("teacher", "By teacher")}{tab("all", "All entries")}</div>
        <div className="grid gap-2 md:grid-cols-6">
          {view === "day" && <Field label="Day"><select className="input" value={day} onChange={(e) => setDay(e.target.value)}>{DAYS.map((d) => <option key={d}>{d}</option>)}</select></Field>}
          <Field label="Search"><input className="input" value={f.q} onChange={(e) => f2("q", e.target.value)} placeholder="Subject, teacher, lab..." /></Field>
          <Field label="Batch"><select className="input" value={f.batch} onChange={(e) => f2("batch", e.target.value)}><option value="">All</option>{batches.map((b) => <option key={b}>{b}</option>)}</select></Field>
          <Field label="Division"><select className="input" value={f.division} onChange={(e) => f2("division", e.target.value)}><option value="">All</option>{divs.map((b) => <option key={b}>{b}</option>)}</select></Field>
          <Field label="Teacher"><select className="input" value={f.teacher_id} onChange={(e) => f2("teacher_id", e.target.value)}><option value="">All</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
          <Field label="Lab/Room"><select className="input" value={f.lab} onChange={(e) => f2("lab", e.target.value)}><option value="">All</option>{labs.map((b) => <option key={b}>{b}</option>)}</select></Field>
        </div>
      </div>
      <div className="print-area space-y-3">
        <h2 className="hidden text-lg font-semibold print:block">Robotics &amp; AI Lab - Practical Timetable{view === "day" ? ` (${day})` : ""}</h2>
        {!rows ? <Spinner /> : rows.length === 0 ? <div className="card"><Empty text="No timetable entries match. Use Add entry to create one." /></div> :
          view === "week" ? <WeekGrid rows={rows} onPick={openEdit} now /> :
          view === "day" ? <div className="card"><EntryTable rows={rows} actions={rowActions} /></div> :
          view === "all" ? <div className="card"><EntryTable rows={rows} actions={rowActions} /></div> :
          grouped.map(([k, list]) => <div key={k} className="card"><h3 className="mb-2 font-semibold text-cyan-300">{view === "batch" ? "Batch " : ""}{k}</h3><EntryTable rows={list} actions={rowActions} /></div>)}
      </div>

      <Modal open={!!edit} title={edit?.id ? "Edit timetable entry" : "Add timetable entry"} onClose={() => setEdit(null)} wide>{edit && <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Day"><select className="input" value={edit.day} onChange={(e) => set("day", e.target.value)}>{DAYS.map((d) => <option key={d}>{d}</option>)}</select></Field>
          <Field label="Time from"><input className="input" type="time" value={edit.time_from} onChange={(e) => set("time_from", e.target.value)} /></Field>
          <Field label="Time to"><input className="input" type="time" value={edit.time_to} onChange={(e) => set("time_to", e.target.value)} /></Field>
          <Field label="Batch *"><input className="input" list="tt-batches" value={edit.batch} onChange={(e) => set("batch", e.target.value)} /></Field>
          <Field label="Division"><input className="input" list="tt-divs" value={edit.division} onChange={(e) => set("division", e.target.value)} /></Field>
          <Field label="Lab / Room"><input className="input" list="tt-labs" value={edit.lab} onChange={(e) => set("lab", e.target.value)} /></Field>
          <Field label="Subject *"><input className="input" value={edit.subject} onChange={(e) => set("subject", e.target.value)} /></Field>
          <div className="md:col-span-2"><Field label="Teacher *" hint="Populated from Teacher Management"><select className="input" value={edit.teacher_id} onChange={(e) => set("teacher_id", e.target.value)}>
            <option value="">- select teacher -</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}{t.department ? ` (${t.department})` : ""}</option>)}</select></Field></div>
        </div>
        <datalist id="tt-batches">{batches.map((b) => <option key={b} value={b} />)}</datalist><datalist id="tt-divs">{divs.map((b) => <option key={b} value={b} />)}</datalist><datalist id="tt-labs">{labs.map((b) => <option key={b} value={b} />)}</datalist>
        <Field label="Remarks (optional)"><input className="input" value={edit.remarks} onChange={(e) => set("remarks", e.target.value)} /></Field>
        {live.length > 0 && <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-xs text-amber-200"><b>Conflicts with existing entries:</b><ul className="mt-1 list-disc pl-5">{live.map((c, i) => <li key={i}>{c.message}</li>)}</ul></div>}
        <Problems list={problems} />
        <div className="flex gap-2"><button className="btn flex-1" disabled={problems.length > 0} onClick={() => save(false)}>Save</button>
          {edit.id ? <button className="btn-danger" onClick={() => setDel(edit)}>Delete</button> : null}</div></div>}</Modal>

      <Confirm open={!!warn} title="Timetable conflict" danger body={<div><ul className="list-disc space-y-1 pl-5">{warn?.map((c, i) => <li key={i}>{c.message}</li>)}</ul><p className="mt-2">Save anyway?</p></div>} onNo={() => setWarn(null)} onYes={() => save(true)} />
      <Confirm open={!!del} danger title="Delete timetable entry" body={`Delete ${del?.day} ${del?.time_from}-${del?.time_to} ${del?.batch} (${del?.subject})?`} onYes={doDelete} onNo={() => setDel(null)} />
      <Modal open={showClash} title="Overlapping entries" onClose={() => setShowClash(false)} wide>
        <Table empty="None" cols={["Conflict", "Entry A", "Entry B"]} rows={clash.map((c) => [c.types.map((t: string) => <Badge key={t} s={t === "teacher" ? "High" : t === "lab" ? "Medium" : "Urgent"} />), `${c.a.day} ${c.a.time_from}-${c.a.time_to} ${c.a.batch} ${c.a.teacher_name} ${c.a.lab}`, `${c.b.day} ${c.b.time_from}-${c.b.time_to} ${c.b.batch} ${c.b.teacher_name} ${c.b.lab}`])} />
        <p className="text-xs text-slate-400">High = same teacher, Medium = same lab, Urgent = same batch.</p>
      </Modal>
    </Page>
  );
}

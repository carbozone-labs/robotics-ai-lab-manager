import { useEffect, useState } from "react";
import { Printer, Share2, Trash2, Download, CheckCircle2 } from "lucide-react";
import { api, download, openBlob, today } from "../api";
import { Badge, Confirm, Field, Page, Problems, Table, useToast } from "../ui";

interface Line { item_id: string; qty: string }
const blank = (id = ""): Line => ({ item_id: id, qty: "1" });

export default function IssueEquipment() {
  const toast = useToast();
  const [items, setItems] = useState<any[]>([]); const [batches, setBatches] = useState<string[]>([]); const [teachers, setTeachers] = useState<any[]>([]);
  const [date, setDate] = useState(today()); const [batch, setBatch] = useState(""); const [by, setBy] = useState<"Student" | "Teacher">("Student");
  const [prn, setPrn] = useState(""); const [student, setStudent] = useState<any>(null); const [prnErr, setPrnErr] = useState("");
  const [teacher, setTeacher] = useState(""); const [lines, setLines] = useState<Line[]>([]); const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState(false); const [slip, setSlip] = useState<any>(null); const [busy, setBusy] = useState(false);
  const load = () => api("/api/inventory").then(setItems);
  useEffect(() => { load(); api("/api/batches").then(setBatches); api("/api/teachers").then(setTeachers); }, []);

  const verify = async () => {
    setStudent(null); setPrnErr("");
    try { setStudent(await api(`/api/students/lookup/${encodeURIComponent(prn.trim())}`)); } catch (e: any) { setPrnErr(e.message); }
  };
  const avail = (id: string) => items.find((i) => String(i.id) === id)?.available ?? 0;
  const setLine = (i: number, k: keyof Line, v: string) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const used = new Set(lines.map((l) => l.item_id));
  const shown = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));
  const name = (id: string) => items.find((i) => String(i.id) === id)?.name ?? "";
  const problems: string[] = [];
  if (lines.length === 0) problems.push("Tap at least one item to add it");
  if (by === "Student" && !student) problems.push("Verify the student's PRN");
  if (by === "Teacher" && !teacher.trim()) problems.push("Enter or choose the teacher's name");
  lines.forEach((l, i) => {
    if (!l.item_id) problems.push(`Line ${i + 1}: choose an item`);
    else if (!(Number.isInteger(+l.qty) && +l.qty > 0)) problems.push(`${name(l.item_id)}: quantity must be a whole number, at least 1`);
    else if (+l.qty > avail(l.item_id)) problems.push(`${name(l.item_id)}: only ${avail(l.item_id)} available`);
  });

  const submit = async () => {
    setBusy(true); setConfirm(false);
    try {
      const s = await api("/api/issues", { json: { issue_date: date, batch: batch || null, taken_by: by, prn: by === "Student" ? prn.trim() : null,
        teacher_name: by === "Teacher" ? teacher : null, lines: lines.map((l) => ({ item_id: +l.item_id, qty: +l.qty })) } });
      setSlip(s); toast("ok", `Slip ${s.slip_no} created`); load();
    } catch (e: any) { toast("err", e.message); load(); } finally { setBusy(false); }
  };
  const reset = () => { setSlip(null); setPrn(""); setStudent(null); setTeacher(""); setLines([]); setSearch(""); };

  if (slip) return (
    <Page title="Issue Items">
      <div className="card space-y-4">
        <div className="flex items-center gap-2 text-emerald-300"><CheckCircle2 /> <b>Issued - slip {slip.slip_no}</b> <Badge s={slip.status} /></div>
        <div className="grid gap-1 text-sm md:grid-cols-2">
          <div>Date: {slip.date}</div><div>Batch: {slip.batch || "-"}</div><div>Taken by: {slip.taken_by}</div>
          {slip.taken_by === "Student" ? <><div>PRN: {slip.prn}</div><div>Student: {slip.student_name}</div><div>Roll No: {slip.roll_no}</div></> : <div>Teacher: {slip.teacher_name}</div>}
        </div>
        <Table cols={["Item", "Qty"]} rows={slip.lines.map((l: any) => [l.item, l.qty])} />
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => openBlob(`/api/slips/${slip.slip_no}/pdf`)}>View</button>
          <button className="btn-ghost" onClick={() => openBlob(`/api/slips/${slip.slip_no}/pdf`, true)}><Printer size={16} />Print</button>
          <button className="btn-ghost" onClick={() => download(`/api/slips/${slip.slip_no}/pdf`, `${slip.slip_no}.pdf`)}><Download size={16} />Download PDF</button>
          <button className="btn-ghost" onClick={async () => {
            const text = `Robotics Lab slip ${slip.slip_no} (${slip.date}): ` + slip.lines.map((l: any) => `${l.item} x${l.qty}`).join(", ");
            if (navigator.share) { try { await navigator.share({ title: slip.slip_no, text }); } catch { /* cancelled */ } }
            else { await navigator.clipboard.writeText(text); toast("ok", "Slip summary copied to clipboard"); }
          }}><Share2 size={16} />Share</button>
          <button className="btn" onClick={reset}>New issue</button>
        </div>
      </div>
    </Page>
  );

  return (
    <Page title="Issue Items">
      <div className="card grid gap-3 md:grid-cols-4">
        <Field label="Slip number"><input className="input" value="Auto-generated on confirm" disabled /></Field>
        <Field label="Date"><input className="input" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Batch"><select className="input" value={batch} onChange={(e) => setBatch(e.target.value)}><option value="">- none -</option>{batches.map((b) => <option key={b}>{b}</option>)}</select></Field>
        <Field label="Taken by"><select className="input" value={by} onChange={(e) => setBy(e.target.value as any)}><option>Student</option><option>Teacher</option></select></Field>
      </div>
      {by === "Student" ? (
        <div className="card space-y-3">
          <div className="flex gap-2"><input className="input" placeholder="Enter PRN" value={prn} onChange={(e) => { setPrn(e.target.value); setStudent(null); }} onKeyDown={(e) => e.key === "Enter" && verify()} />
            <button className="btn" onClick={verify} disabled={!prn.trim()}>Verify</button></div>
          {prnErr && <p className="text-sm text-red-400">{prnErr}</p>}
          {student && <div className="grid gap-1 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm md:grid-cols-4"><span><b>{student.name}</b></span><span>Division {student.division}</span><span>Roll {student.roll_no}</span><span className="text-emerald-300">&#10003; Verified</span></div>}
        </div>
      ) : (
        <div className="card"><Field label="Teacher name" hint="Choose from Teacher Management, or type a new name to add one automatically."><input className="input" list="teachers" value={teacher} onChange={(e) => setTeacher(e.target.value)} /></Field>
          <datalist id="teachers">{teachers.map((t) => <option key={t.id} value={t.name} />)}</datalist></div>
      )}
      <div className="card space-y-3">
        <h2 className="font-medium">Select equipment</h2>
        <input className="input" placeholder="Search items..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {shown.map((it) => {
            const sel = used.has(String(it.id)); const out = it.available <= 0;
            return (
              <button key={it.id} disabled={out && !sel}
                onClick={() => sel ? setLines(lines.filter((l) => l.item_id !== String(it.id))) : setLines([...lines, blank(String(it.id))])}
                className={`rounded-xl border p-3 text-left text-sm transition ${sel ? "border-cyan-400 bg-cyan-400/10 ring-1 ring-cyan-400/60" : "border-slate-700 hover:border-cyan-400/60"} ${out && !sel ? "cursor-not-allowed opacity-40" : ""}`}>
                <div className="font-medium">{sel ? "\u2713 " : ""}{it.name}</div>
                <div className={`text-xs ${out ? "text-red-400" : "text-slate-400"}`}>{out ? "Out of stock" : `${it.available} available`}</div>
              </button>
            );
          })}
        </div>
        {shown.length === 0 && <p className="text-sm text-slate-400">No items match.</p>}
      </div>
      {lines.length > 0 && (
        <div className="card space-y-3">
          <h2 className="font-medium">Selected items</h2>
          {lines.map((l, i) => (
            <div key={l.item_id} className="grid items-end gap-2 md:grid-cols-[2fr_1fr_1fr_auto]">
              <Field label="Item"><input className="input" disabled value={name(l.item_id)} /></Field>
              <Field label="Available"><input className="input" disabled value={avail(l.item_id)} /></Field>
              <Field label="Issue qty"><input className="input" type="number" min={1} max={avail(l.item_id)} value={l.qty} onChange={(e) => setLine(i, "qty", e.target.value)} /></Field>
              <button className="btn-ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove item"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}
      <div className="card space-y-2">
        <button className="btn" disabled={busy || problems.length > 0} onClick={() => setConfirm(true)}>Confirm issue</button>
        <Problems list={problems} />
      </div>
      <Confirm open={confirm} title="Confirm issue" body={`Issue ${lines.length} item line(s) to ${by === "Student" ? student?.name : teacher}?`} onYes={submit} onNo={() => setConfirm(false)} />
    </Page>
  );
}

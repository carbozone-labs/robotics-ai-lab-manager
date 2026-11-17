import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { api } from "../api";
import { Empty, Field, Page, Spinner } from "../ui";
import { EntryTable, WeekGrid } from "./Timetable";

export default function TeacherTimetable() {
  const [teachers, setTeachers] = useState<any[]>([]); const [tid, setTid] = useState(""); const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { api("/api/teachers").then((t) => { setTeachers(t); if (t[0]) setTid(String(t[0].id)); else setRows([]); }); }, []);
  useEffect(() => { if (tid) { setRows(null); api(`/api/timetable?teacher_id=${tid}`).then(setRows); } }, [tid]);
  const t = teachers.find((x) => String(x.id) === tid);
  const batches = [...new Set<string>((rows || []).map((r) => `${r.batch} ${r.division}`.trim()))];
  const subjects = [...new Set<string>((rows || []).map((r) => r.subject))];
  return (
    <Page title="Teacher Timetable" actions={<button className="btn-ghost" onClick={() => window.print()}><Printer size={16} />Print</button>}>
      <div className="no-print card grid gap-3 md:grid-cols-3"><Field label="Teacher"><select className="input" value={tid} onChange={(e) => setTid(e.target.value)}>
        {teachers.map((x) => <option key={x.id} value={x.id}>{x.name}{x.department ? ` (${x.department})` : ""}</option>)}</select></Field></div>
      <div className="print-area space-y-3">
        {teachers.length === 0 ? <div className="card"><Empty text="No teachers yet. Add teachers in Teacher Management first." /></div> : !rows ? <Spinner /> : <>
          <div className="card text-sm"><h2 className="font-semibold text-slate-50">{t?.name} <span className="font-normal text-slate-400">{t?.designation} {t?.department}</span></h2>
            <p className="mt-1 text-slate-300">Batches handled: <b>{batches.join(", ") || "-"}</b></p><p className="text-slate-300">Practical subjects: <b>{subjects.join(", ") || "-"}</b></p>
            <p className="text-slate-300">Sessions per week: <b>{rows.length}</b></p></div>
          {rows.length === 0 ? <div className="card"><Empty text="This teacher has no timetable entries yet." /></div> : <><WeekGrid rows={rows} now /><div className="card"><EntryTable rows={rows} /></div></>}</>}
      </div>
    </Page>
  );
}

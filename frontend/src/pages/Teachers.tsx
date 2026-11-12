import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api, qs, today } from "../api";
import { Badge, Confirm, Empty, Field, Modal, Page, Problems, Spinner, Table, useToast } from "../ui";
import { EntryTable } from "./Timetable";

const BLANK = { id: 0, name: "", teacher_code: "", department: "", designation: "", email: "", mobile: "", subjects: "", batches_text: "", is_active: true, remarks: "" };

export default function Teachers() {
  const toast = useToast();
  const [q, setQ] = useState(""); const [inactive, setInactive] = useState(false); const [list, setList] = useState<any[] | null>(null);
  const [edit, setEdit] = useState<any>(null); const [hist, setHist] = useState<any>(null); const [tt, setTt] = useState<any>(null); const [del, setDel] = useState<any>(null);
  const load = () => api(`/api/teachers?${qs({ q, include_inactive: inactive })}`).then(setList);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q, inactive]);

  const problems: string[] = [];
  if (edit) {
    if (!edit.name.trim()) problems.push("Teacher name is required");
    if (edit.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(edit.email)) problems.push("Email address is not valid");
    if (edit.mobile && !/^\+?[0-9 -]{7,15}$/.test(edit.mobile)) problems.push("Mobile number must be 7-15 digits");
  }
  const save = async () => {
    try { await api(edit.id ? `/api/teachers/${edit.id}` : "/api/teachers", { method: edit.id ? "PUT" : "POST", json: { ...edit, id: undefined } });
      toast("ok", "Teacher saved"); setEdit(null); load(); } catch (e: any) { toast("err", e.message); }
  };
  const setActive = async (t: any) => { try { await api(`/api/teachers/${t.id}/active?active=${!t.is_active}`, { method: "PATCH" }); toast("ok", t.is_active ? "Teacher deactivated" : "Teacher activated"); load(); } catch (e: any) { toast("err", e.message); } };
  const doDelete = async () => { try { await api(`/api/teachers/${del.id}`, { method: "DELETE" }); toast("ok", "Teacher deleted"); load(); } catch (e: any) { toast("err", e.message); } setDel(null); };
  const showTt = async (t: any) => setTt({ t, rows: await api(`/api/timetable?teacher_id=${t.id}`) });
  const showHist = async (t: any) => setHist({ t, rows: await api(`/api/teachers/${t.id}/history`) });
  const returnSlip = async (slip: string) => {
    try { await api("/api/returns/slip", { json: { slip_no: slip, returned_on: today() } }); toast("ok", `Slip ${slip} returned`); showHist(hist.t); } catch (e: any) { toast("err", e.message); }
  };
  const slips = hist ? [...new Set<string>(hist.rows.map((r: any) => r.slip_no))] : [];
  const set = (k: string, v: any) => setEdit({ ...edit, [k]: v });

  return (
    <Page title="Teacher Management" actions={<button className="btn" onClick={() => setEdit({ ...BLANK })}><Plus size={16} />Add teacher</button>}>
      <div className="card flex flex-wrap items-center gap-3">
        <input className="input max-w-sm" placeholder="Search name, ID, department, subject, batch..." value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} />Show inactive</label>
      </div>
      <div className="card">{!list ? <Spinner /> : <Table empty="No teachers yet. Add one, or they are created automatically when you issue items to a new teacher name."
        cols={["ID", "Name", "Department", "Designation", "Contact", "Subjects", "Batches", "Status", ""]}
        rows={list.map((t) => [<span className="font-mono text-cyan-300">{t.teacher_code}</span>, t.name, t.department || "-", t.designation || "-",
          <div className="text-xs">{t.email || "-"}<br />{t.mobile}</div>,
          t.timetable_subjects.length ? t.timetable_subjects.join(", ") : t.subjects || "-", t.timetable_batches.length ? t.timetable_batches.join(", ") : t.batches_text || "-",
          <Badge s={t.is_active ? "Active" : "Inactive"} />,
          <div className="flex flex-wrap gap-1"><button className="btn-ghost" onClick={() => showTt(t)}>Timetable ({t.sessions})</button><button className="btn-ghost" onClick={() => showHist(t)}>Issues</button>
            <button className="btn-ghost" onClick={() => setEdit({ ...BLANK, ...t })}>Edit</button><button className="btn-ghost" onClick={() => setActive(t)}>{t.is_active ? "Deactivate" : "Activate"}</button>
            <button className="btn-ghost" onClick={() => setDel(t)}>Delete</button></div>])} />}</div>

      <Modal open={!!edit} title={edit?.id ? "Edit teacher" : "Add teacher"} onClose={() => setEdit(null)} wide>{edit && <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Teacher ID" hint="Leave blank to generate (T001, T002...)"><input className="input" value={edit.teacher_code} onChange={(e) => set("teacher_code", e.target.value)} /></Field>
          <Field label="Teacher name *"><input className="input" value={edit.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Department"><input className="input" value={edit.department} onChange={(e) => set("department", e.target.value)} /></Field>
          <Field label="Designation"><input className="input" value={edit.designation} onChange={(e) => set("designation", e.target.value)} /></Field>
          <Field label="Email"><input className="input" type="email" value={edit.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Mobile number"><input className="input" inputMode="tel" value={edit.mobile} onChange={(e) => set("mobile", e.target.value)} /></Field>
          <Field label="Assigned subjects" hint="Comma separated. Subjects used in the timetable are shown automatically too."><input className="input" value={edit.subjects} onChange={(e) => set("subjects", e.target.value)} /></Field>
          <Field label="Assigned batches" hint="Comma separated"><input className="input" value={edit.batches_text} onChange={(e) => set("batches_text", e.target.value)} /></Field>
        </div>
        <Field label="Remarks"><textarea className="input" rows={2} value={edit.remarks} onChange={(e) => set("remarks", e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.is_active} onChange={(e) => set("is_active", e.target.checked)} />Active</label>
        <Problems list={problems} /><button className="btn w-full" disabled={problems.length > 0} onClick={save}>Save</button></div>}</Modal>

      <Modal open={!!tt} title={`Timetable - ${tt?.t.name}`} onClose={() => setTt(null)} wide>{tt && <div className="space-y-2 text-sm">
        <p className="text-slate-300">Batches: <b>{[...new Set<string>(tt.rows.map((r: any) => `${r.batch} ${r.division}`.trim()))].join(", ") || "-"}</b> &middot; Subjects: <b>{[...new Set<string>(tt.rows.map((r: any) => r.subject))].join(", ") || "-"}</b></p>
        {tt.rows.length ? <EntryTable rows={tt.rows} /> : <Empty text="No timetable entries for this teacher" />}</div>}</Modal>

      <Modal open={!!hist} title={`Issue history - ${hist?.t.name}`} onClose={() => setHist(null)} wide>{hist && <div className="space-y-3">
        {slips.filter((s) => hist.rows.some((r: any) => r.slip_no === s && r.outstanding > 0)).map((s) => <div key={s} className="flex items-center justify-between rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-sm">
          <span>Slip {s} has items waiting to be returned</span><button className="btn" onClick={() => returnSlip(s)}>Return whole slip</button></div>)}
        <Table empty="No transactions" cols={["Slip", "Date", "Item", "Qty", "Pending", "Status"]} rows={hist.rows.map((r: any) => [r.slip_no, r.date, r.item, r.qty, r.outstanding, <Badge s={r.status} />])} /></div>}</Modal>
      <Confirm open={!!del} danger title="Delete teacher" body={`Delete ${del?.name}? This is only possible when the teacher has no issue or timetable records; otherwise deactivate instead.`} onYes={doDelete} onNo={() => setDel(null)} />
    </Page>
  );
}

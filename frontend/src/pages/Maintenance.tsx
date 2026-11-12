import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api, qs, today } from "../api";
import { Badge, Confirm, Field, Modal, Page, Problems, Spinner, Table, useToast } from "../ui";

const BLANK = { id: 0, complaint_no: "", complaint_date: today(), equipment_name: "", asset_pk: "", description: "", reported_by: "", priority: "Medium", assigned_technician: "", status: "Open", resolution_details: "", resolution_date: "", remarks: "" };
export default function Maintenance() {
  const toast = useToast();
  const [rows, setRows] = useState<any[] | null>(null); const [assets, setAssets] = useState<any[]>([]);
  const [f, setF] = useState({ q: "", status: "", priority: "", date_from: "", date_to: "" }); const [edit, setEdit] = useState<any>(null); const [del, setDel] = useState<any>(null);
  const load = () => api(`/api/complaints?${qs(f)}`).then(setRows);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [f]);
  useEffect(() => { api("/api/assets").then(setAssets); }, []);
  const set = (k: string, v: string) => setEdit({ ...edit, [k]: v });
  const pickAsset = (id: string) => { const a = assets.find((x) => String(x.id) === id); setEdit({ ...edit, asset_pk: id, equipment_name: a ? a.name : edit.equipment_name }); };
  const problems: string[] = [];
  if (edit) {
    if (!edit.equipment_name.trim() && !edit.asset_pk) problems.push("Enter the equipment name or pick an asset");
    if (!edit.description.trim()) problems.push("Describe the problem");
    if (!edit.reported_by.trim()) problems.push("Reported by is required");
    if (edit.complaint_date > today()) problems.push("Date cannot be in the future");
    if (edit.status === "Resolved" && !edit.resolution_details.trim()) problems.push("Resolution details are required to mark Resolved");
    if (edit.status === "Resolved" && edit.resolution_date && edit.resolution_date < edit.complaint_date) problems.push("Resolution date is before the complaint date");
  }
  const save = async () => {
    const b = { ...edit, asset_pk: edit.asset_pk ? +edit.asset_pk : null, resolution_date: edit.status === "Resolved" ? edit.resolution_date || null : null };
    try { await api(edit.id ? `/api/complaints/${edit.id}` : "/api/complaints", { method: edit.id ? "PUT" : "POST", json: b }); toast("ok", "Complaint saved"); setEdit(null); load(); } catch (e: any) { toast("err", e.message); }
  };
  const doDelete = async () => { try { await api(`/api/complaints/${del.id}`, { method: "DELETE" }); toast("ok", "Complaint deleted"); load(); } catch (e: any) { toast("err", e.message); } setDel(null); };
  const quick = async (c: any, status: string) => {
    if (status === "Resolved") return setEdit({ ...BLANK, ...c, asset_pk: c.asset_pk ? String(c.asset_pk) : "", status, resolution_date: today() });
    try { await api(`/api/complaints/${c.id}`, { method: "PUT", json: { ...c, status } }); load(); } catch (e: any) { toast("err", e.message); }
  };
  return (
    <Page title="Maintenance & Issue Register" actions={<button className="btn" onClick={() => setEdit({ ...BLANK })}><Plus size={16} />Register complaint</button>}>
      <div className="card grid gap-2 md:grid-cols-5">
        <Field label="Search"><input className="input" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="ID, equipment, problem, person..." /></Field>
        <Field label="Status"><select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">All</option><option>Open</option><option>In Progress</option><option>Resolved</option></select></Field>
        <Field label="Priority"><select className="input" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="">All</option>{["Urgent", "High", "Medium", "Low"].map((p) => <option key={p}>{p}</option>)}</select></Field>
        <Field label="From"><input className="input" type="date" value={f.date_from} onChange={(e) => setF({ ...f, date_from: e.target.value })} /></Field>
        <Field label="To"><input className="input" type="date" value={f.date_to} onChange={(e) => setF({ ...f, date_to: e.target.value })} /></Field>
      </div>
      <div className="card">{!rows ? <Spinner /> : <Table empty="No complaints recorded" cols={["ID", "Date", "Equipment", "Asset ID", "Problem", "Reported by", "Priority", "Technician", "Status", "Resolved", ""]}
        rows={rows.map((c) => [<span className="font-mono text-cyan-300">{c.complaint_no}</span>, c.complaint_date, c.equipment_name, c.asset_id || "-", <span title={c.resolution_details}>{c.description}</span>, c.reported_by, <Badge s={c.priority} />,
          c.assigned_technician || "-", <Badge s={c.status} />, c.resolution_date || "-",
          <div className="flex flex-wrap gap-1">{c.status === "Open" && <button className="btn-ghost" onClick={() => quick(c, "In Progress")}>Start</button>}{c.status !== "Resolved" && <button className="btn-ghost" onClick={() => quick(c, "Resolved")}>Resolve</button>}
            <button className="btn-ghost" onClick={() => setEdit({ ...BLANK, ...c, asset_pk: c.asset_pk ? String(c.asset_pk) : "" })}>Edit</button><button className="btn-ghost" onClick={() => setDel(c)}>Delete</button></div>])} />}</div>
      <Modal open={!!edit} title={edit?.id ? `Edit ${edit.complaint_no}` : "Register complaint"} onClose={() => setEdit(null)} wide>{edit && <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Date"><input className="input" type="date" max={today()} value={edit.complaint_date} onChange={(e) => set("complaint_date", e.target.value)} /></Field>
          <Field label="Asset (optional)"><select className="input" value={edit.asset_pk} onChange={(e) => pickAsset(e.target.value)}><option value="">- not an asset / unknown -</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.asset_id} - {a.name}</option>)}</select></Field>
          <Field label="Equipment name *"><input className="input" value={edit.equipment_name} onChange={(e) => set("equipment_name", e.target.value)} placeholder="e.g. Projector, Internet" /></Field>
          <Field label="Reported by *"><input className="input" value={edit.reported_by} onChange={(e) => set("reported_by", e.target.value)} /></Field>
          <Field label="Priority"><select className="input" value={edit.priority} onChange={(e) => set("priority", e.target.value)}>{["Low", "Medium", "High", "Urgent"].map((p) => <option key={p}>{p}</option>)}</select></Field>
          <Field label="Assigned technician"><input className="input" value={edit.assigned_technician} onChange={(e) => set("assigned_technician", e.target.value)} /></Field>
        </div>
        <Field label="Problem description *"><textarea className="input" rows={2} value={edit.description} onChange={(e) => set("description", e.target.value)} /></Field>
        <div className="grid gap-3 md:grid-cols-3"><Field label="Status"><select className="input" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value, resolution_date: e.target.value === "Resolved" ? edit.resolution_date || today() : "" })}>{["Open", "In Progress", "Resolved"].map((p) => <option key={p}>{p}</option>)}</select></Field>
          {edit.status === "Resolved" && <Field label="Resolution date"><input className="input" type="date" min={edit.complaint_date} max={today()} value={edit.resolution_date} onChange={(e) => set("resolution_date", e.target.value)} /></Field>}</div>
        {edit.status === "Resolved" && <Field label="Resolution details *"><textarea className="input" rows={2} value={edit.resolution_details} onChange={(e) => set("resolution_details", e.target.value)} /></Field>}
        <Field label="Remarks"><input className="input" value={edit.remarks} onChange={(e) => set("remarks", e.target.value)} /></Field>
        <Problems list={problems} /><button className="btn w-full" disabled={problems.length > 0} onClick={save}>Save</button></div>}</Modal>
      <Confirm open={!!del} danger title="Delete complaint" body={`Delete ${del?.complaint_no} (${del?.equipment_name})?`} onYes={doDelete} onNo={() => setDel(null)} />
    </Page>
  );
}

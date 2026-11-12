import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, today } from "../api";
import { Badge, Field, Page, Problems, Section, Spinner, Table, useToast } from "../ui";

/** Opened by scanning a label's QR code (/scan/<asset id>): details, linked parts, history, and a quick "report a problem". */
export default function Scan() {
  const { code = "" } = useParams();
  const toast = useToast();
  const [d, setD] = useState<any>(null); const [err, setErr] = useState("");
  const [f, setF] = useState({ description: "", reported_by: "", priority: "Medium" }); const [busy, setBusy] = useState(false);
  const load = () => { setErr(""); setD(null); api(`/api/assets/code/${encodeURIComponent(code)}`).then(setD).catch((e) => setErr(e.message)); };
  useEffect(() => { load(); api("/api/auth/me").then((u) => setF((x) => ({ ...x, reported_by: u.full_name || u.username }))).catch(() => {}); }, [code]);
  if (err) return <Page title="Scan result"><div className="card text-sm text-red-300">{err}</div><Link className="btn-ghost inline-flex" to="/assets">Open Lab Assets</Link></Page>;
  if (!d) return <Spinner />;
  const a = d.asset;
  const problems: string[] = [];
  if (!f.description.trim()) problems.push("Describe the problem");
  if (!f.reported_by.trim()) problems.push("Enter your name");
  const report = async () => {
    setBusy(true);
    try { await api("/api/complaints", { json: { complaint_date: today(), asset_pk: a.id, equipment_name: a.name, description: f.description, reported_by: f.reported_by, priority: f.priority } }); toast("ok", "Problem reported"); setF({ ...f, description: "" }); load(); }
    catch (e: any) { toast("err", e.message); } finally { setBusy(false); }
  };
  const open = d.complaints.filter((c: any) => c.status !== "Resolved");
  return (
    <Page title={`${a.asset_id} - ${a.name}`}>
      <div className="card grid gap-2 text-sm md:grid-cols-3">
        <div><span className="text-slate-400">Type: </span>{a.kind || a.category}</div><div><span className="text-slate-400">Brand / model: </span>{`${a.brand} ${a.model}`.trim() || "-"}</div>
        <div><span className="text-slate-400">Serial number: </span><span className="font-mono">{a.serial_number || "-"}</span></div><div><span className="text-slate-400">Location: </span>{a.location || "-"}</div>
        <div><span className="text-slate-400">Condition: </span><Badge s={a.condition === "Working" ? "Working" : a.condition === "Damaged" ? "Damaged" : "Maintenance"} /></div>
        <div><span className="text-slate-400">Warranty till: </span>{a.warranty_expiry || "-"}</div>
        {a.tracking === "quantity" && <div className="md:col-span-3"><span className="text-slate-400">Stock: </span>{a.quantity} total &middot; {a.working} working &middot; {a.damaged} damaged &middot; {a.under_maintenance} under maintenance</div>}
        {d.parent && <div className="md:col-span-3">Part of computer <Link className="font-mono text-cyan-300 underline" to={`/scan/${encodeURIComponent(d.parent.asset_id)}`}>{d.parent.asset_id}</Link> (S/N {d.parent.serial_number || "-"})</div>}
      </div>
      {d.children.length > 0 && <Section title="Linked accessories"><Table cols={["Type", "Asset ID", "Brand / model", "Serial number", "Condition"]}
        rows={d.children.map((c: any) => [c.kind, <Link className="font-mono text-cyan-300 underline" to={`/scan/${encodeURIComponent(c.asset_id)}`}>{c.asset_id}</Link>, `${c.brand} ${c.model}`.trim() || "-", c.serial_number || "-", <Badge s={c.condition === "Working" ? "Working" : c.condition === "Damaged" ? "Damaged" : "Maintenance"} />])} /></Section>}
      <Section title={`Complaints (${open.length} open)`}>
        <Table empty="No complaints for this item" cols={["ID", "Date", "Problem", "Priority", "Status"]} rows={d.complaints.map((c: any) => [c.complaint_no, c.complaint_date, c.description, <Badge s={c.priority} />, <Badge s={c.status} />])} />
        <div className="mt-3 space-y-2 border-t border-slate-800 pt-3"><h3 className="text-sm font-medium text-slate-200">Report a problem with this item</h3>
          <div className="grid gap-2 md:grid-cols-3"><Field label="Reported by"><input className="input" value={f.reported_by} onChange={(e) => setF({ ...f, reported_by: e.target.value })} /></Field>
            <Field label="Priority"><select className="input" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{["Low", "Medium", "High", "Urgent"].map((p) => <option key={p}>{p}</option>)}</select></Field></div>
          <Field label="Problem"><textarea className="input" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <Problems list={problems} /><button className="btn" disabled={busy || problems.length > 0} onClick={report}>Submit complaint</button></div>
      </Section>
      <Section title="Repair, maintenance & link history"><Table empty="No history yet" cols={["Date", "Type", "Description", "Cost", "By"]} rows={d.maintenance.map((m: any) => [m.date, m.kind, m.description, m.cost ?? "-", m.by])} /></Section>
      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Transfers"><Table empty="Never moved" cols={["Date", "From", "To", "By"]} rows={d.transfers.map((t: any) => [t.date, t.from || "-", t.to, t.by])} /></Section>
        <Section title="Allocations"><Table empty="Never allocated" cols={["To", "Qty", "From", "Returned"]} rows={d.allocations.map((x: any) => [x.allocated_to, x.qty, x.allocated_on, x.returned_on || "In use"])} /></Section></div>
    </Page>
  );
}

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api, qs, today } from "../api";
import { Badge, Field, Modal, Page, Problems, Spinner, Table, useToast } from "../ui";

export default function Allocations() {
  const toast = useToast();
  const [rows, setRows] = useState<any[] | null>(null); const [assets, setAssets] = useState<any[]>([]); const [active, setActive] = useState(true); const [q, setQ] = useState("");
  const [edit, setEdit] = useState<any>(null); const [ret, setRet] = useState<any>(null);
  const load = () => { api(`/api/allocations?${qs({ active_only: active, q })}`).then(setRows); api("/api/assets").then(setAssets); };
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [active, q]);
  const a = assets.find((x) => String(x.id) === edit?.asset_pk);
  const problems: string[] = [];
  if (edit) {
    if (!edit.asset_pk) problems.push("Choose an asset");
    if (!edit.allocated_to.trim()) problems.push("Enter who or where it is allocated to");
    if (!(Number.isInteger(+edit.qty) && +edit.qty > 0)) problems.push("Quantity must be at least 1");
    else if (a && +edit.qty > a.free) problems.push(`Only ${a.free} working unit(s) are free`);
  }
  const save = async () => { try { await api("/api/allocations", { json: { ...edit, asset_pk: +edit.asset_pk, qty: +edit.qty } }); toast("ok", "Allocation recorded"); setEdit(null); load(); } catch (e: any) { toast("err", e.message); } };
  const doReturn = async () => { try { await api(`/api/allocations/${ret.x.id}/return`, { json: { returned_on: ret.date } }); toast("ok", "Marked as returned"); setRet(null); load(); } catch (e: any) { toast("err", e.message); } };
  return (
    <Page title="Equipment Allocation" actions={<button className="btn" onClick={() => setEdit({ asset_pk: "", allocated_to: "", purpose: "", qty: "1", location: "", allocated_on: today(), remarks: "" })}><Plus size={16} />New allocation</button>}>
      <div className="card flex flex-wrap items-center gap-3"><input className="input max-w-sm" placeholder="Search equipment, asset ID or person..." value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />Active only</label></div>
      <div className="card">{!rows ? <Spinner /> : <Table empty="No allocations" cols={["Asset ID", "Equipment", "Allocated to", "Purpose", "Qty", "Location", "Allocated", "Returned", ""]}
        rows={rows.map((x) => [<span className="font-mono text-cyan-300">{x.asset_id}</span>, x.name, x.allocated_to, x.purpose || "-", x.qty, x.location || "-", x.allocated_on, x.returned_on || <Badge s="Open" />,
          x.active ? <button className="btn-ghost" onClick={() => setRet({ x, date: today() })}>Mark returned</button> : ""])} />}</div>
      <Modal open={!!edit} title="Allocate equipment" onClose={() => setEdit(null)}>{edit && <div className="space-y-3">
        <Field label="Asset *"><select className="input" value={edit.asset_pk} onChange={(e) => setEdit({ ...edit, asset_pk: e.target.value })}><option value="">- select -</option>
          {assets.filter((x) => x.free > 0).map((x) => <option key={x.id} value={x.id}>{x.asset_id} - {x.name} ({x.free} free)</option>)}</select></Field>
        <Field label="Allocated to *" hint="Person, batch, lab or department"><input className="input" value={edit.allocated_to} onChange={(e) => setEdit({ ...edit, allocated_to: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Quantity"><input className="input" type="number" min={1} value={edit.qty} onChange={(e) => setEdit({ ...edit, qty: e.target.value })} /></Field>
          <Field label="Date"><input className="input" type="date" value={edit.allocated_on} onChange={(e) => setEdit({ ...edit, allocated_on: e.target.value })} /></Field></div>
        <Field label="Location"><input className="input" value={edit.location} onChange={(e) => setEdit({ ...edit, location: e.target.value })} placeholder={a?.location} /></Field>
        <Field label="Purpose"><input className="input" value={edit.purpose} onChange={(e) => setEdit({ ...edit, purpose: e.target.value })} /></Field>
        <Problems list={problems} /><button className="btn w-full" disabled={problems.length > 0} onClick={save}>Allocate</button></div>}</Modal>
      <Modal open={!!ret} title="Return allocation" onClose={() => setRet(null)}>{ret && <div className="space-y-3"><p className="text-sm">{ret.x.name} x {ret.x.qty} from {ret.x.allocated_to}</p>
        <Field label="Return date"><input className="input" type="date" min={ret.x.allocated_on} value={ret.date} onChange={(e) => setRet({ ...ret, date: e.target.value })} /></Field>
        <button className="btn w-full" onClick={doReturn}>Confirm return</button></div>}</Modal>
    </Page>
  );
}

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../api";
import { Badge, Confirm, Field, Modal, Page, Spinner, Table, useToast } from "../ui";

const EMPTY = { id: 0, name: "", category: "General", total_qty: 0, min_stock: 0, box_no: "", reserved_qty: 0, not_working_qty: 0, teacher_only: false, daily_use: false, notes: "" };
export default function Inventory({ admin }: { admin: boolean }) {
  const toast = useToast();
  const [items, setItems] = useState<any[] | null>(null); const [edit, setEdit] = useState<any>(null); const [adj, setAdj] = useState<any>(null);
  const [delta, setDelta] = useState("0"); const [reason, setReason] = useState(""); const [del, setDel] = useState<any>(null); const [hist, setHist] = useState<any>(null);
  const [holders, setHolders] = useState<any[]>([]); const [hold, setHold] = useState<any>(null);
  const load = () => { api("/api/inventory").then(setItems); api("/api/inventory/holders").then(setHolders).catch(() => setHolders([])); };
  useEffect(() => { load(); }, []);
  const save = async () => {
    try { await api(edit.id ? `/api/inventory/${edit.id}` : "/api/inventory", { method: edit.id ? "PUT" : "POST", json: { name: edit.name, category: edit.category, total_qty: +edit.total_qty, min_stock: +edit.min_stock, box_no: edit.box_no, reserved_qty: +edit.reserved_qty, not_working_qty: +edit.not_working_qty, teacher_only: !!edit.teacher_only, daily_use: !!edit.daily_use, notes: edit.notes } });
      toast("ok", "Item saved"); setEdit(null); load(); } catch (e: any) { toast("err", e.message); }
  };
  const doAdjust = async () => { try { await api(`/api/inventory/${adj.id}/adjust`, { json: { delta: +delta, reason } }); toast("ok", "Stock adjusted"); setAdj(null); load(); } catch (e: any) { toast("err", e.message); } };
  const doDelete = async () => { try { await api(`/api/inventory/${del.id}`, { method: "DELETE" }); toast("ok", "Item deleted"); load(); } catch (e: any) { toast("err", e.message); } setDel(null); };
  const showHist = async (i: any) => setHist({ item: i, ...(await api(`/api/inventory/${i.id}/history`)) });
  if (!items) return <Spinner />;
  return (
    <Page title="Inventory / Stock" actions={admin && <button className="btn" onClick={() => setEdit({ ...EMPTY })}><Plus size={16} />Add item</button>}>
      <div className="card"><Table empty="No items yet" cols={["Sr No", "Item Name", "Category", "Box", "In Stock", "Out Now", "Available", "Held By", "Reserved", "Not Working", "Min Stock", "", ""]}
        rows={items.map((i, n) => [n + 1, <span>{i.name}{i.teacher_only && <span className="chip ml-2">Teachers only</span>}{i.daily_use && <span className="chip ml-2 border-cyan-400/50 text-cyan-200">Daily</span>}</span>, i.category, i.box_no || "-", i.total_qty, i.out_now, <span className={i.low_stock && i.min_stock > 0 ? "font-semibold text-red-600" : ""}>{i.available}</span>, (() => { const h = holders.filter((x) => x.item === i.name); return h.length ? <button className="btn-ghost" onClick={() => setHold({ item: i, list: h })}>{h.reduce((s, x) => s + x.qty, 0)} with {h.length}</button> : "-"; })(), i.reserved_qty || "-", i.not_working_qty || "-", i.min_stock,
          i.total_qty === 0 ? <Badge s="Late" /> : i.low_stock && i.min_stock > 0 ? <Badge s="Overdue" /> : "",
          <div className="flex gap-1"><button className="btn-ghost" onClick={() => showHist(i)}>History</button>
            {admin && <><button className="btn-ghost" onClick={() => setEdit(i)}>Edit</button><button className="btn-ghost" onClick={() => { setAdj(i); setDelta("0"); setReason(""); }}>Adjust</button><button className="btn-ghost" onClick={() => setDel(i)}>Delete</button></>}</div>])} /></div>
      <p className="text-xs text-slate-500">In Stock = usable units that can be issued. Reserved and Not Working units are tracked separately and are never issued. Teachers-only items (Full Kit) cannot be issued to students.</p>
      <Modal open={!!edit} title={edit?.id ? "Edit item" : "Add item"} onClose={() => setEdit(null)}>{edit && <div className="space-y-3">
        <Field label="Item name"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
        <Field label="Category"><input className="input" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} /></Field>
        <Field label="Total quantity"><input className="input" type="number" min={0} value={edit.total_qty} onChange={(e) => setEdit({ ...edit, total_qty: e.target.value })} /></Field>
        <Field label="Minimum stock level"><input className="input" type="number" min={0} value={edit.min_stock} onChange={(e) => setEdit({ ...edit, min_stock: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Box number"><input className="input" value={edit.box_no} onChange={(e) => setEdit({ ...edit, box_no: e.target.value })} /></Field>
          <Field label="Reserved qty"><input className="input" type="number" min={0} value={edit.reserved_qty} onChange={(e) => setEdit({ ...edit, reserved_qty: e.target.value })} /></Field>
          <Field label="Not working qty"><input className="input" type="number" min={0} value={edit.not_working_qty} onChange={(e) => setEdit({ ...edit, not_working_qty: e.target.value })} /></Field></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!edit.daily_use} onChange={(e) => setEdit({ ...edit, daily_use: e.target.checked })} />Daily use (show on Issue Items page)</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!edit.teacher_only} onChange={(e) => setEdit({ ...edit, teacher_only: e.target.checked })} />Teachers only (cannot be issued to students)</label>
        <Field label="Notes"><input className="input" value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
        <button className="btn w-full" disabled={!edit.name.trim()} onClick={save}>Save</button></div>}</Modal>
      <Modal open={!!adj} title={`Adjust stock — ${adj?.name}`} onClose={() => setAdj(null)}><div className="space-y-3">
        <Field label="Change (+ add, − remove)"><input className="input" type="number" value={delta} onChange={(e) => setDelta(e.target.value)} /></Field>
        <Field label="Reason (required)"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <button className="btn w-full" disabled={!reason.trim() || +delta === 0} onClick={doAdjust}>Apply</button></div></Modal>
      <Modal open={!!hold} title={`Held by - ${hold?.item.name}`} onClose={() => setHold(null)}>{hold && <Table empty="Nobody" cols={["Name", "Type", "PRN / Div", "Slip", "Date", "Holding", "Issued"]}
        rows={hold.list.map((h: any) => [h.who, h.kind, h.kind === "Student" ? `${h.prn} / ${h.division}` : "-", h.slip_no, h.date, h.qty, h.issued])} />}</Modal>
      <Modal open={!!hist} title={`History — ${hist?.item.name}`} onClose={() => setHist(null)}>{hist && <div className="space-y-3">
        <Table empty="Never issued" cols={["Slip", "Date", "To", "Qty", "Returned", "Status"]} rows={hist.issues.map((h: any) => [h.slip_no, h.date, h.to, h.qty, h.returned, <Badge s={h.status} />])} />
        <Table empty="No stock adjustments" cols={["Change", "Reason", "When"]} rows={hist.adjustments.map((a: any) => [a.delta, a.reason, a.at.slice(0, 16)])} /></div>}</Modal>
      <Confirm open={!!del} danger title="Delete item" body={`Delete ${del?.name}? Only possible when it has never been issued.`} onYes={doDelete} onNo={() => setDel(null)} />
    </Page>
  );
}

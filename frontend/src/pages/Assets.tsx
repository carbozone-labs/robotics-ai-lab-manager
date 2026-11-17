import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api, qs, today } from "../api";
import { Badge, Confirm, Field, Modal, Page, Problems, Section, Spinner, Stat, Table, useToast } from "../ui";

const BLANK = { id: 0, asset_id: "", name: "", category: "Computer", kind: "", tracking: "quantity", brand: "", model: "", serial_number: "", quantity: "1", damaged: "0", under_maintenance: "0",
  min_quantity: "0", location: "", purchase_date: "", warranty_expiry: "", supplier: "", purchase_cost: "", remarks: "", condition: "working" };
const INDIVIDUAL = ["Desktop Computer", "CPU", "Monitor", "UPS", "Projector", "Raspberry Pi", "Robotic Kits"];
const STATES = [["working", "Working"], ["damaged", "Damaged"], ["under_maintenance", "Under maintenance"]];

export default function Assets() {
  const toast = useToast();
  const [rows, setRows] = useState<any[] | null>(null); const [st, setSt] = useState<any>(null); const [meta, setMeta] = useState<any>({ kinds: {}, locations: [], categories: [] });
  const [f, setF] = useState({ q: "", category: "", location: "", condition: "" });
  const [edit, setEdit] = useState<any>(null); const [cond, setCond] = useState<any>(null); const [tr, setTr] = useState<any>(null); const [hist, setHist] = useState<any>(null); const [del, setDel] = useState<any>(null);
  const [log, setLog] = useState({ log_date: today(), kind: "Repair", description: "", cost: "", performed_by: "" });
  const load = () => { api(`/api/assets?${qs(f)}`).then(setRows); api("/api/assets/stats").then(setSt); api("/api/assets/meta").then(setMeta); };
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [f]);

  const openEdit = (a?: any) => setEdit(a ? { ...BLANK, ...a, quantity: String(a.quantity), damaged: String(a.damaged), under_maintenance: String(a.under_maintenance), min_quantity: String(a.min_quantity),
    purchase_cost: a.purchase_cost ?? "", condition: a.damaged ? "damaged" : a.under_maintenance ? "under_maintenance" : "working" } : { ...BLANK });
  const set = (k: string, v: any) => setEdit({ ...edit, [k]: v });
  const pickKind = (kind: string) => {
    const cat = Object.entries(meta.kinds).find(([, ks]: any) => ks.includes(kind))?.[0];
    setEdit({ ...edit, kind, category: cat || edit.category, name: edit.name || kind, tracking: INDIVIDUAL.includes(kind) ? "individual" : "quantity", quantity: INDIVIDUAL.includes(kind) ? "1" : edit.quantity });
  };
  const ind = edit?.tracking === "individual";
  const qty = +edit?.quantity || 0, dmg = ind ? (edit?.condition === "damaged" ? 1 : 0) : +edit?.damaged || 0, mnt = ind ? (edit?.condition === "under_maintenance" ? 1 : 0) : +edit?.under_maintenance || 0;
  const working = qty - dmg - mnt;
  const problems: string[] = [];
  if (edit) {
    if (!edit.name.trim()) problems.push("Equipment name is required");
    if (!Number.isInteger(qty) || qty < (ind ? 1 : 0)) problems.push("Quantity must be a whole number");
    if (working < 0) problems.push("Damaged + Under maintenance cannot exceed the total quantity");
    if (ind && !edit.serial_number.trim()) problems.push("Tip: individually tracked assets should have a serial number (optional)");
    if (edit.purchase_date && edit.warranty_expiry && edit.warranty_expiry < edit.purchase_date) problems.push("Warranty expiry is before the purchase date");
  }
  const blocking = problems.filter((p) => !p.startsWith("Tip"));
  const save = async () => {
    const b = { asset_id: edit.asset_id, name: edit.name, category: edit.category, kind: edit.kind, tracking: edit.tracking, brand: edit.brand, model: edit.model, serial_number: edit.serial_number,
      quantity: qty, damaged: dmg, under_maintenance: mnt, min_quantity: +edit.min_quantity || 0, location: edit.location, purchase_date: edit.purchase_date || null,
      warranty_expiry: edit.warranty_expiry || null, supplier: edit.supplier, purchase_cost: edit.purchase_cost === "" ? null : +edit.purchase_cost, remarks: edit.remarks };
    try { await api(edit.id ? `/api/assets/${edit.id}` : "/api/assets", { method: edit.id ? "PUT" : "POST", json: b }); toast("ok", "Asset saved"); setEdit(null); load(); } catch (e: any) { toast("err", e.message); }
  };
  const doCond = async () => { try { await api(`/api/assets/${cond.a.id}/condition`, { json: { from_state: cond.from, to_state: cond.to, qty: +cond.qty, note: cond.note } }); toast("ok", "Condition updated"); setCond(null); load(); } catch (e: any) { toast("err", e.message); } };
  const doTransfer = async () => { try { await api(`/api/assets/${tr.a.id}/transfer`, { json: { to_location: tr.to, transferred_on: tr.date, transferred_by: tr.by, remarks: tr.remarks } }); toast("ok", "Transfer recorded"); setTr(null); load(); } catch (e: any) { toast("err", e.message); } };
  const showHist = async (a: any) => setHist(await api(`/api/assets/${a.id}/history`));
  const addLog = async () => { try { await api(`/api/assets/${hist.asset.id}/maintenance-log`, { json: { ...log, cost: log.cost === "" ? null : +log.cost } }); toast("ok", "Maintenance record added"); setLog({ ...log, description: "", cost: "" }); showHist(hist.asset); } catch (e: any) { toast("err", e.message); } };
  const doDelete = async (force = false) => {
    try { await api(`/api/assets/${del.a.id}?force=${force}`, { method: "DELETE" }); toast("ok", "Asset deleted"); setDel(null); load(); }
    catch (e: any) { if (e.status === 409 && !force) setDel({ ...del, msg: e.message }); else { toast("err", e.message); setDel(null); } }
  };
  const pct = (n: number) => st && st.total ? `${(100 * n / st.total).toFixed(0)}%` : "0%";

  return (
    <Page title="Lab Assets & Equipment" actions={<button className="btn" onClick={() => openEdit()}><Plus size={16} />Add asset</button>}>
      {st && <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <Stat label="Total equipment" value={st.total} hint={`${st.records} records`} /><Stat label="Working" value={st.working} tone="green" /><Stat label="Damaged" value={st.damaged} tone={st.damaged ? "red" : "cyan"} />
          <Stat label="Under maintenance" value={st.under_maintenance} tone={st.under_maintenance ? "amber" : "cyan"} /><Stat label="Computers" value={st.computers} /><Stat label="Low stock" value={st.low_stock.length} tone={st.low_stock.length ? "red" : "cyan"} />
        </div>
        <Section title="Working vs damaged">
          <div className="flex h-3 overflow-hidden rounded-full bg-slate-800" role="img" aria-label="Working, damaged and under maintenance share">
            <div className="bg-emerald-400" style={{ width: pct(st.working) }} /><div className="bg-amber-400" style={{ width: pct(st.under_maintenance) }} /><div className="bg-red-400" style={{ width: pct(st.damaged) }} /></div>
          <p className="mt-1 text-xs text-slate-400">Working {pct(st.working)} &middot; Under maintenance {pct(st.under_maintenance)} &middot; Damaged {pct(st.damaged)}</p>
          <div className="mt-3"><Table empty="No assets yet" cols={["Category", "Total", "Working", "Damaged", "Under maintenance"]} rows={st.by_category.map((c: any) => [c.category, c.total, c.working, c.damaged, c.under_maintenance])} /></div>
        </Section></>}
      <div className="card grid gap-2 md:grid-cols-4">
        <Field label="Search"><input className="input" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Name, asset ID, serial, brand..." /></Field>
        <Field label="Category"><select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">All</option>{meta.categories.map((c: string) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Location"><select className="input" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })}><option value="">All</option>{meta.locations.map((c: string) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Condition"><select className="input" value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value })}><option value="">All</option><option value="damaged">Has damaged units</option><option value="maintenance">Under maintenance</option><option value="low">Low stock</option></select></Field>
      </div>
      <div className="card">{!rows ? <Spinner /> : <Table empty="No assets found. Use Add asset to register equipment."
        cols={["Asset ID", "Equipment", "Type", "Brand / Model", "Serial", "Qty", "Working", "Damaged", "Maint.", "Location", "Warranty", ""]}
        rows={rows.map((a) => [<span className="font-mono text-cyan-300">{a.asset_id}</span>, <div>{a.name}{a.low_stock && <span className="ml-2"><Badge s="Low" /></span>}{a.parent_asset_id && <div className="text-xs text-cyan-300">on {a.parent_asset_id}</div>}</div>, <span className="text-xs">{a.category}<br />{a.kind}<br /><i>{a.tracking}</i></span>,
          `${a.brand} ${a.model}`.trim() || "-", a.serial_number || "-", a.quantity, a.working, a.damaged ? <b className="text-red-300">{a.damaged}</b> : 0, a.under_maintenance ? <b className="text-amber-300">{a.under_maintenance}</b> : 0, a.location || "-", a.warranty_expiry || "-",
          <div className="flex flex-wrap gap-1"><button className="btn-ghost" onClick={() => showHist(a)}>History</button><button className="btn-ghost" onClick={() => openEdit(a)}>Edit</button>
            <button className="btn-ghost" onClick={() => setCond({ a, from: "working", to: "under_maintenance", qty: "1", note: "" })}>Condition</button>
            <button className="btn-ghost" onClick={() => setTr({ a, to: "", date: today(), by: "", remarks: "" })}>Transfer</button><button className="btn-ghost" onClick={() => setDel({ a })}>Delete</button></div>])} />}</div>

      <Modal open={!!edit} title={edit?.id ? "Edit asset" : "Register asset"} onClose={() => setEdit(null)} wide>{edit && <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Equipment type"><select className="input" value={Object.values(meta.kinds).flat().includes(edit.kind) ? edit.kind : ""} onChange={(e) => pickKind(e.target.value)}>
            <option value="">- choose or type below -</option>{Object.entries(meta.kinds).map(([c, ks]: any) => <optgroup key={c} label={c}>{ks.map((k: string) => <option key={k}>{k}</option>)}</optgroup>)}</select></Field>
          <Field label="Equipment name *"><input className="input" value={edit.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Category"><select className="input" value={edit.category} onChange={(e) => set("category", e.target.value)}>{["Computer", "Robotics", "Furniture", "Electronics", "Other"].map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Asset ID" hint="Leave blank to auto-generate (AST-0001)"><input className="input" value={edit.asset_id} onChange={(e) => set("asset_id", e.target.value)} /></Field>
          <Field label="Tracking"><select className="input" value={edit.tracking} onChange={(e) => setEdit({ ...edit, tracking: e.target.value, quantity: e.target.value === "individual" ? "1" : edit.quantity })}>
            <option value="individual">Individual asset (one serial number)</option><option value="quantity">Quantity-based stock</option></select></Field>
          <Field label="Serial number"><input className="input" value={edit.serial_number} onChange={(e) => set("serial_number", e.target.value)} /></Field>
          <Field label="Brand"><input className="input" value={edit.brand} onChange={(e) => set("brand", e.target.value)} /></Field><Field label="Model"><input className="input" value={edit.model} onChange={(e) => set("model", e.target.value)} /></Field>
          <Field label="Location"><input className="input" list="loc-list" value={edit.location} onChange={(e) => set("location", e.target.value)} /></Field>
          {ind ? <Field label="Condition"><select className="input" value={edit.condition} onChange={(e) => set("condition", e.target.value)}>{STATES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field> : <>
            <Field label="Total quantity"><input className="input" type="number" min={0} value={edit.quantity} onChange={(e) => set("quantity", e.target.value)} /></Field>
            <Field label="Damaged"><input className="input" type="number" min={0} value={edit.damaged} onChange={(e) => set("damaged", e.target.value)} /></Field>
            <Field label="Under maintenance"><input className="input" type="number" min={0} value={edit.under_maintenance} onChange={(e) => set("under_maintenance", e.target.value)} /></Field>
            <Field label="Working (auto)"><input className="input" disabled value={working} /></Field>
            <Field label="Low-stock alert below" hint="Working units; 0 = no alert"><input className="input" type="number" min={0} value={edit.min_quantity} onChange={(e) => set("min_quantity", e.target.value)} /></Field></>}
          <Field label="Purchase date"><input className="input" type="date" value={edit.purchase_date} onChange={(e) => set("purchase_date", e.target.value)} /></Field>
          <Field label="Warranty expiry"><input className="input" type="date" value={edit.warranty_expiry} onChange={(e) => set("warranty_expiry", e.target.value)} /></Field>
          <Field label="Supplier"><input className="input" value={edit.supplier} onChange={(e) => set("supplier", e.target.value)} /></Field>
          <Field label="Purchase cost"><input className="input" type="number" min={0} step="0.01" value={edit.purchase_cost} onChange={(e) => set("purchase_cost", e.target.value)} /></Field>
        </div>
        <datalist id="loc-list">{meta.locations.map((l: string) => <option key={l} value={l} />)}</datalist>
        <Field label="Remarks"><textarea className="input" rows={2} value={edit.remarks} onChange={(e) => set("remarks", e.target.value)} /></Field>
        <Problems list={problems} /><button className="btn w-full" disabled={blocking.length > 0} onClick={save}>Save asset</button></div>}</Modal>

      <Modal open={!!cond} title={`Change condition - ${cond?.a.name}`} onClose={() => setCond(null)}>{cond && <div className="space-y-3">
        <p className="text-xs text-slate-400">Working {cond.a.working} &middot; Damaged {cond.a.damaged} &middot; Under maintenance {cond.a.under_maintenance}</p>
        <div className="grid grid-cols-2 gap-3"><Field label="Move from"><select className="input" value={cond.from} onChange={(e) => setCond({ ...cond, from: e.target.value })}>{STATES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Move to"><select className="input" value={cond.to} onChange={(e) => setCond({ ...cond, to: e.target.value })}>{STATES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field></div>
        <Field label="Units"><input className="input" type="number" min={1} value={cond.qty} onChange={(e) => setCond({ ...cond, qty: e.target.value })} /></Field>
        <Field label="Note"><input className="input" value={cond.note} onChange={(e) => setCond({ ...cond, note: e.target.value })} /></Field>
        <button className="btn w-full" disabled={cond.from === cond.to || !(+cond.qty > 0)} onClick={doCond}>Apply</button></div>}</Modal>

      <Modal open={!!tr} title={`Transfer - ${tr?.a.name}`} onClose={() => setTr(null)}>{tr && <div className="space-y-3">
        <p className="text-xs text-slate-400">From: {tr.a.location || "(no location)"} &middot; moves the whole record ({tr.a.quantity} unit(s)). For part of a stock, register it as a separate record per location.</p>
        <Field label="To location *"><input className="input" list="loc-list" value={tr.to} onChange={(e) => setTr({ ...tr, to: e.target.value })} /></Field>
        <datalist id="loc-list">{meta.locations.map((l: string) => <option key={l} value={l} />)}</datalist>
        <Field label="Date"><input className="input" type="date" value={tr.date} onChange={(e) => setTr({ ...tr, date: e.target.value })} /></Field>
        <Field label="Transferred by"><input className="input" value={tr.by} onChange={(e) => setTr({ ...tr, by: e.target.value })} /></Field>
        <Field label="Remarks"><input className="input" value={tr.remarks} onChange={(e) => setTr({ ...tr, remarks: e.target.value })} /></Field>
        <button className="btn w-full" disabled={!tr.to.trim()} onClick={doTransfer}>Record transfer</button></div>}</Modal>

      <Modal open={!!hist} title={`History - ${hist?.asset.name} (${hist?.asset.asset_id})`} onClose={() => setHist(null)} wide>{hist && <div className="space-y-4 text-sm">
        <div><h3 className="mb-1 font-medium text-cyan-300">Repair & maintenance</h3><Table empty="No maintenance records" cols={["Date", "Type", "Description", "Cost", "By"]} rows={hist.maintenance.map((m: any) => [m.date, m.kind, m.description, m.cost ?? "-", m.by])} />
          <div className="mt-2 grid gap-2 md:grid-cols-[1fr_1fr_2fr_1fr_1fr_auto]">
            <input className="input" type="date" value={log.log_date} onChange={(e) => setLog({ ...log, log_date: e.target.value })} />
            <select className="input" value={log.kind} onChange={(e) => setLog({ ...log, kind: e.target.value })}>{["Repair", "Service", "Inspection", "Replacement", "Other"].map((k) => <option key={k}>{k}</option>)}</select>
            <input className="input" placeholder="What was done" value={log.description} onChange={(e) => setLog({ ...log, description: e.target.value })} />
            <input className="input" type="number" min={0} placeholder="Cost" value={log.cost} onChange={(e) => setLog({ ...log, cost: e.target.value })} />
            <input className="input" placeholder="By" value={log.performed_by} onChange={(e) => setLog({ ...log, performed_by: e.target.value })} />
            <button className="btn" disabled={!log.description.trim()} onClick={addLog}>Add</button></div></div>
        <div><h3 className="mb-1 font-medium text-cyan-300">Transfers</h3><Table empty="Never transferred" cols={["Date", "From", "To", "By", "Remarks"]} rows={hist.transfers.map((t: any) => [t.date, t.from || "-", t.to, t.by, t.remarks])} /></div>
        <div><h3 className="mb-1 font-medium text-cyan-300">Allocations</h3><Table empty="Never allocated" cols={["To", "Qty", "Purpose", "Allocated", "Returned"]} rows={hist.allocations.map((a: any) => [a.allocated_to, a.qty, a.purpose, a.allocated_on, a.returned_on || "In use"])} /></div></div>}</Modal>

      <Confirm open={!!del} danger title="Delete asset" body={del?.msg || `Delete ${del?.a.name} (${del?.a.asset_id})? This cannot be undone.`} onNo={() => setDel(null)} onYes={() => doDelete(!!del?.msg)} />
    </Page>
  );
}

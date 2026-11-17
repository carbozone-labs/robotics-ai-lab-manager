import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, QrCode } from "lucide-react";
import { api, qs } from "../api";
import { Badge, Confirm, Field, Modal, Page, Problems, Spinner, Stat, useToast } from "../ui";

const SLOTS = ["CPU", "Monitor", "Keyboard", "Mouse", "UPS"];
const KINDS = [...SLOTS, "Computer Accessories"];
const REQ_KEY = "rlb_required_parts";
const loadReq = (): string[] => { try { const v = JSON.parse(localStorage.getItem(REQ_KEY) || "null"); if (Array.isArray(v)) return v.filter((x) => SLOTS.includes(x)); } catch { /* ignore */ } return SLOTS; };
const BULK = { prefix: "PC-", start: "1", digits: "3", count: "1", name: "Desktop Computer", brand: "", model: "", location: "", serials: "", with_accessories: [...SLOTS], purchase_date: "", warranty_expiry: "", supplier: "" };
const condTone = (c: string) => (c === "Working" ? "Working" : c === "Damaged" ? "Damaged" : "Maintenance");

export default function Computers() {
  const toast = useToast();
  const [data, setData] = useState<any>(null); const [locs, setLocs] = useState<string[]>([]);
  const [q, setQ] = useState(""); const [loc, setLoc] = useState(""); const [inc, setInc] = useState(false); const [req, setReq] = useState<string[]>(loadReq());
  const [bulk, setBulk] = useState<any>(null); const [acc, setAcc] = useState<any>(null); const [lnk, setLnk] = useState<any>(null); const [edit, setEdit] = useState<any>(null); const [unl, setUnl] = useState<any>(null);
  const load = () => api(`/api/computers?${qs({ q, location: loc, only_incomplete: inc, required: req.join(",") })}`).then(setData);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q, loc, inc, req]);
  useEffect(() => { api("/api/assets/meta").then((m) => setLocs(m.locations)); }, []);
  const toggleReq = (s: string) => { const n = req.includes(s) ? req.filter((x) => x !== s) : [...req, s]; setReq(n); localStorage.setItem(REQ_KEY, JSON.stringify(n)); };
  const fail = (e: any) => toast("err", e.message);

  const serialList = bulk ? bulk.serials.split(/\r?\n/).map((s: string) => s.trim()) : [];
  const nSerial = serialList.filter((s: string) => s).length;
  const cnt = bulk ? Math.floor(+bulk.count) : 0, start = bulk ? Math.floor(+bulk.start) : 0, digits = bulk ? Math.floor(+bulk.digits) : 3;
  const idOf = (i: number) => `${bulk.prefix}${String(start + i).padStart(digits, "0")}`;
  const bulkProblems: string[] = [];
  if (bulk) {
    if (!(cnt >= 1 && cnt <= 200)) bulkProblems.push("Number of computers must be between 1 and 200");
    if (!/^[A-Za-z0-9._-]*$/.test(bulk.prefix)) bulkProblems.push("Prefix may only contain letters, digits, . _ -");
    if (nSerial > 0 && nSerial !== cnt) bulkProblems.push(`Serial numbers: you entered ${nSerial}, but there are ${cnt} computers (leave empty or one per computer)`);
    if (new Set(serialList.filter((s: string) => s).map((s: string) => s.toLowerCase())).size !== nSerial) bulkProblems.push("The same serial number is listed twice");
  }
  const doBulk = async () => {
    try {
      const r = await api("/api/computers/bulk", { json: { ...bulk, start, digits, count: cnt, serials: nSerial ? serialList.slice(0, cnt) : [], purchase_date: bulk.purchase_date || null, warranty_expiry: bulk.warranty_expiry || null } });
      toast("ok", `${r.created} computer(s) created (${r.first} - ${r.last}) with ${r.accessories} accessory record(s)`); setBulk(null); load();
    } catch (e: any) { fail(e); }
  };
  const doAcc = async () => { try { await api(`/api/computers/${acc.pc.id}/accessories`, { json: { kind: acc.kind, name: acc.name, brand: acc.brand, model: acc.model, serial_number: acc.serial, asset_id: acc.asset_id } }); toast("ok", `${acc.kind} added to ${acc.pc.asset_id}`); setAcc(null); load(); } catch (e: any) { fail(e); } };
  const openLink = async (pc: any, kind = "") => setLnk({ pc, list: await api("/api/computers/unlinked"), pick: "", kind });
  const doLink = async () => { try { await api(`/api/computers/${lnk.pc.id}/link`, { json: { accessory_pk: +lnk.pick } }); toast("ok", "Accessory linked"); setLnk(null); load(); } catch (e: any) { fail(e); } };
  const doUnlink = async () => { try { await api(`/api/computers/unlink/${unl.part.id}`, { method: "POST" }); toast("ok", `${unl.part.asset_id} detached from ${unl.pc.asset_id}`); load(); } catch (e: any) { fail(e); } setUnl(null); };
  const doEdit = async () => {
    try { await api(`/api/computers/parts/${edit.id}`, { method: "PATCH", json: { name: edit.name, brand: edit.brand, model: edit.model, serial_number: edit.serial_number, location: edit.location, remarks: edit.remarks, condition: edit.cond } }); toast("ok", "Saved"); setEdit(null); load(); }
    catch (e: any) { fail(e); }
  };
  const openEdit = (p: any) => setEdit({ ...p, cond: p.condition === "Damaged" ? "damaged" : p.condition === "Working" ? "working" : "under_maintenance" });
  const st = data?.stats;

  return (
    <Page title="Computer Systems" actions={<><Link className="btn-ghost" to="/labels?type=computers"><QrCode size={16} />QR labels</Link><button className="btn" onClick={() => setBulk({ ...BULK })}><Plus size={16} />Add computers</button></>}>
      {st && <div className="grid grid-cols-2 gap-3 md:grid-cols-5"><Stat label="Computers" value={st.computers} /><Stat label="Complete" value={st.complete} tone="green" hint="all required parts linked" />
        <Stat label="Incomplete" value={st.incomplete} tone={st.incomplete ? "amber" : "cyan"} hint="a required part is missing" /><Stat label="Linked accessories" value={st.linked_accessories} />
        <Stat label="Unlinked accessories" value={st.unlinked_accessories} tone={st.unlinked_accessories ? "amber" : "cyan"} hint="not attached to any PC" /></div>}
      <div className="no-print card space-y-3">
        <div className="grid gap-2 md:grid-cols-4">
          <div className="md:col-span-2"><Field label="Search"><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="PC ID, serial number, brand, location, accessory serial..." /></Field></div>
          <Field label="Location"><select className="input" value={loc} onChange={(e) => setLoc(e.target.value)}><option value="">All</option>{locs.map((l) => <option key={l}>{l}</option>)}</select></Field>
          <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={inc} onChange={(e) => setInc(e.target.checked)} />Only incomplete PCs</label></div>
        <div className="flex flex-wrap items-center gap-3 text-sm"><span className="text-xs text-slate-400">Every PC must have:</span>
          {SLOTS.map((s) => <label key={s} className="flex items-center gap-1"><input type="checkbox" checked={req.includes(s)} onChange={() => toggleReq(s)} />{s}</label>)}</div>
      </div>
      {!data ? <Spinner /> : data.items.length === 0 ? <div className="card p-8 text-center text-sm text-slate-400">No computers found. Use <b>Add computers</b> to create PC-001, PC-002 ... in one go.</div> :
        <div className="grid gap-3 xl:grid-cols-2">{data.items.map((p: any) => (
          <div key={p.id} className={`card space-y-3 ${p.complete ? "" : "!border-amber-400/40"}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><Link to={`/scan/${encodeURIComponent(p.asset_id)}`} className="font-mono text-lg text-cyan-300 hover:underline">{p.asset_id}</Link>
                <span className="ml-2"><Badge s={condTone(p.condition)} /></span>
                <div className="text-sm text-slate-300">{`${p.brand} ${p.model}`.trim() || p.name} &middot; S/N <span className="font-mono">{p.serial_number || "-"}</span></div>
                <div className="text-xs text-slate-400">{p.location || "No location"}</div></div>
              <div className="flex flex-wrap gap-1"><button className="btn-ghost" onClick={() => openEdit(p)}>Edit PC</button><button className="btn-ghost" onClick={() => openLink(p)}>Link existing</button>
                <button className="btn-ghost" onClick={() => setAcc({ pc: p, kind: p.missing[0] || "Computer Accessories", name: "", brand: "", model: "", serial: "", asset_id: "" })}>+ Accessory</button></div></div>
            {p.complete ? <div className="text-xs text-emerald-300">&#10003; All required parts are linked</div> : <div className="text-xs text-amber-300">Missing: {p.missing.join(", ")}</div>}
            <div className="divide-y divide-slate-800 rounded-lg border border-slate-700/60 text-sm">
              {p.accessories.map((a: any) => (
                <div key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <span className="w-28 shrink-0 text-slate-300">{a.kind}</span>
                  <Link to={`/scan/${encodeURIComponent(a.asset_id)}`} className="font-mono text-xs text-cyan-300 hover:underline">{a.asset_id}</Link>
                  <span className="text-xs text-slate-400">{`${a.brand} ${a.model}`.trim()}</span>
                  <span className="font-mono text-xs">S/N {a.serial_number || <i className="text-slate-500">not entered</i>}</span>
                  <span className="ml-auto flex items-center gap-1"><Badge s={condTone(a.condition)} /><button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => openEdit(a)}>Edit</button>
                    <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setUnl({ pc: p, part: a })}>Unlink</button></span></div>))}
              {p.missing.map((m: string) => (
                <div key={m} className="flex items-center gap-3 px-3 py-2 text-slate-500"><span className="w-28 shrink-0">{m}</span><span className="text-xs italic">missing</span>
                  <span className="ml-auto flex gap-1"><button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setAcc({ pc: p, kind: m, name: "", brand: "", model: "", serial: "", asset_id: "" })}>Add new</button>
                    <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => openLink(p, m)}>Link existing</button></span></div>))}
            </div>
          </div>))}</div>}

      <Modal open={!!bulk} title="Add computers" onClose={() => setBulk(null)} wide>{bulk && <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="ID prefix"><input className="input" value={bulk.prefix} onChange={(e) => setBulk({ ...bulk, prefix: e.target.value })} /></Field>
          <Field label="Start number"><input className="input" type="number" min={0} value={bulk.start} onChange={(e) => setBulk({ ...bulk, start: e.target.value })} /></Field>
          <Field label="Digits"><input className="input" type="number" min={1} max={5} value={bulk.digits} onChange={(e) => setBulk({ ...bulk, digits: e.target.value })} /></Field>
          <Field label="How many computers"><input className="input" type="number" min={1} max={200} value={bulk.count} onChange={(e) => setBulk({ ...bulk, count: e.target.value })} /></Field>
          <Field label="Brand"><input className="input" value={bulk.brand} onChange={(e) => setBulk({ ...bulk, brand: e.target.value })} /></Field>
          <Field label="Model"><input className="input" value={bulk.model} onChange={(e) => setBulk({ ...bulk, model: e.target.value })} /></Field>
          <Field label="Location"><input className="input" list="pc-locs" value={bulk.location} onChange={(e) => setBulk({ ...bulk, location: e.target.value })} /></Field>
          <Field label="Supplier"><input className="input" value={bulk.supplier} onChange={(e) => setBulk({ ...bulk, supplier: e.target.value })} /></Field>
          <Field label="Purchase date"><input className="input" type="date" value={bulk.purchase_date} onChange={(e) => setBulk({ ...bulk, purchase_date: e.target.value })} /></Field>
          <Field label="Warranty expiry"><input className="input" type="date" value={bulk.warranty_expiry} onChange={(e) => setBulk({ ...bulk, warranty_expiry: e.target.value })} /></Field></div>
        <datalist id="pc-locs">{locs.map((l) => <option key={l} value={l} />)}</datalist>
        <div><div className="mb-1 text-xs font-medium text-slate-400">Also create these accessory records for every PC (serial numbers can be added later)</div>
          <div className="flex flex-wrap gap-4 text-sm">{KINDS.map((k) => <label key={k} className="flex items-center gap-1"><input type="checkbox" checked={bulk.with_accessories.includes(k)}
            onChange={() => setBulk({ ...bulk, with_accessories: bulk.with_accessories.includes(k) ? bulk.with_accessories.filter((x: string) => x !== k) : [...bulk.with_accessories, k] })} />{k}</label>)}</div></div>
        <Field label="PC serial numbers (optional): one per line, in order" hint="Paste from Excel. Leave empty to add serial numbers later."><textarea className="input font-mono" rows={4} value={bulk.serials} onChange={(e) => setBulk({ ...bulk, serials: e.target.value })} /></Field>
        {cnt >= 1 && cnt <= 200 && <p className="text-xs text-cyan-200">Will create {idOf(0)}{cnt > 1 ? ` ... ${idOf(cnt - 1)}` : ""} ({cnt} PC{cnt > 1 ? "s" : ""}, {cnt * bulk.with_accessories.length} accessory records)</p>}
        <Problems list={bulkProblems} /><button className="btn w-full" disabled={bulkProblems.length > 0} onClick={doBulk}>Create</button></div>}</Modal>

      <Modal open={!!acc} title={`Add accessory to ${acc?.pc.asset_id}`} onClose={() => setAcc(null)}>{acc && <div className="space-y-3">
        <Field label="Type"><select className="input" value={acc.kind} onChange={(e) => setAcc({ ...acc, kind: e.target.value })}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Brand"><input className="input" value={acc.brand} onChange={(e) => setAcc({ ...acc, brand: e.target.value })} /></Field>
          <Field label="Model"><input className="input" value={acc.model} onChange={(e) => setAcc({ ...acc, model: e.target.value })} /></Field></div>
        <Field label="Serial number"><input className="input" value={acc.serial} onChange={(e) => setAcc({ ...acc, serial: e.target.value })} /></Field>
        <Field label="Name (optional)"><input className="input" value={acc.name} onChange={(e) => setAcc({ ...acc, name: e.target.value })} placeholder={acc.kind} /></Field>
        <Field label="Asset ID (optional)" hint={`Blank = ${acc.pc.asset_id}-...`}><input className="input" value={acc.asset_id} onChange={(e) => setAcc({ ...acc, asset_id: e.target.value })} /></Field>
        <button className="btn w-full" onClick={doAcc}>Add accessory</button></div>}</Modal>

      <Modal open={!!lnk} title={`Link existing accessory to ${lnk?.pc.asset_id}`} onClose={() => setLnk(null)}>{lnk && <div className="space-y-3">
        <p className="text-xs text-slate-400">Shows individually tracked accessories that are not attached to any PC. To move one from another PC, detach it there first (or edit via Lab Assets).</p>
        <Field label="Accessory"><select className="input" value={lnk.pick} onChange={(e) => setLnk({ ...lnk, pick: e.target.value })}><option value="">- select -</option>
          {lnk.list.filter((a: any) => !lnk.kind || a.kind === lnk.kind).map((a: any) => <option key={a.id} value={a.id}>{a.kind} - {a.asset_id}{a.serial_number ? ` (S/N ${a.serial_number})` : ""}</option>)}</select></Field>
        {lnk.list.length === 0 && <p className="text-xs text-amber-300">No unlinked accessories exist. Use &quot;+ Accessory&quot; to register a new one.</p>}
        <button className="btn w-full" disabled={!lnk.pick} onClick={doLink}>Link</button></div>}</Modal>

      <Modal open={!!edit} title={`Edit ${edit?.asset_id}`} onClose={() => setEdit(null)}>{edit && <div className="space-y-3">
        <Field label="Name"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Brand"><input className="input" value={edit.brand} onChange={(e) => setEdit({ ...edit, brand: e.target.value })} /></Field>
          <Field label="Model"><input className="input" value={edit.model} onChange={(e) => setEdit({ ...edit, model: e.target.value })} /></Field></div>
        <Field label="Serial number"><input className="input" value={edit.serial_number} onChange={(e) => setEdit({ ...edit, serial_number: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Location"><input className="input" value={edit.location} onChange={(e) => setEdit({ ...edit, location: e.target.value })} /></Field>
          <Field label="Condition"><select className="input" value={edit.cond} onChange={(e) => setEdit({ ...edit, cond: e.target.value })}><option value="working">Working</option><option value="damaged">Damaged</option><option value="under_maintenance">Under maintenance</option></select></Field></div>
        <Field label="Remarks"><input className="input" value={edit.remarks} onChange={(e) => setEdit({ ...edit, remarks: e.target.value })} /></Field>
        <button className="btn w-full" disabled={!edit.name.trim()} onClick={doEdit}>Save</button></div>}</Modal>
      <Confirm open={!!unl} title="Detach accessory" body={`Detach ${unl?.part.kind} ${unl?.part.asset_id} from ${unl?.pc.asset_id}? The record is kept and can be linked to another PC.`} onYes={doUnlink} onNo={() => setUnl(null)} />
    </Page>
  );
}

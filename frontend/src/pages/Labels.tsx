import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { api } from "../api";
import { Field, Page, Spinner, useToast } from "../ui";

const BASE_KEY = "rlb_label_base_url";
const SIZES: Record<string, [string, number]> = { small: ["Small (5 per row)", 5], medium: ["Medium (4 per row)", 4], large: ["Large (3 per row)", 3] };

export default function Labels() {
  const toast = useToast();
  const [sp] = useSearchParams();
  const [assets, setAssets] = useState<any[] | null>(null);
  const [type, setType] = useState(sp.get("type") === "all" ? "all" : "computers"); const [q, setQ] = useState(""); const [loc, setLoc] = useState("");
  const [sel, setSel] = useState<Set<number>>(new Set()); const [kids, setKids] = useState(true);
  const [base, setBase] = useState(localStorage.getItem(BASE_KEY) || window.location.origin); const [size, setSize] = useState("medium");
  const [labels, setLabels] = useState<any[] | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { api("/api/assets").then(setAssets); }, []);
  const rows = useMemo(() => (assets || []).filter((a) => (type === "all" || a.kind === "Desktop Computer") && (!loc || a.location === loc)
    && (!q || `${a.asset_id} ${a.name} ${a.serial_number} ${a.kind}`.toLowerCase().includes(q.toLowerCase()))), [assets, type, q, loc]);
  const locs = useMemo(() => [...new Set((assets || []).map((a) => a.location).filter(Boolean))].sort() as string[], [assets]);
  const toggle = (id: number) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); };
  const allShown = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const local = /^https?:\/\/(localhost|127\.|\[::1\])/i.test(base);
  const baseOk = /^https?:\/\/[^\s/]+(\/\S*)?$/.test(base.trim());

  const generate = async () => {
    setBusy(true);
    try { localStorage.setItem(BASE_KEY, base.trim()); setLabels(await api("/api/labels", { json: { asset_pks: [...sel], base_url: base.trim(), include_children: kids } })); }
    catch (e: any) { toast("err", e.message); } finally { setBusy(false); }
  };
  const cols = SIZES[size][1];

  return (
    <Page title="QR Labels" actions={<button className="btn" disabled={!labels?.length} onClick={() => window.print()}><Printer size={16} />Print labels</button>}>
      <div className="no-print space-y-4">
        <div className="card space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="md:col-span-2"><Field label="App address encoded in the QR code" hint="Phones must be able to open this address. Use this computer's network IP, e.g. http://192.168.1.20:5173 (find it with ipconfig).">
              <input className="input font-mono" value={base} onChange={(e) => setBase(e.target.value)} /></Field></div>
            <Field label="Label size"><select className="input" value={size} onChange={(e) => setSize(e.target.value)}>{Object.entries(SIZES).map(([k, [t]]) => <option key={k} value={k}>{t}</option>)}</select></Field></div>
          {local && <p className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-2 text-xs text-amber-200">You opened the app as &quot;localhost&quot;. A phone cannot open that address. Open the app using this PC&apos;s IP address (for example http://192.168.1.20:5173), or type that address above, before printing.</p>}
          {!baseOk && <p className="text-xs text-red-400">Address must start with http:// or https://</p>}
        </div>
        <div className="card space-y-3">
          <div className="grid gap-2 md:grid-cols-4">
            <Field label="Show"><select className="input" value={type} onChange={(e) => setType(e.target.value)}><option value="computers">Computers only</option><option value="all">All lab assets</option></select></Field>
            <Field label="Location"><select className="input" value={loc} onChange={(e) => setLoc(e.target.value)}><option value="">All</option>{locs.map((l) => <option key={l}>{l}</option>)}</select></Field>
            <div className="md:col-span-2"><Field label="Search"><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Asset ID, name, serial..." /></Field></div></div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={allShown} onChange={() => { const n = new Set(sel); rows.forEach((r) => (allShown ? n.delete(r.id) : n.add(r.id))); setSel(n); }} />Select all shown ({rows.length})</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={kids} onChange={(e) => setKids(e.target.checked)} />Also print labels for linked accessories</label>
            <span className="text-slate-400">{sel.size} selected</span></div>
          {!assets ? <Spinner /> : <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-700/60">{rows.length === 0 ? <p className="p-4 text-sm text-slate-400">Nothing to show. Add computers under Computer Systems, or switch to &quot;All lab assets&quot;.</p> :
            rows.map((a) => <label key={a.id} className="flex cursor-pointer items-center gap-3 border-b border-slate-800 px-3 py-1.5 text-sm last:border-0 hover:bg-cyan-400/5">
              <input type="checkbox" checked={sel.has(a.id)} onChange={() => toggle(a.id)} /><span className="w-32 font-mono text-cyan-300">{a.asset_id}</span><span className="flex-1">{a.name}</span>
              <span className="hidden font-mono text-xs text-slate-400 md:inline">{a.serial_number}</span><span className="text-xs text-slate-400">{a.location}</span></label>)}</div>}
          <button className="btn" disabled={sel.size === 0 || !baseOk || busy} onClick={generate}>{busy ? "Generating..." : `Generate labels for ${sel.size} item(s)`}</button>
        </div>
      </div>
      {labels && <div className="print-area">
        <p className="no-print mb-2 text-xs text-slate-400">{labels.length} label(s). Use Print labels, then choose your printer or &quot;Save as PDF&quot;. Scan with the phone camera to open the item&apos;s details and history.</p>
        <div className="label-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {labels.map((l) => (
            <div key={l.asset_pk} className="label-card">
              <div className="label-brand">Robotics &amp; AI Lab</div>
              <div className="qr" dangerouslySetInnerHTML={{ __html: l.svg }} />
              <div className="label-id">{l.asset_id}</div>
              <div className="label-line">{l.name}</div>
              {l.serial_number && <div className="label-line">S/N {l.serial_number}</div>}
              {l.parent_asset_id && <div className="label-line">Part of {l.parent_asset_id}</div>}
              {l.location && <div className="label-line">{l.location}</div>}
            </div>))}
        </div></div>}
    </Page>
  );
}

import { useEffect, useState } from "react";
import { api, qs, today } from "../api";
import { Badge, Confirm, Empty, Field, Modal, Page, Spinner, Table, useToast } from "../ui";

/** Slips are grouped by their own unique slip id/number (never by PRN), so one student's separate slips never mix. */
export default function Returns() {
  const toast = useToast();
  const [q, setQ] = useState(""); const [slips, setSlips] = useState<any[] | null>(null); const [hist, setHist] = useState<any[]>([]);
  const [whole, setWhole] = useState<any>(null);                      // slip being returned in full
  const [part, setPart] = useState<any>(null);                        // slip being partially returned
  const [qty, setQty] = useState<Record<number, string>>({});
  const [on, setOn] = useState(today()); const [note, setNote] = useState(""); const [ask, setAsk] = useState(false); const [busy, setBusy] = useState(false);
  const load = () => api(`/api/returns/pending?${qs({ q })}`).then(setSlips);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q]);
  const loadHist = () => api("/api/returns/history").then(setHist);
  useEffect(() => { loadHist(); }, []);

  const done = (r: any, what: string) => { toast("ok", `Slip ${r.slip_no}: ${what} - now ${r.status}`); setWhole(null); setPart(null); setAsk(false); load(); loadHist(); };
  const post = async (body: any, what: (r: any) => string) => {
    setBusy(true);
    try { const r = await api("/api/returns/slip", { json: { returned_on: on, note, ...body } }); done(r, what(r)); }
    catch (e: any) { toast("err", e.message); setAsk(false); load(); } finally { setBusy(false); }
  };
  const openPart = (s: any) => { setPart(s); setOn(today()); setNote(""); setQty(Object.fromEntries(s.lines.map((l: any) => [l.line_id, String(l.outstanding)]))); };
  const chosen = part ? part.lines.map((l: any) => ({ line_id: l.line_id, qty: Math.floor(+(qty[l.line_id] || 0)), max: l.outstanding, item: l.item })).filter((l: any) => l.qty > 0) : [];
  const partBad = !part || chosen.length === 0 || chosen.some((c: any) => c.qty > c.max) || on < part.date || on > today() ||
    part.lines.some((l: any) => +(qty[l.line_id] || 0) < 0 || (+(qty[l.line_id] || 0) > l.outstanding));
  const wholeBad = !whole || on < whole.date || on > today();

  return (
    <Page title="Return Items">
      <div className="card"><input className="input" placeholder="Search by slip number, PRN, student name or item..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {!slips ? <Spinner /> : slips.length === 0 ? <div className="card"><Empty text="No slips with items waiting to be returned" /></div> :
        slips.map((s) => (
          <div key={s.id} className="card space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><b className="text-cyan-300">Slip {s.slip_no}</b> &middot; {s.borrower}{s.prn ? ` \u00b7 PRN ${s.prn}` : ""} &middot; issued {s.date} <Badge s={s.status} /></div>
              <div className="flex gap-2">
                {s.lines.length > 1 && <button className="btn-ghost" onClick={() => openPart(s)}>Return selected quantities</button>}
                <button className="btn" onClick={() => { setWhole(s); setOn(today()); setNote(""); }}>Return all outstanding</button>
              </div>
            </div>
            <Table cols={["Item", "Issued", "Returned", "Outstanding", "Status"]}
              rows={s.lines.map((l: any) => [l.item, l.qty, l.returned, l.outstanding, <Badge s={l.status} />])} />
          </div>
        ))}
      <div className="card"><h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-cyan-300">Return history</h2>
        <Table empty="No returns recorded yet" cols={["Slip", "Borrower", "Item", "Qty", "Returned on", "Note"]} rows={hist.map((h) => [h.slip_no, h.borrower, h.item, h.qty, h.returned_on, h.note])} /></div>

      <Modal open={!!whole} title={`Return everything - slip ${whole?.slip_no}`} onClose={() => setWhole(null)}>
        {whole && <div className="space-y-3">
          <Table cols={["Item", "Qty coming back"]} rows={whole.lines.filter((l: any) => l.outstanding > 0).map((l: any) => [l.item, l.outstanding])} />
          <Field label="Actual return date"><input className="input" type="date" min={whole.date} max={today()} value={on} onChange={(e) => setOn(e.target.value)} /></Field>
          <Field label="Note (optional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <button className="btn w-full" disabled={wholeBad || busy} onClick={() => setAsk(true)}>Return all {whole.lines.filter((l: any) => l.outstanding > 0).length} item(s)</button>
        </div>}
      </Modal>
      <Modal open={!!part} title={`Return selected quantities - slip ${part?.slip_no}`} onClose={() => setPart(null)} wide>
        {part && <div className="space-y-3">
          <p className="text-xs text-slate-400">Enter how many of each item are coming back now (0 = not returned yet). Items not returned stay outstanding on the slip.</p>
          {part.lines.map((l: any) => (
            <div key={l.line_id} className="grid items-end gap-2 md:grid-cols-[2fr_1fr_1fr]">
              <div className="text-sm">{l.item} <span className="text-xs text-slate-400">(issued {l.qty}, outstanding {l.outstanding})</span></div>
              <Field label={`Returning (max ${l.outstanding})`}><input className="input" type="number" min={0} max={l.outstanding} disabled={l.outstanding === 0}
                value={l.outstanding === 0 ? 0 : qty[l.line_id] ?? ""} onChange={(e) => setQty({ ...qty, [l.line_id]: e.target.value })} /></Field>
              <Badge s={l.status} />
            </div>))}
          <Field label="Actual return date"><input className="input" type="date" min={part.date} max={today()} value={on} onChange={(e) => setOn(e.target.value)} /></Field>
          <Field label="Note (optional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <button className="btn w-full" disabled={partBad || busy} onClick={() => setAsk(true)}>Record return</button>
        </div>}
      </Modal>
      <Confirm open={ask} title="Confirm return" body={whole ? `Receive all outstanding items of slip ${whole.slip_no} on ${on}?` : `Receive ${chosen.map((c: any) => `${c.qty} x ${c.item}`).join(", ")} on ${on}?`}
        onNo={() => setAsk(false)} onYes={() => whole ? post({ slip_no: whole.slip_no }, (r) => `${r.lines_returned} item line(s) returned`)
          : post({ slip_no: part.slip_no, lines: chosen.map((c: any) => ({ line_id: c.line_id, qty: c.qty })) }, (r) => `${r.lines_returned} item line(s) returned`)} />
    </Page>
  );
}

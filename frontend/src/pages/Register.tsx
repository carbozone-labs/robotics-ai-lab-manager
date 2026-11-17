import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { api, download, qs } from "../api";
import { Badge, Field, Modal, Page, Pager, Spinner, Table } from "../ui";

export default function Register() {
  const [f, setF] = useState({ q: "", date_from: "", date_to: "", batch: "", student: "", teacher: "", item: "", status: "", slip_no: "" });
  const [sort, setSort] = useState("date"); const [desc, setDesc] = useState(true); const [page, setPage] = useState(1);
  const [data, setData] = useState<any>(null); const [batches, setBatches] = useState<string[]>([]); const [items, setItems] = useState<any[]>([]);
  const [slip, setSlip] = useState<any>(null);
  const size = 25;
  const load = useCallback(() => api(`/api/register?${qs({ ...f, sort, desc, page, size })}`).then(setData), [f, sort, desc, page]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { api("/api/batches").then(setBatches); api("/api/inventory").then(setItems); }, []);
  const set = (k: string, v: string) => { setF({ ...f, [k]: v }); setPage(1); };
  const head = (label: string, key: string) => <button className="font-semibold hover:text-cyan-300" onClick={() => { if (sort === key) setDesc(!desc); else { setSort(key); setDesc(false); } }}>{label}{sort === key ? (desc ? " \u2193" : " \u2191") : ""}</button>;
  const open = async (no: string) => setSlip(await api(`/api/slips/${no}`));
  const exportQ = qs({ q: f.q, date_from: f.date_from, date_to: f.date_to, batch: f.batch, status: f.status });
  return (
    <Page title="Issue History" actions={<>
      <button className="btn-ghost" onClick={() => download(`/api/register/export?fmt=csv&${exportQ}`, "Issue_Log.csv")}><Download size={16} />CSV</button>
      <button className="btn-ghost" onClick={() => download(`/api/register/export?fmt=xlsx&${exportQ}`, "Issue_Log.xlsx")}><Download size={16} />Excel</button></>}>
      <div className="card grid gap-2 md:grid-cols-4">
        <Field label="Search"><input className="input" value={f.q} onChange={(e) => set("q", e.target.value)} placeholder="Slip, PRN, name, item..." /></Field>
        <Field label="From"><input className="input" type="date" value={f.date_from} onChange={(e) => set("date_from", e.target.value)} /></Field>
        <Field label="To"><input className="input" type="date" value={f.date_to} onChange={(e) => set("date_to", e.target.value)} /></Field>
        <Field label="Slip number"><input className="input" value={f.slip_no} onChange={(e) => set("slip_no", e.target.value.replace(/\D/g, ""))} placeholder="1" inputMode="numeric" /></Field>
        <Field label="Batch"><select className="input" value={f.batch} onChange={(e) => set("batch", e.target.value)}><option value="">All</option>{batches.map((b) => <option key={b}>{b}</option>)}</select></Field>
        <Field label="Student (PRN / name)"><input className="input" value={f.student} onChange={(e) => set("student", e.target.value)} /></Field>
        <Field label="Teacher"><input className="input" value={f.teacher} onChange={(e) => set("teacher", e.target.value)} /></Field>
        <Field label="Item"><select className="input" value={f.item} onChange={(e) => set("item", e.target.value)}><option value="">All</option>{items.map((i) => <option key={i.id}>{i.name}</option>)}</select></Field>
        <Field label="Status"><select className="input" value={f.status} onChange={(e) => set("status", e.target.value)}><option value="">All</option><option>Not Returned</option><option>Partially Returned</option><option>Returned</option></select></Field>
      </div>
      <div className="card">
        {!data ? <Spinner /> : <>
          <Table empty="No register entries match these filters" cols={["Slip No", "Date", "Batch", "Taken by", "PRN", "Teacher name (if teacher)", "Student name (auto)", "Division", "Roll No", "Item", "Qty", "Return date", "Status (auto)"]}
            rows={data.items.map((r: any) => [<button className="text-cyan-300 underline" onClick={() => open(r["Slip No"])}>{r["Slip No"]}</button>, r.Date, r.Batch, r["Taken by"], r.PRN,
              r["Teacher name (if teacher)"], r["Student name (auto)"], r.Division, r["Roll No"], r.Item, r.Qty, r["Return date"], <Badge s={r["Status (auto)"]} />])} />
          <div className="mt-2 flex gap-3 text-xs text-slate-400">Sort: {head("Date", "date")} {head("Slip", "slip")} {head("Item", "item")} {head("Qty", "qty")}</div>
          <Pager page={page} size={size} total={data.total} onPage={setPage} /></>}
      </div>
      <Modal open={!!slip} title={`Slip ${slip?.slip_no}`} onClose={() => setSlip(null)}>
        {slip && <div className="space-y-2 text-sm"><div>{slip.date} &middot; Batch {slip.batch || "-"} &middot; <Badge s={slip.status} /></div>
          <div>{slip.taken_by === "Student" ? `${slip.student_name} (PRN ${slip.prn}, Div ${slip.division}, Roll ${slip.roll_no})` : `Teacher: ${slip.teacher_name}`}</div>
          <Table cols={["Item", "Issued", "Returned", "Return date", "Status"]} rows={slip.lines.map((l: any) => [l.item, l.qty, l.returned, l.returned_on || "-", <Badge s={l.status} />])} /></div>}
      </Modal>
    </Page>
  );
}

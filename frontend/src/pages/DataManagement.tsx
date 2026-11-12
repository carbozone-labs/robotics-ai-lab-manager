import { useState } from "react";
import { api, download } from "../api";
import { Confirm, Page, Table, useToast } from "../ui";

export default function DataManagement() {
  const toast = useToast();
  const [csv, setCsv] = useState<File | null>(null); const [prev, setPrev] = useState<any>(null);
  const [wb, setWb] = useState<File | null>(null); const [withLog, setWithLog] = useState(false); const [wbRes, setWbRes] = useState<any>(null);
  const [bak, setBak] = useState<File | null>(null); const [ask, setAsk] = useState(false); const [typed, setTyped] = useState("");
  const form = (f: File) => { const d = new FormData(); d.append("file", f); return d; };
  return (
    <Page title="Data Management (Import / Backup / Restore)">
      <div className="card space-y-3"><h2 className="font-medium">1. Student CSV (PRN, Student name, Division, Roll no)</h2>
        <input type="file" accept=".csv" onChange={(e) => { setCsv(e.target.files?.[0] || null); setPrev(null); }} />
        <button className="btn" disabled={!csv} onClick={async () => { try { setPrev(await api("/api/students/import/preview", { form: form(csv!) })); } catch (e: any) { toast("err", e.message); } }}>Validate &amp; preview</button>
        {prev && <div className="space-y-2 text-sm"><p><b>{prev.valid_count}</b> valid &middot; <b className={prev.invalid_count ? "text-red-400" : ""}>{prev.invalid_count}</b> invalid of {prev.total_rows}</p>
          <Table cols={["PRN", "Name", "Division", "Roll no"]} rows={prev.preview.map((r: any) => [r.PRN, r["Student name"], r.Division, r["Roll no"]])} />
          {prev.invalid_count > 0 && <Table cols={["Row", "PRN", "Problems"]} rows={prev.invalid.map((r: any) => [r.row, r.PRN, r.errors.join(", ")])} />}
          <button className="btn" disabled={!prev.valid_count} onClick={async () => { try { const r = await api("/api/students/import/commit", { form: form(csv!) }); toast("ok", `Imported ${r.imported}, skipped ${r.skipped}`); setPrev(null); setCsv(null); } catch (e: any) { toast("err", e.message); } }}>Import {prev.valid_count} valid record(s)</button>
          <p className="text-xs text-slate-400">Existing PRNs are never overwritten; they are reported as invalid instead.</p></div>}</div>
      <div className="card space-y-3"><h2 className="font-medium">2. Lab workbook (.xlsx) - stock items/totals, batches, optional Issue Log history</h2>
        <input type="file" accept=".xlsx" onChange={(e) => setWb(e.target.files?.[0] || null)} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={withLog} onChange={(e) => setWithLog(e.target.checked)} />Also import Issue Log history (needs students imported first)</label>
        <button className="btn" disabled={!wb} onClick={async () => { try { setWbRes(await api(`/api/admin/import-workbook?include_issue_log=${withLog}`, { form: form(wb!) })); toast("ok", "Workbook processed"); } catch (e: any) { toast("err", e.message); } }}>Import workbook</button>
        {wbRes && <pre className="overflow-x-auto rounded bg-ink-950 p-2 text-xs">{JSON.stringify(wbRes, null, 2)}</pre>}</div>
      <div className="card space-y-3"><h2 className="font-medium">3. Excel exports</h2><div className="flex flex-wrap gap-2">
        <button className="btn-ghost" onClick={() => download("/api/register/export?fmt=xlsx", "Issue_Log.xlsx")}>Issue Log (.xlsx)</button>
        <button className="btn-ghost" onClick={() => download("/api/register/export?fmt=csv", "Issue_Log.csv")}>Issue Log (.csv)</button></div>
        <p className="text-xs text-slate-400">All other CSV exports (students, teachers, timetable, assets, maintenance, inventory) are under Settings &gt; CSV Export.</p></div>
      <div className="card space-y-3"><h2 className="font-medium">4. Backup &amp; restore</h2>
        <p className="text-xs text-slate-400">The JSON backup contains every table, including teachers, timetable, assets, allocations, transfers, complaints and maintenance history. Take one before any restore.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => download("/api/admin/backup", "robotics-lab-backup.json")}>Download full backup (JSON)</button>
          <button className="btn-ghost" onClick={() => download("/api/admin/backup/pgdump", "robotics-lab.dump").catch((e) => toast("err", e.message))}>PostgreSQL dump (pg_dump)</button></div>
        <input type="file" accept=".json" onChange={(e) => setBak(e.target.files?.[0] || null)} />
        <button className="btn-danger" disabled={!bak} onClick={() => { setTyped(""); setAsk(true); }}>Restore from backup...</button></div>
      <Confirm open={ask} danger title="Restore backup" body="This REPLACES all current data with the backup. Type RESTORE below, then confirm." onNo={() => setAsk(false)}
        onYes={async () => { if (typed !== "RESTORE") return toast("err", "Type RESTORE first"); setAsk(false); try { await api("/api/admin/restore?confirm=RESTORE", { form: form(bak!) }); toast("ok", "Restored. Reloading..."); setTimeout(() => location.reload(), 1200); } catch (e: any) { toast("err", e.message); } }} />
      {ask && <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2"><input autoFocus className="input w-64 shadow-lg" placeholder="Type RESTORE" value={typed} onChange={(e) => setTyped(e.target.value)} /></div>}
    </Page>
  );
}

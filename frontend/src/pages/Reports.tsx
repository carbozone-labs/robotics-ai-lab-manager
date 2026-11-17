import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { useParams } from "react-router-dom";
import { api, download, qs } from "../api";
import { Field, Page, Spinner, Table } from "../ui";

const GROUPS: Record<string, [string, [string, string][]]> = {
  issue: ["Issue Reports", [["daily-issue", "Daily Issue Register"], ["monthly-issue", "Monthly Issue Register"], ["student-wise", "Student-wise Transactions"], ["teacher-wise", "Teacher-wise Transactions"],
    ["inventory", "Inventory Report"], ["low-stock", "Low Stock Report"], ["most-used", "Most Used Equipment"]]],
  return: ["Return Reports", [["pending", "Pending Returns"], ["slip-status", "Slip Status (all slips)"], ["returns-log", "Returns Log"]]],
  assets: ["Asset Reports", [["assets", "Asset Register"], ["asset-condition", "Working vs Damaged by Category"], ["asset-low-stock", "Asset Low Stock"], ["asset-warranty", "Warranty Expiring (60 days)"],
    ["allocations", "Equipment Allocations"], ["transfers", "Equipment Transfers"]]],
  maintenance: ["Maintenance Reports", [["complaints-pending", "Pending Complaints"], ["complaints", "All Complaints"], ["maintenance-logs", "Repair & Maintenance History"]]],
  attendance: ["Attendance Reports", [["attendance-daily", "Daily Attendance"], ["attendance-monthly", "Monthly Attendance"], ["attendance-division", "Division-wise Attendance"],
    ["attendance-student", "Student-wise Attendance"], ["attendance-absent", "Absent Student Report"], ["attendance-percentage", "Attendance Percentage"]]],
};

export default function Reports() {
  const { group = "issue" } = useParams();
  const [title, reports] = GROUPS[group] || GROUPS.issue;
  const [name, setName] = useState(reports[0][0]); const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [search, setSearch] = useState("");
  const [data, setData] = useState<any>(null);
  useEffect(() => { setName(reports[0][0]); setSearch(""); }, [group]);
  useEffect(() => {
    if (!reports.some(([k]) => k === name)) return;
    setData(null); api(`/api/reports/${name}?${qs({ date_from: from, date_to: to })}`).then(setData).catch(() => setData({ columns: [], rows: [] }));
  }, [name, from, to, group]);
  const rows = (data?.rows || []).filter((r: any[]) => !search || r.join(" ").toLowerCase().includes(search.toLowerCase()));
  const dl = (fmt: string) => download(`/api/reports/${name}?${qs({ fmt, date_from: from, date_to: to })}`, `${name}.${fmt}`);
  return (
    <Page title={title} actions={<><button className="btn-ghost" onClick={() => dl("csv")}><Download size={16} />CSV (Excel)</button><button className="btn-ghost" onClick={() => dl("pdf")}><Download size={16} />PDF</button></>}>
      <div className="card grid gap-3 md:grid-cols-4">
        <Field label="Report"><select className="input" value={name} onChange={(e) => setName(e.target.value)}>{reports.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="From"><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Search"><input className="input" value={search} onChange={(e) => setSearch(e.target.value)} /></Field>
      </div>
      <div className="card">{!data ? <Spinner /> : <Table cols={data.columns} rows={rows} empty="No data for this report and filter" />}</div>
    </Page>
  );
}

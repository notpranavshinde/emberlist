import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, LogOut, RefreshCw, ShieldCheck } from "lucide-react";

type DashboardReport = {
  generatedAt: string;
  timezone: string;
  summary: Record<string, number>;
  previousPeriod: Record<string, number> | null;
  series: Array<Record<string, string | number>>;
  versions: string[];
  coverage: { installMetricsBegin: string; legacyOnboardingIncluded: boolean };
  activation: { funnel: Datum[]; examples: Datum[]; methods: Datum[]; elapsed: Datum[]; restoreResults: Datum[] };
  engagement: EventDatum[];
  featureAdoption: Array<{ feature: string; count: number; percentage: number }>;
  reliability: { events: EventDatum[]; errors: Datum[]; platforms: Datum[]; versions: Datum[] };
  retention: { note?: string; cohorts: Array<{ day: string; size: number; d1: number; d7: number; d30: number }> };
};
type Datum = { event?: string; value?: string; count: number };
type EventDatum = { event: string; count: number };
type RangePreset = "7" | "30" | "90" | "custom";
type View = "overview" | "activation" | "engagement" | "retention" | "adoption" | "reliability";

const views: Array<{ id: View; label: string }> = [
  { id: "overview", label: "Overview" }, { id: "activation", label: "Activation" },
  { id: "engagement", label: "Engagement" }, { id: "retention", label: "Retention" },
  { id: "adoption", label: "Feature adoption" }, { id: "reliability", label: "Reliability" },
];
const summaryLabels: Record<string, string> = {
  dau: "DAU", wau: "WAU", mau: "MAU", activeInstalls: "Active installs", newInstalls: "New installs",
  sessions: "Sessions", tasksCreated: "Tasks created", tasksCompleted: "Tasks completed",
  taskCompletionRatio: "Completion ratio", activationConversion: "Activation", syncSuccess: "Sync success", errorRate: "Error rate",
};
const percentMetrics = new Set(["taskCompletionRatio", "activationConversion", "syncSuccess", "errorRate"]);

export default function StatsDashboard() {
  const initialAdminError = new URLSearchParams(window.location.hash.split("?")[1] || "").get("adminError");
  const [auth, setAuth] = useState<"loading" | "signed_out" | "authorized" | "denied" | "error">(
    initialAdminError === "access_denied" ? "denied" : "loading",
  );
  const [email, setEmail] = useState("");
  const [report, setReport] = useState<DashboardReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("overview");
  const [preset, setPreset] = useState<RangePreset>("30");
  const [platform, setPlatform] = useState("all");
  const [version, setVersion] = useState("all");
  const [compare, setCompare] = useState(true);
  const [customFrom, setCustomFrom] = useState(dayOffset(-29));
  const [customTo, setCustomTo] = useState(dayOffset(0));

  const range = useMemo(() => preset === "custom"
    ? { from: customFrom, to: customTo }
    : { from: dayOffset(-(Number(preset) - 1)), to: dayOffset(0) }, [preset, customFrom, customTo]);

  useEffect(() => {
    const errorCode = initialAdminError;
    if (errorCode === "access_denied") return;
    fetch("/api/admin/auth/session", { credentials: "same-origin", cache: "no-store" })
      .then(async response => {
        const body = await response.json().catch(() => ({}));
        if (response.ok && body.authenticated) { setEmail(body.email); setAuth("authorized"); }
        else setAuth(errorCode ? "error" : "signed_out");
      }).catch(() => setAuth("error"));
  }, [initialAdminError]);

  const load = useCallback(async () => {
    if (auth !== "authorized") return;
    setLoading(true); setError("");
    const query = new URLSearchParams({ ...range, platform, version, compare: String(compare) });
    try {
      const response = await fetch(`/api/admin/analytics?${query}`, { credentials: "same-origin", cache: "no-store" });
      if (response.status === 401) { setAuth("signed_out"); return; }
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || "Analytics could not be loaded.");
      setReport(await response.json());
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Analytics could not be loaded."); }
    finally { setLoading(false); }
  }, [auth, range, platform, version, compare]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  if (auth === "loading") return <AdminShell><CenteredState title="Checking access…" body="Verifying the private analytics session." /></AdminShell>;
  if (auth !== "authorized") {
    const denied = auth === "denied";
    return <AdminShell><CenteredState
      title={denied ? "Access denied" : auth === "error" ? "Couldn’t verify access" : "Private product analytics"}
      body={denied ? "This Google account is not authorized for Emberlist analytics." : "Sign in with the authorized Google account. This requests profile and email access only—never Google Drive."}
      action={<a className="stats-primary" href="/api/admin/auth/google/start">Continue with Google</a>}
    /></AdminShell>;
  }

  return (
    <AdminShell>
      <header className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-8">
        <div><p className="text-xs font-bold uppercase tracking-[0.24em] text-[#a05437]">Private workspace</p><h1 className="mt-1 text-2xl font-bold text-[#202b2d]">Product analytics</h1></div>
        <div className="flex items-center gap-3 text-sm text-[#66574d]"><span className="hidden sm:inline">{email}</span><button className="stats-icon" aria-label="Refresh analytics" onClick={() => void load()}><RefreshCw size={17} className={loading ? "animate-spin" : ""} /></button><button className="stats-icon" aria-label="Sign out" onClick={() => void logout()}><LogOut size={17} /></button></div>
      </header>

      <main className="mx-auto w-full max-w-[1440px] px-4 pb-12 sm:px-8">
        <section className="stats-panel mb-4 flex flex-wrap items-end gap-3 p-4" aria-label="Analytics filters">
          <Filter label="Range"><select value={preset} onChange={event => setPreset(event.target.value as RangePreset)}><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="custom">Custom</option></select></Filter>
          {preset === "custom" && <><Filter label="From"><input type="date" value={customFrom} max={customTo} onChange={event => setCustomFrom(event.target.value)} /></Filter><Filter label="To"><input type="date" value={customTo} min={customFrom} max={dayOffset(0)} onChange={event => setCustomTo(event.target.value)} /></Filter></>}
          <Filter label="Platform"><select value={platform} onChange={event => setPlatform(event.target.value)}><option value="all">All</option><option value="web">Web</option><option value="android">Android</option></select></Filter>
          <Filter label="Version"><select value={version} onChange={event => setVersion(event.target.value)}><option value="all">All versions</option>{report?.versions.map(value => <option key={value}>{value}</option>)}</select></Filter>
          <label className="flex h-10 items-center gap-2 rounded-xl border border-[#dfd5cc] px-3 text-sm font-medium"><input type="checkbox" checked={compare} onChange={event => setCompare(event.target.checked)} /> Compare previous</label>
          <button className="stats-secondary ml-auto" disabled={!report} onClick={() => report && exportCsv(report)}><Download size={16} /> Export CSV</button>
        </section>

        <nav className="mb-5 flex gap-1 overflow-x-auto rounded-2xl bg-[#ebe4de] p-1" aria-label="Dashboard views">{views.map(item => <button key={item.id} onClick={() => setView(item.id)} className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold ${view === item.id ? "bg-white text-[#202b2d] shadow-sm" : "text-[#716158] hover:text-[#202b2d]"}`}>{item.label}</button>)}</nav>
        <p className="mb-4 text-xs text-[#796a61]">All dates and boundaries use UTC. Install-based metrics begin {report?.coverage.installMetricsBegin || "with schema v2"}; legacy onboarding totals remain included.</p>
        {error ? <div role="alert" className="stats-panel border-[#e7a78f] bg-[#fff3ee] p-4 text-sm text-[#9f4427]">{error} <button className="ml-2 underline" onClick={() => void load()}>Try again</button></div> : null}
        {!report && loading ? <CenteredState title="Loading analytics…" body="Reading private aggregate counters." /> : report ? <DashboardView view={view} report={report} /> : !error ? <CenteredState title="No aggregate data yet" body="Schema-v2 client metrics will appear after the ingestion rollout." /> : null}
      </main>
    </AdminShell>
  );
}

function DashboardView({ view, report }: { view: View; report: DashboardReport }) {
  if (view === "overview") return <>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(summaryLabels).map(([key, label]) => <MetricCard key={key} label={label} value={formatMetric(key, report.summary[key])} previous={report.previousPeriod ? report.previousPeriod[key] : undefined} current={report.summary[key]} />)}</div>
    <section className="stats-panel mt-4 p-5"><SectionTitle title="Daily activity" subtitle="Active anonymous installations and successful task creation." /><LineChart series={report.series} /></section>
  </>;
  if (view === "activation") return <div className="grid gap-4 lg:grid-cols-2"><DataPanel title="Onboarding funnel" data={report.activation.funnel} /><DataPanel title="Example selection" data={report.activation.examples} /><DataPanel title="Completion method" data={report.activation.methods} /><DataPanel title="Time to activation" data={report.activation.elapsed} /><DataPanel title="Restore outcomes" data={report.activation.restoreResults} /></div>;
  if (view === "engagement") return <><DataPanel title="Engagement events" data={report.engagement} /><section className="stats-panel mt-4 p-5"><SectionTitle title="Activity over time" subtitle="Sessions, creation, completion, and normalized operation errors." /><LineChart series={report.series} keys={["sessions", "tasksCreated", "tasksCompleted", "errors"]} /></section></>;
  if (view === "retention") return <section className="stats-panel overflow-hidden"><div className="p-5"><SectionTitle title="Exact-day retention" subtitle="Dn is the share of a first-seen cohort active exactly n UTC days later." />{report.retention.note && <p className="mt-2 text-sm text-[#8b5b45]">{report.retention.note}</p>}</div><Table headers={["Cohort", "Size", "D1", "D7", "D30"]} rows={report.retention.cohorts.map(row => [row.day, row.size, `${row.d1}%`, `${row.d7}%`, `${row.d30}%`])} /></section>;
  if (view === "adoption") return <section className="stats-panel overflow-hidden"><div className="p-5"><SectionTitle title="Feature adoption" subtitle="Distinct feature users divided by active installations in this period." /></div><Table headers={["Feature", "Active installs", "Adoption"]} rows={report.featureAdoption.map(row => [humanize(row.feature), row.count, `${row.percentage}%`])} /></section>;
  return <div className="grid gap-4 lg:grid-cols-2"><DataPanel title="Reliability actions" data={report.reliability.events} /><DataPanel title="Normalized errors" data={report.reliability.errors} /><DataPanel title="Platform events" data={report.reliability.platforms} /><DataPanel title="Version events" data={report.reliability.versions} /></div>;
}

function AdminShell({ children }: { children: React.ReactNode }) { return <div className="min-h-screen bg-[#f5f1ed] text-[#202b2d]"><div className="fixed inset-x-0 top-0 h-1 bg-[#ee6a3c]" />{children}</div>; }
function CenteredState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) { return <div className="mx-auto flex min-h-[70vh] max-w-lg items-center justify-center p-6 text-center"><div><div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff0e9] text-[#d75e33]"><ShieldCheck /></div><h1 className="text-2xl font-bold">{title}</h1><p className="mt-3 leading-7 text-[#716158]">{body}</p>{action && <div className="mt-6">{action}</div>}</div></div>; }
function Filter({ label, children }: { label: string; children: React.ReactNode }) { return <label className="text-xs font-bold uppercase tracking-wider text-[#75665d]"><span className="mb-1 block">{label}</span><span className="stats-control">{children}</span></label>; }
function MetricCard({ label, value, previous, current }: { label: string; value: string; previous?: number; current: number }) { const delta = previous === undefined ? null : current - previous; return <article className="stats-panel p-5"><p className="text-sm font-semibold text-[#78685f]">{label}</p><p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>{delta !== null && <p className={`mt-2 text-xs font-semibold ${delta > 0 ? "text-[#258461]" : delta < 0 ? "text-[#b45335]" : "text-[#86766c]"}`}>{delta > 0 ? "+" : ""}{Number(delta.toFixed(1))} vs previous</p>}</article>; }
function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) { return <div><h2 className="text-lg font-bold">{title}</h2><p className="mt-1 text-sm text-[#78685f]">{subtitle}</p></div>; }
function DataPanel({ title, data }: { title: string; data: Array<Datum | EventDatum> }) { return <section className="stats-panel overflow-hidden"><div className="p-5"><h2 className="text-lg font-bold">{title}</h2></div><Table headers={["Metric", "Count"]} rows={data.map(row => [humanize(("event" in row ? row.event : row.value) || "Unknown"), row.count])} /></section>; }
function Table({ headers, rows }: { headers: string[]; rows: Array<Array<string | number>> }) { return <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[#eee7e1] text-xs uppercase tracking-wider text-[#74645b]"><tr>{headers.map(header => <th className="px-5 py-3" key={header}>{header}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr className="border-t border-[#e8dfd8]" key={index}>{row.map((cell, cellIndex) => <td className="px-5 py-3.5" key={cellIndex}>{cell}</td>)}</tr>) : <tr><td className="px-5 py-6 text-[#85756b]" colSpan={headers.length}>No data in this range.</td></tr>}</tbody></table></div>; }

function LineChart({ series, keys = ["activeInstalls", "tasksCreated"] }: { series: Array<Record<string, string | number>>; keys?: string[] }) {
  const width = 900, height = 260, pad = 34; const colors = ["#ee6a3c", "#397a73", "#8f65a6", "#b58b2a"];
  const max = Math.max(1, ...series.flatMap(row => keys.map(key => Number(row[key] || 0))));
  const points = (key: string) => series.map((row, index) => `${pad + index * ((width - pad * 2) / Math.max(1, series.length - 1))},${height - pad - Number(row[key] || 0) * ((height - pad * 2) / max)}`).join(" ");
  return <div className="mt-5"><div className="mb-3 flex flex-wrap gap-4">{keys.map((key, index) => <span className="flex items-center gap-2 text-xs font-semibold text-[#716158]" key={key}><i className="h-2.5 w-2.5 rounded-full" style={{ background: colors[index] }} />{humanize(key)}</span>)}</div><svg role="img" aria-label={`${keys.map(humanize).join(", ")} daily chart`} viewBox={`0 0 ${width} ${height}`} className="h-auto min-h-52 w-full"><line x1={pad} x2={width-pad} y1={height-pad} y2={height-pad} stroke="#d9cec5" />{[0.25, .5, .75, 1].map(value => <line key={value} x1={pad} x2={width-pad} y1={height-pad-(height-pad*2)*value} y2={height-pad-(height-pad*2)*value} stroke="#e7ded7" strokeDasharray="4 5" />)}{keys.map((key, index) => <polyline key={key} points={points(key)} fill="none" stroke={colors[index]} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />)}</svg></div>;
}

function formatMetric(key: string, value = 0) { return percentMetrics.has(key) ? `${value}%` : new Intl.NumberFormat().format(value); }
function humanize(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, char => char.toUpperCase()); }
function dayOffset(offset: number) { const date = new Date(); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10); }
async function logout() { await fetch("/api/admin/auth/logout", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" } }); window.location.reload(); }
function exportCsv(report: DashboardReport) { const rows: Array<Array<string | number>> = [["section", "metric", "value", "secondary"]]; Object.entries(report.summary).forEach(([key, value]) => rows.push(["overview", key, value, ""])); report.series.forEach(row => Object.entries(row).filter(([key]) => key !== "day").forEach(([key, value]) => rows.push(["daily_series", `${row.day}:${key}`, value, ""]))); Object.entries(report.activation).forEach(([section, values]) => values.forEach(row => rows.push([`activation_${section}`, row.event || row.value || "unknown", row.count, ""]))); report.engagement.forEach(row => rows.push(["engagement", row.event, row.count, ""])); report.featureAdoption.forEach(row => rows.push(["feature_adoption", row.feature, row.count, row.percentage])); report.reliability.events.forEach(row => rows.push(["reliability", row.event, row.count, ""])); report.reliability.errors.forEach(row => rows.push(["errors", row.value || "unknown", row.count, ""])); report.retention.cohorts.forEach(row => rows.push(["retention", row.day, row.size, `D1 ${row.d1}% / D7 ${row.d7}% / D30 ${row.d30}%`])); const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n"); const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `emberlist-analytics-${report.generatedAt.slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url); }

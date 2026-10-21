// A small green progress gauge: a real percentage (an upload being sent, companies rated so far) with a short label. `busy` adds moving stripes while work is still going on.
export default function ProgressGauge({ pct, label, busy = false, tone = "green" }: { pct: number; label: string; busy?: boolean; tone?: "green" | "grey" | "red" }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className={`gauge ${tone}${busy ? " busy" : ""}`} role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span className="gauge-bar"><i style={{ width: `${p}%` }} /></span>
      <span className="gauge-txt">{label}</span>
    </div>
  );
}

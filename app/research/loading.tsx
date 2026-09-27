export default function Loading() {
  return (
    <div className="wrap" aria-busy="true" aria-label="Loading">
      <div className="hero skel" style={{ height: 96, marginTop: 16 }} />
      <div className="kpis" style={{ marginTop: 16 }}>{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skel" style={{ height: 84 }} />)}</div>
      <div className="skel" style={{ height: 320, marginTop: 16 }} />
    </div>
  );
}

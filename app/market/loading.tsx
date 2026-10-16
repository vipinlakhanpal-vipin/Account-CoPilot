export default function Loading() {
  return (
    <div className="wrap" aria-busy="true" aria-label="Loading">
      <div className="hero skel" style={{ height: 80, marginTop: 16 }} />
      <div className="skel" style={{ height: 360, marginTop: 16 }} />
    </div>
  );
}

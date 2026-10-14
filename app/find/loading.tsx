export default function Loading() {
  return (
    <div className="wrap" aria-busy="true" aria-label="Loading">
      <div className="skel" style={{ height: 120, marginTop: 24 }} />
      <div className="skel" style={{ height: 64, margin: "16px auto 0", maxWidth: 760 }} />
      <div className="skel" style={{ height: 320, marginTop: 16 }} />
    </div>
  );
}

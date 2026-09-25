export default function Hero({ title, text }: { title: string; text: string }) {
  return (
    <div className="hero">
      <h1>{title}</h1>
      <p>{text}</p>
    </div>
  );
}

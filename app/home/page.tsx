import { redirect } from "next/navigation";
// Home now lives in the left-panel layout (About CoPilot is its first page).
export default function HomePage() { redirect("/nav/about"); }

import { requirePageUser } from "@/lib/auth";
import GameRoom from "@/components/GameRoom";
export const dynamic = "force-dynamic";
export default async function GamesPage() {
  await requirePageUser();
  return <GameRoom />;
}

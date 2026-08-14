import { redirect } from "next/navigation";
import { AppShell } from "@/components/chat/app-shell";
import { ChatsPage } from "@/components/chats/chats-page";
import { getSessionUser } from "@/lib/auth";
import { listChats } from "@/lib/chats";

export const dynamic = "force-dynamic";

export default async function ChatsRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/?auth=login");

  const chats = await listChats(user.id);

  return (
    <AppShell initialChats={chats}>
      <ChatsPage initialChats={chats} />
    </AppShell>
  );
}

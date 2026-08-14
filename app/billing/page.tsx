import { redirect } from "next/navigation";
import { AppShell } from "@/components/chat/app-shell";
import { BillingPageContent } from "@/components/billing/billing-page";
import { getSessionUser } from "@/lib/auth";
import { listChats } from "@/lib/chats";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/?auth=login&return=/billing");

  const chats = await listChats(user.id);

  return (
    <AppShell initialChats={chats}>
      <BillingPageContent />
    </AppShell>
  );
}

import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/chat/app-shell";
import { ChatWorkspace } from "@/components/chat/chat-workspace";
import { getSessionUser } from "@/lib/auth";
import { getChat, getChatImageDataUrls, listChats } from "@/lib/chats";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ start?: string }>;
};

export default async function ChatPage({ params, searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/?auth=login");

  const { id } = await params;
  const sp = await searchParams;
  const [chat, chats] = await Promise.all([
    getChat(id, user.id),
    listChats(user.id),
  ]);

  if (!chat) notFound();

  const imageDataUrls = await getChatImageDataUrls(chat);

  return (
    <AppShell initialChats={chats}>
      <ChatWorkspace
        chatId={chat._id}
        chatTitle={chat.title}
        initialMessages={chat.messages}
        initialFiles={chat.files ?? []}
        initialProjectId={chat.projectId}
        initialImageDataUrls={imageDataUrls}
        initialPackages={chat.packages ?? {}}
        initialLucaModelTier={chat.lucaModelTier}
        autoStart={sp.start === "1" && chat.messages.length === 1}
      />
    </AppShell>
  );
}

import { notFound } from "next/navigation";
import { AppShell } from "@/components/chat/app-shell";
import { ChatWorkspace } from "@/components/chat/chat-workspace";
import { getChat, getChatImageDataUrls, listChats } from "@/lib/chats";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ start?: string }>;
};

export default async function ChatPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const [chat, chats] = await Promise.all([getChat(id), listChats()]);

  if (!chat) notFound();

  const imageDataUrls = await getChatImageDataUrls(chat);

  return (
    <AppShell
      initialChats={chats}
    >
      <header className="flex h-12 items-center border-b border-zinc-800 pl-14 pr-4 lg:px-6 lg:pl-14">
        <h1 className="truncate text-sm font-medium text-zinc-200">{chat.title}</h1>
      </header>
      <ChatWorkspace
        chatId={chat._id}
        initialMessages={chat.messages}
        initialFiles={chat.files ?? []}
        initialProjectId={chat.projectId}
        initialImageDataUrls={imageDataUrls}
        initialPackages={chat.packages ?? {}}
        initialThinkingLevel={chat.thinkingLevel}
        autoStart={sp.start === "1" && chat.messages.length === 1}
      />
    </AppShell>
  );
}

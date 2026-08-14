import { redirect } from "next/navigation";
import { AppShell } from "@/components/chat/app-shell";
import { ProjectsPage } from "@/components/projects/projects-page";
import { getSessionUser } from "@/lib/auth";
import { listChats, listProjects } from "@/lib/chats";

export const dynamic = "force-dynamic";

export default async function ProjectsRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/?auth=login");

  const [projects, chats] = await Promise.all([
    listProjects(user.id),
    listChats(user.id),
  ]);

  return (
    <AppShell initialChats={chats}>
      <ProjectsPage initialProjects={projects} />
    </AppShell>
  );
}

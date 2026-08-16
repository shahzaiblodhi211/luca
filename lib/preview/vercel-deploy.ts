import type { VercelDeployFile } from "./publish-bundle";

function teamQuery(teamId?: string): string {
  const team = teamId?.trim() || "";
  if (!team) return "";
  const key = team.startsWith("team_") ? "teamId" : "slug";
  return `?${key}=${encodeURIComponent(team)}`;
}

export function vercelProjectName(chatId: string): string {
  const slug = chatId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 18);
  return `luca-${slug || "site"}`;
}

const PERMISSION_HINT =
  "This Vercel login cannot create projects. Paste a Full Account token from vercel.com/account/tokens.";

function isPermissionError(message: string): boolean {
  return /permission|not allowed|forbidden|unauthorized|scope/i.test(message);
}

async function listTeamIds(token: string): Promise<string[]> {
  const res = await fetch("https://api.vercel.com/v2/teams", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    teams?: Array<{ id?: string }>;
  };
  return (data.teams ?? []).map((t) => t.id).filter((id): id is string => Boolean(id));
}

async function deployOnce(opts: {
  name: string;
  files: VercelDeployFile[];
  token: string;
  teamId?: string;
}): Promise<{ url: string; inspectorUrl?: string; id: string }> {
  const res = await fetch(
    `https://api.vercel.com/v13/deployments${teamQuery(opts.teamId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: opts.name,
        files: opts.files,
        projectSettings: { framework: "nextjs" },
        target: "production",
      }),
    },
  );

  const data = (await res.json()) as {
    error?: { message?: string; code?: string };
    id?: string;
    url?: string;
    inspectorUrl?: string;
  };

  if (!res.ok || !data.url) {
    throw new Error(
      data.error?.message || `Vercel deploy failed (${res.status}).`,
    );
  }

  const id = data.id || "";
  const ready = id
    ? await waitForDeploymentReady(id, opts.token, opts.teamId)
    : data;
  const urlRaw = ready.url || data.url;
  const url = urlRaw.startsWith("http") ? urlRaw : `https://${urlRaw}`;
  return {
    id,
    url,
    inspectorUrl: ready.inspectorUrl || data.inspectorUrl,
  };
}

type DeploymentStatus = {
  url?: string;
  inspectorUrl?: string;
  readyState?: string;
  errorMessage?: string;
  error?: { message?: string };
};

async function waitForDeploymentReady(
  id: string,
  token: string,
  teamId?: string,
): Promise<DeploymentStatus> {
  const started = Date.now();
  while (Date.now() - started < 150_000) {
    const res = await fetch(
      `https://api.vercel.com/v13/deployments/${encodeURIComponent(id)}${teamQuery(teamId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    const data = (await res.json()) as DeploymentStatus;
    if (!res.ok) {
      await new Promise((r) => setTimeout(r, 2500));
      continue;
    }
    const state = (data.readyState || "").toUpperCase();
    if (state === "READY") return data;
    if (state === "ERROR" || state === "CANCELED") {
      throw new Error(
        data.errorMessage ||
          data.error?.message ||
          "Vercel build failed. Check the deployment logs.",
      );
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error("Vercel build timed out before the site was ready.");
}

export async function deployFilesToVercel(opts: {
  name: string;
  files: VercelDeployFile[];
  token: string;
  teamId?: string;
}): Promise<{ url: string; inspectorUrl?: string; id: string }> {
  const teamIds = await listTeamIds(opts.token);
  const targets: Array<string | undefined> = [
    opts.teamId,
    ...teamIds,
    undefined,
  ].filter((id, i, all) => all.indexOf(id) === i);

  let lastMessage = PERMISSION_HINT;
  for (const teamId of targets) {
    try {
      return await deployOnce({ ...opts, teamId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lastMessage = message;
      if (!isPermissionError(message)) throw err;
    }
  }

  throw new Error(
    isPermissionError(lastMessage) ? PERMISSION_HINT : lastMessage,
  );
}

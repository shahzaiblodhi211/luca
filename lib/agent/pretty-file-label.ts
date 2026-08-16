/** Short human label for a project path — used by phase rows and build lines. */
export function prettyFileLabel(path: string): string {
  const stem = path.split("/").pop()?.replace(/\.[^.]+$/, "") || path;
  let label = stem.replace(/[-_]+/g, " ").trim();
  const lower = path.replace(/\\/g, "/").toLowerCase();

  if (/(^|\/)globals\.css$/.test(lower)) return "global styles";
  if (/(^|\/)layout\.tsx$/.test(lower)) return "layout";
  if (/(^|\/)page\.tsx$/.test(lower)) {
    if (/(^|\/)app\/page\.tsx$/.test(lower)) return "homepage";
    const folder = path.replace(/\\/g, "/").split("/").slice(-2, -1)[0] || "page";
    return `${folder.replace(/[-_]+/g, " ")} page`;
  }
  if (/^hero$/i.test(label)) return "hero section";
  if (
    /\/components\//.test(lower) &&
    /\.(tsx|jsx)$/.test(lower) &&
    !/\b(section|page|layout|header|footer|nav|navbar|logo|provider|shell)\b/i.test(
      label,
    )
  ) {
    return `${label} section`;
  }
  return label;
}

export function phaseLabelForFile(
  path: string,
  action: "create" | "update" | "delete" = "create",
): string {
  const label = prettyFileLabel(path);
  if (action === "update") return `Updated ${label}`;
  if (action === "delete") return `Removed ${label}`;
  return `Created ${label}`;
}

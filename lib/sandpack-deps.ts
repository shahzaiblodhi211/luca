import type { ProjectFile } from "./types";

/** Pinned versions that work reliably in Sandpack */
const KNOWN_VERSIONS: Record<string, string> = {
  recharts: "2.15.0",
  "chart.js": "4.4.7",
  "react-chartjs-2": "5.3.0",
  d3: "7.9.0",
  victory: "37.3.2",
  "@nivo/core": "0.88.0",
  "@nivo/bar": "0.88.0",
  "@nivo/line": "0.88.0",
  "@nivo/pie": "0.88.0",

  "framer-motion": "11.15.0",
  motion: "11.15.0",
  "lucide-react": "0.469.0",
  clsx: "2.1.1",
  "tailwind-merge": "2.6.0",
  "class-variance-authority": "0.7.1",
  "tailwindcss-animate": "1.0.7",

  zod: "3.24.1",
  "react-hook-form": "7.54.2",
  "@hookform/resolvers": "3.9.1",

  "date-fns": "3.6.0",
  "react-day-picker": "8.10.1",

  cmdk: "1.0.4",
  sonner: "1.7.1",
  vaul: "1.1.2",
  "input-otp": "1.4.1",
  "embla-carousel-react": "8.5.1",
  "react-resizable-panels": "2.1.7",

  "@radix-ui/react-accordion": "1.2.2",
  "@radix-ui/react-alert-dialog": "1.1.4",
  "@radix-ui/react-aspect-ratio": "1.1.1",
  "@radix-ui/react-avatar": "1.1.2",
  "@radix-ui/react-checkbox": "1.1.3",
  "@radix-ui/react-collapsible": "1.1.2",
  "@radix-ui/react-dialog": "1.1.4",
  "@radix-ui/react-dropdown-menu": "2.1.4",
  "@radix-ui/react-hover-card": "1.1.4",
  "@radix-ui/react-label": "2.1.1",
  "@radix-ui/react-menubar": "1.1.4",
  "@radix-ui/react-navigation-menu": "1.2.3",
  "@radix-ui/react-popover": "1.1.4",
  "@radix-ui/react-progress": "1.1.1",
  "@radix-ui/react-radio-group": "1.2.2",
  "@radix-ui/react-scroll-area": "1.2.2",
  "@radix-ui/react-select": "2.1.4",
  "@radix-ui/react-separator": "1.1.1",
  "@radix-ui/react-slider": "1.2.2",
  "@radix-ui/react-slot": "1.1.1",
  "@radix-ui/react-switch": "1.1.2",
  "@radix-ui/react-tabs": "1.1.2",
  "@radix-ui/react-toast": "1.2.4",
  "@radix-ui/react-toggle": "1.1.1",
  "@radix-ui/react-toggle-group": "1.1.1",
  "@radix-ui/react-tooltip": "1.1.6",

  axios: "1.7.9",
  uuid: "11.0.3",
  "react-markdown": "9.0.1",
  "remark-gfm": "4.0.0",
  three: "0.171.0",
  "@react-three/fiber": "8.17.10",
  "@react-three/drei": "9.117.3",
  leaflet: "1.9.4",
  "react-leaflet": "4.2.1",
  "react-player": "2.16.0",
  swr: "2.3.0",
  zustand: "5.0.2",
};

const ALWAYS: Record<string, string> = {
  "lucide-react": KNOWN_VERSIONS["lucide-react"],
  clsx: KNOWN_VERSIONS.clsx,
  "tailwind-merge": KNOWN_VERSIONS["tailwind-merge"],
  "class-variance-authority": KNOWN_VERSIONS["class-variance-authority"],
  "@radix-ui/react-slot": KNOWN_VERSIONS["@radix-ui/react-slot"],
  recharts: KNOWN_VERSIONS.recharts,
  "framer-motion": KNOWN_VERSIONS["framer-motion"],
  "date-fns": KNOWN_VERSIONS["date-fns"],
};

const IMPORT_RE =
  /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
const REQUIRE_RE = /require\(\s*["']([^"']+)["']\s*\)/g;
const DYNAMIC_IMPORT_RE = /import\(\s*["']([^"']+)["']\s*\)/g;

function packageNameFromSpecifier(spec: string): string | null {
  if (
    !spec ||
    spec.startsWith(".") ||
    spec.startsWith("/") ||
    spec.startsWith("@/") ||
    spec.startsWith("node:") ||
    spec.startsWith("https:") ||
    spec.startsWith("http:")
  ) {
    return null;
  }

  if (spec === "next" || spec.startsWith("next/")) return null;
  if (spec === "react" || spec.startsWith("react/")) return null;
  if (spec === "react-dom" || spec.startsWith("react-dom/")) return null;
  // Broken in Sandpack (ReactCurrentOwner / peer mismatch) — shimmed in sandpack-files
  if (spec === "three" || spec.startsWith("three/")) return null;
  if (spec.startsWith("@react-three/")) return null;

  if (spec.startsWith("@")) {
    const parts = spec.split("/");
    if (parts.length < 2) return null;
    return `${parts[0]}/${parts[1]}`;
  }

  return spec.split("/")[0] || null;
}

function collectSpecifiers(code: string): string[] {
  const specs: string[] = [];
  for (const re of [IMPORT_RE, REQUIRE_RE, DYNAMIC_IMPORT_RE]) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(code)) !== null) {
      specs.push(match[1]);
    }
  }
  return specs;
}

function inferImpliedPackages(code: string): string[] {
  const implied: string[] = [];
  if (
    /\b(LineChart|BarChart|AreaChart|PieChart|RadarChart|ComposedChart|ResponsiveContainer|XAxis|YAxis|CartesianGrid|Tooltip|Legend|Cell|ScatterChart)\b/.test(
      code,
    )
  ) {
    implied.push("recharts");
  }
  if (/\b(motion\.|AnimatePresence)\b/.test(code)) {
    implied.push("framer-motion");
  }
  if (/\b(Chart|CategoryScale|LinearScale|BarElement|LineElement)\b/.test(code)) {
    implied.push("chart.js");
    implied.push("react-chartjs-2");
  }
  return implied;
}

function addDep(deps: Record<string, string>, name: string) {
  if (!name || name === "react" || name === "react-dom") return;
  deps[name] = KNOWN_VERSIONS[name] || "latest";
}

/** Pin a package to a known-good version, or use requested / latest. */
export function resolvePackageVersion(
  name: string,
  requested?: string | null,
): string {
  const req = requested?.trim();
  if (req && req !== "latest" && !req.startsWith("^") && !req.startsWith("~")) {
    // Allow explicit versions like 1.7.1
    if (/^\d/.test(req)) return req;
  }
  if (req && (req.startsWith("^") || req.startsWith("~"))) {
    return req;
  }
  return KNOWN_VERSIONS[name] || req || "latest";
}

export function isKnownPackage(name: string): boolean {
  return Boolean(KNOWN_VERSIONS[name]);
}

export function resolveSandpackDependencies(
  projectFiles: ProjectFile[],
): Record<string, string> {
  const deps: Record<string, string> = { ...ALWAYS };

  for (const file of projectFiles) {
    for (const spec of collectSpecifiers(file.code)) {
      const name = packageNameFromSpecifier(spec);
      if (name) addDep(deps, name);
    }
    for (const name of inferImpliedPackages(file.code)) {
      addDep(deps, name);
    }
  }

  return deps;
}

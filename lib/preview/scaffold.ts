import { resolveUiStubFiles } from "@/lib/sandpack-ui";

export const SCAFFOLD_UTILS = `import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`;

/**
 * React 19 / Next 16 safe theme provider.
 * next-themes injects a <script> during render which React 19 rejects —
 * this implementation uses only useEffect + documentElement.classList.
 */
export const SCAFFOLD_THEME_PROVIDER = `"use client";

import * as React from "react";

type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  attribute?: string;
  defaultTheme?: Theme;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
  storageKey?: string;
};

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "dark" | "light";
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function getSystemTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(resolved: "dark" | "light") {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  enableSystem = true,
  storageKey = "theme",
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = React.useState<"dark" | "light">(
    () => (defaultTheme === "system" ? "light" : defaultTheme),
  );

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey) as Theme | null;
      if (stored === "light" || stored === "dark" || stored === "system") {
        setThemeState(stored);
      }
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  React.useEffect(() => {
    const resolved =
      theme === "system" && enableSystem ? getSystemTheme() : theme === "dark" ? "dark" : "light";
    setResolvedTheme(resolved);
    applyTheme(resolved);

    if (theme !== "system" || !enableSystem) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const next = getSystemTheme();
      setResolvedTheme(next);
      applyTheme(next);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme, enableSystem]);

  const setTheme = React.useCallback(
    (next: Theme) => {
      setThemeState(next);
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );

  const value = React.useMemo(
    () => ({ theme, setTheme, resolvedTheme }),
    [theme, setTheme, resolvedTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: "system",
      setTheme: () => {},
      resolvedTheme: "light",
    };
  }
  return ctx;
}
`;

export const SCAFFOLD_GLOBALS_CSS = `@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

/* Neutral editorial baseline — agent MUST overwrite with a distinctive brand thesis */
:root {
  --bg: #f7f4ef;
  --bg-elevated: #ffffff;
  --fg: #1a1a1a;
  --fg-muted: #6b6560;
  --border: #e5dfd6;
  --brand: #1a1a1a;
  --brand-foreground: #f7f4ef;
  --accent: #8a9a8b;
  --radius: 0.15rem;
  --container: 72rem;

  --background: var(--bg);
  --foreground: var(--fg);
  --card: var(--bg-elevated);
  --card-foreground: var(--fg);
  --popover: var(--bg-elevated);
  --popover-foreground: var(--fg);
  --primary: var(--brand);
  --primary-foreground: var(--brand-foreground);
  --secondary: var(--bg-elevated);
  --secondary-foreground: var(--fg);
  --muted: #efeae3;
  --muted-foreground: var(--fg-muted);
  --accent-foreground: var(--fg);
  --destructive: #b91c1c;
  --destructive-foreground: #fafafa;
  --input: var(--border);
  --ring: var(--brand);
}

.dark {
  --bg: #0c0c0c;
  --bg-elevated: #161616;
  --fg: #f5f5f4;
  --fg-muted: #a8a29e;
  --border: #2a2a2a;
  --brand: #f5f5f4;
  --brand-foreground: #0c0c0c;
  --accent: #8a9a8b;
  --muted: #1c1c1c;
  --muted-foreground: var(--fg-muted);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) - 2px);
  --radius-md: var(--radius);
  --radius-lg: calc(var(--radius) + 2px);
  --radius-xl: calc(var(--radius) + 6px);
}

* {
  border-color: var(--border);
}

body {
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-body), ui-sans-serif, system-ui, sans-serif;
  margin: 0;
  min-height: 100%;
}

.font-display, h1, h2, h3 {
  font-family: var(--font-display), ui-serif, Georgia, serif;
}
`;

export const SCAFFOLD_LAYOUT = `import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Luca AI Preview",
  description: "Preview by Luca AI · Luca Technology",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
`;

export const SCAFFOLD_TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
`;

export const SCAFFOLD_POSTCSS = `const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
`;

export const SCAFFOLD_NEXT_CONFIG = `import type { NextConfig } from "next";

const basePath = process.env.LUCA_PREVIEW_BASE_PATH?.trim() || undefined;

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  images: {
    unoptimized: true,
  },
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer && process.env.LUCA_PREVIEW_NO_HMR === "1") {
      config.plugins = config.plugins.filter(
        (plugin: { constructor?: { name?: string } }) =>
          plugin?.constructor?.name !== "ReactRefreshWebpackPlugin",
      );
    }
    return config;
  },
};

export default nextConfig;
`;

export const SCAFFOLD_GITIGNORE = `node_modules
.next
.env*
`;

/** Rewrite Sandpack-style UI stubs for a real Next.js workspace. */
export function nextifyStubCode(code: string): string {
  return code
    .replaceAll('from "/lib/utils.ts"', 'from "@/lib/utils"')
    .replaceAll("from '/lib/utils.ts'", "from '@/lib/utils'")
    .replaceAll('from "/lib/utils"', 'from "@/lib/utils"')
    .replaceAll('from "/components/', 'from "@/components/')
    .replaceAll("from '/components/", "from '@/components/");
}

export function resolveNextUiStubFiles(
  allCode: string,
): Record<string, string> {
  const sandpack = resolveUiStubFiles(allCode);
  const out: Record<string, string> = {};
  for (const [sandPath, code] of Object.entries(sandpack)) {
    const nextPath = sandPath.replace(/^\//, "");
    out[nextPath] = nextifyStubCode(code);
  }
  return out;
}

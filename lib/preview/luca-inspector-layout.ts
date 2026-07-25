export function ensureInspectorInLayout(layout: string): string {
  if (layout.includes("luca-inspector")) return layout;

  let out = layout;
  if (!/import\s+Script\s+from\s+["']next\/script["']/.test(out)) {
    const importMatch = out.match(/^((?:import[\s\S]*?;\s*\n)+)/);
    if (importMatch) {
      out = out.replace(
        importMatch[1]!,
        `${importMatch[1]}import Script from "next/script";\n`,
      );
    } else {
      out = `import Script from "next/script";\n${out}`;
    }
  }

  const tag = `\n        <Script src="/luca-inspector.js" strategy="afterInteractive" />\n`;
  if (out.includes("</body>")) {
    return out.replace("</body>", `${tag}      </body>`);
  }
  if (out.includes("{children}")) {
    return out.replace(
      "{children}",
      `{children}${tag.replace(/\n/g, "")}`,
    );
  }
  return `${out}\n${tag}`;
}

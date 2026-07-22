const cnImport = `import React from "react";
import { cn } from "/lib/utils.ts";
`;

export const UI_STUBS: Record<string, string> = {
  button: `${cnImport}
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
  size?: "default" | "sm" | "lg" | "icon";
};
export function Button({ className, variant = "default", size = "default", ...props }: ButtonProps) {
  // Token-driven — never hardcode zinc/blue (Awwwards sites set --brand in globals.css)
  const variants: Record<string, string> = {
    default: "bg-[var(--brand,#1a1a1a)] text-[var(--brand-foreground,#fafafa)] hover:opacity-90",
    outline: "border border-[var(--border,#e4e4e7)] bg-transparent text-[var(--fg,#18181b)] hover:bg-[var(--bg-elevated,#f4f4f5)]",
    secondary: "bg-[var(--bg-elevated,#f4f4f5)] text-[var(--fg,#18181b)] hover:opacity-90",
    ghost: "hover:bg-[var(--bg-elevated,#f4f4f5)] text-[var(--fg,#18181b)]",
    destructive: "bg-red-600 text-white hover:bg-red-700",
    link: "text-[var(--brand,#1a1a1a)] underline-offset-4 hover:underline",
  };
  const sizes: Record<string, string> = {
    default: "h-10 px-4 py-2", sm: "h-9 px-3", lg: "h-12 px-8", icon: "h-10 w-10",
  };
  return (
    <button className={cn("inline-flex items-center justify-center rounded-[var(--radius,0.25rem)] text-sm font-medium transition-opacity disabled:opacity-50", variants[variant], sizes[size], className)} {...props} />
  );
}
`,

  card: `${cnImport}
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius,0.25rem)] border border-[var(--border,#e4e4e7)] bg-[var(--bg-elevated,#fff)] text-[var(--fg,#09090b)]", className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-2xl font-semibold leading-none tracking-tight font-[family-name:var(--font-display,ui-serif)]", className)} {...props} />;
}
export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-[var(--fg-muted,#71717a)]", className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}
export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center p-6 pt-0", className)} {...props} />;
}
`,

  input: `${cnImport}
export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("flex h-10 w-full rounded-[var(--radius,0.25rem)] border border-[var(--border,#e4e4e7)] bg-[var(--bg,#fff)] px-3 py-2 text-sm text-[var(--fg,#09090b)] outline-none focus:ring-1 focus:ring-[var(--brand,#1a1a1a)]", className)} {...props} />;
}
`,

  label: `${cnImport}
export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-medium leading-none", className)} {...props} />;
}
`,

  table: `${cnImport}
export function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return <div className="relative w-full overflow-auto"><table className={cn("w-full caption-bottom text-sm", className)} {...props} /></div>;
}
export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("[&_tr]:border-b", className)} {...props} />;
}
export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}
export function TableFooter({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tfoot className={cn("border-t bg-zinc-50 font-medium", className)} {...props} />;
}
export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b transition-colors hover:bg-zinc-50/80", className)} {...props} />;
}
export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("h-12 px-4 text-left align-middle font-medium text-zinc-500", className)} {...props} />;
}
export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("p-4 align-middle", className)} {...props} />;
}
export function TableCaption({ className, ...props }: React.HTMLAttributes<HTMLTableCaptionElement>) {
  return <caption className={cn("mt-4 text-sm text-zinc-500", className)} {...props} />;
}
`,

  badge: `${cnImport}
export function Badge({ className, variant = "default", ...props }: React.HTMLAttributes<HTMLDivElement> & { variant?: string }) {
  const variants: Record<string, string> = {
    default: "bg-zinc-900 text-white",
    secondary: "bg-zinc-100 text-zinc-900",
    outline: "border border-zinc-200 text-zinc-900",
    destructive: "bg-red-600 text-white",
  };
  return <div className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", variants[variant] || variants.default, className)} {...props} />;
}
`,

  avatar: `${cnImport}
export function Avatar({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full bg-zinc-100", className)} {...props} />;
}
export function AvatarImage({ className, src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  return <img src={src} alt={alt || ""} className={cn("aspect-square h-full w-full object-cover", className)} {...props} />;
}
export function AvatarFallback({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("flex h-full w-full items-center justify-center rounded-full bg-zinc-100 text-sm", className)} {...props} />;
}
`,

  separator: `${cnImport}
export function Separator({ className, orientation = "horizontal", ...props }: React.HTMLAttributes<HTMLDivElement> & { orientation?: "horizontal" | "vertical" }) {
  return <div className={cn("shrink-0 bg-zinc-200", orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]", className)} {...props} />;
}
`,

  tabs: `${cnImport}
const TabsCtx = React.createContext<{ value: string; setValue: (v: string) => void }>({ value: "", setValue: () => {} });
export function Tabs({ defaultValue = "", value: controlled, onValueChange, className, children, ...props }: any) {
  const [value, setValue] = React.useState(defaultValue);
  const current = controlled ?? value;
  return (
    <TabsCtx.Provider value={{ value: current, setValue: (v) => { setValue(v); onValueChange?.(v); } }}>
      <div className={cn(className)} {...props}>{children}</div>
    </TabsCtx.Provider>
  );
}
export function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("inline-flex h-10 items-center justify-center rounded-md bg-zinc-100 p-1 text-zinc-500", className)} {...props} />;
}
export function TabsTrigger({ className, value, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
  const ctx = React.useContext(TabsCtx);
  const active = ctx.value === value;
  return <button type="button" onClick={() => ctx.setValue(value)} className={cn("inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium", active && "bg-white text-zinc-950 shadow-sm", className)} {...props} />;
}
export function TabsContent({ className, value, ...props }: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  const ctx = React.useContext(TabsCtx);
  if (ctx.value !== value) return null;
  return <div className={cn("mt-2", className)} {...props} />;
}
`,

  progress: `${cnImport}
export function Progress({ className, value = 0, ...props }: React.HTMLAttributes<HTMLDivElement> & { value?: number }) {
  return (
    <div className={cn("relative h-4 w-full overflow-hidden rounded-full bg-zinc-100", className)} {...props}>
      <div className="h-full bg-zinc-900 transition-all" style={{ width: \`\${Math.min(100, Math.max(0, value))}%\` }} />
    </div>
  );
}
`,

  switch: `${cnImport}
export function Switch({ className, checked, defaultChecked, onCheckedChange, ...props }: any) {
  const [on, setOn] = React.useState(Boolean(defaultChecked));
  const isOn = checked ?? on;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      onClick={() => { const next = !isOn; setOn(next); onCheckedChange?.(next); }}
      className={cn("peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors", isOn ? "bg-zinc-900" : "bg-zinc-200", className)}
      {...props}
    >
      <span className={cn("pointer-events-none block h-5 w-5 rounded-full bg-white shadow transition-transform", isOn ? "translate-x-5" : "translate-x-0")} />
    </button>
  );
}
`,

  checkbox: `${cnImport}
export function Checkbox({ className, checked, defaultChecked, onCheckedChange, ...props }: any) {
  const [on, setOn] = React.useState(Boolean(defaultChecked));
  const isOn = checked ?? on;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isOn}
      onClick={() => { const next = !isOn; setOn(next); onCheckedChange?.(next); }}
      className={cn("h-4 w-4 shrink-0 rounded-sm border border-zinc-300", isOn && "bg-zinc-900 border-zinc-900 text-white", className)}
      {...props}
    >
      {isOn ? <span className="block text-[10px] leading-4 text-center text-white">✓</span> : null}
    </button>
  );
}
`,

  textarea: `${cnImport}
export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("flex min-h-[80px] w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400", className)} {...props} />;
}
`,

  select: `${cnImport}
/** Theme-aware select primitives — use CSS vars; agents should still wrap/brand further. */
export function Select({ children }: { children?: React.ReactNode }) {
  return <div className="relative">{children}</div>;
}
export function SelectGroup({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}
export function SelectValue({ placeholder }: { placeholder?: string }) {
  return (
    <span className="text-sm text-[var(--fg-muted,var(--muted-foreground,#71717a))]">
      {placeholder}
    </span>
  );
}
export function SelectTrigger({ className, children, ...props }: React.HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-10 w-full items-center justify-between rounded-[var(--radius,0.5rem)] border border-[var(--border,#e4e4e7)] bg-[var(--bg-elevated,var(--background,#fff))] px-3 py-2 text-sm text-[var(--fg,var(--foreground,#09090b))] outline-none transition hover:border-[var(--brand,var(--ring,#a1a1aa))] focus-visible:ring-2 focus-visible:ring-[var(--brand,var(--ring,#a1a1aa))]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
export function SelectContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "absolute z-50 mt-1 w-full overflow-hidden rounded-[var(--radius,0.5rem)] border border-[var(--border,#e4e4e7)] bg-[var(--bg-elevated,var(--card,#fff))] p-1 text-[var(--fg,var(--foreground,#09090b))] shadow-lg",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
export function SelectItem({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative flex cursor-pointer select-none items-center rounded-[calc(var(--radius,0.5rem)-2px)] px-2 py-1.5 text-sm transition hover:bg-[var(--brand,#18181b)] hover:text-[var(--brand-foreground,#fafafa)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
export function SelectLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-2 py-1.5 text-sm font-semibold text-[var(--fg-muted,#71717a)]", className)} {...props} />;
}
export function SelectSeparator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("-mx-1 my-1 h-px bg-[var(--border,#e4e4e7)]", className)} {...props} />;
}
`,

  dialog: `${cnImport}
const DialogCtx = React.createContext<{ open: boolean; setOpen: (v: boolean) => void }>({ open: false, setOpen: () => {} });
export function Dialog({ open: controlled, onOpenChange, children }: any) {
  const [open, setOpen] = React.useState(false);
  const value = controlled ?? open;
  return <DialogCtx.Provider value={{ open: value, setOpen: (v) => { setOpen(v); onOpenChange?.(v); } }}>{children}</DialogCtx.Provider>;
}
export function DialogTrigger({ asChild, children, ...props }: any) {
  const ctx = React.useContext(DialogCtx);
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as any, { onClick: () => ctx.setOpen(true) });
  }
  return <button type="button" onClick={() => ctx.setOpen(true)} {...props}>{children}</button>;
}
export function DialogContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const ctx = React.useContext(DialogCtx);
  if (!ctx.open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={cn("w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 shadow-lg", className)} {...props}>{children}</div>
    </div>
  );
}
export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />;
}
export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />;
}
export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-lg font-semibold", className)} {...props} />;
}
export function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-zinc-500", className)} {...props} />;
}
export function DialogClose({ children, ...props }: any) {
  const ctx = React.useContext(DialogCtx);
  return <button type="button" onClick={() => ctx.setOpen(false)} {...props}>{children || "Close"}</button>;
}
`,

  sheet: `${cnImport}
const SheetCtx = React.createContext<{ open: boolean; setOpen: (v: boolean) => void }>({ open: false, setOpen: () => {} });
export function Sheet({ open: controlled, onOpenChange, children }: any) {
  const [open, setOpen] = React.useState(false);
  const value = controlled ?? open;
  return <SheetCtx.Provider value={{ open: value, setOpen: (v) => { setOpen(v); onOpenChange?.(v); } }}>{children}</SheetCtx.Provider>;
}
export function SheetTrigger({ asChild, children, ...props }: any) {
  const ctx = React.useContext(SheetCtx);
  if (asChild && React.isValidElement(children)) return React.cloneElement(children as any, { onClick: () => ctx.setOpen(true) });
  return <button type="button" onClick={() => ctx.setOpen(true)} {...props}>{children}</button>;
}
export function SheetContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const ctx = React.useContext(SheetCtx);
  if (!ctx.open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className={cn("h-full w-full max-w-sm border-l border-zinc-200 bg-white p-6 shadow-lg", className)} {...props}>{children}</div>
    </div>
  );
}
export function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />;
}
export function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />;
}
export function SheetTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-lg font-semibold", className)} {...props} />;
}
export function SheetDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-zinc-500", className)} {...props} />;
}
export function SheetClose({ children, ...props }: any) {
  const ctx = React.useContext(SheetCtx);
  return <button type="button" onClick={() => ctx.setOpen(false)} {...props}>{children || "Close"}</button>;
}
`,

  "dropdown-menu": `${cnImport}
export function DropdownMenu({ children }: { children?: React.ReactNode }) { return <div className="relative inline-block">{children}</div>; }
export function DropdownMenuTrigger({ children, ...props }: any) { return <button type="button" {...props}>{children}</button>; }
export function DropdownMenuContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("z-50 min-w-[8rem] rounded-md border border-zinc-200 bg-white p-1 shadow-md", className)} {...props}>{children}</div>;
}
export function DropdownMenuItem({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm hover:bg-zinc-100", className)} {...props} />;
}
export function DropdownMenuLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-2 py-1.5 text-sm font-semibold", className)} {...props} />;
}
export function DropdownMenuSeparator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("-mx-1 my-1 h-px bg-zinc-100", className)} {...props} />;
}
export function DropdownMenuGroup({ children }: { children?: React.ReactNode }) { return <>{children}</>; }
export function DropdownMenuCheckboxItem(props: any) { return <DropdownMenuItem {...props} />; }
export function DropdownMenuRadioItem(props: any) { return <DropdownMenuItem {...props} />; }
export function DropdownMenuShortcut({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("ml-auto text-xs tracking-widest opacity-60", className)} {...props} />;
}
`,

  "scroll-area": `${cnImport}
export function ScrollArea({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("relative overflow-auto", className)} {...props}>{children}</div>;
}
export function ScrollBar() { return null; }
`,

  skeleton: `${cnImport}
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-zinc-100", className)} {...props} />;
}
`,

  alert: `${cnImport}
export function Alert({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div role="alert" className={cn("relative w-full rounded-lg border border-zinc-200 p-4", className)} {...props} />;
}
export function AlertTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h5 className={cn("mb-1 font-medium leading-none tracking-tight", className)} {...props} />;
}
export function AlertDescription({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("text-sm text-zinc-600", className)} {...props} />;
}
`,

  tooltip: `${cnImport}
export function TooltipProvider({ children }: { children?: React.ReactNode }) { return <>{children}</>; }
export function Tooltip({ children }: { children?: React.ReactNode }) { return <>{children}</>; }
export function TooltipTrigger({ children }: { children?: React.ReactNode }) { return <>{children}</>; }
export function TooltipContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("z-50 rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white", className)} {...props}>{children}</div>;
}
`,

  popover: `${cnImport}
export function Popover({ children }: { children?: React.ReactNode }) { return <div className="relative inline-block">{children}</div>; }
export function PopoverTrigger({ children }: { children?: React.ReactNode }) { return <>{children}</>; }
export function PopoverContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("z-50 w-72 rounded-md border border-zinc-200 bg-white p-4 shadow-md", className)} {...props}>{children}</div>;
}
`,

  accordion: `${cnImport}
export function Accordion({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(className)} {...props}>{children}</div>;
}
export function AccordionItem({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-b", className)} {...props} />;
}
export function AccordionTrigger({ className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={cn("flex w-full items-center justify-between py-4 text-left font-medium", className)} {...props}>{children}</button>;
}
export function AccordionContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("pb-4 pt-0 text-sm", className)} {...props} />;
}
`,

  chart: `import * as React from "react";
import { ResponsiveContainer, Tooltip } from "recharts";

export type ChartConfig = Record<string, { label?: string; color?: string }>;

export function ChartContainer({ className, children, config }: { className?: string; children: React.ReactNode; config?: ChartConfig }) {
  const style = Object.fromEntries(
    Object.entries(config || {}).map(([key, value], i) => [\`--color-\${key}\`, value.color || \`hsl(\${(i * 60) % 360} 70% 45%)\`])
  ) as React.CSSProperties;
  return (
    <div className={className || "h-[300px] w-full"} style={style}>
      <ResponsiveContainer width="100%" height="100%">{children as any}</ResponsiveContainer>
    </div>
  );
}
export function ChartTooltip(props: any) { return <Tooltip {...props} />; }
export function ChartTooltipContent({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-md">
      {label ? <div className="mb-1 font-medium">{label}</div> : null}
      {payload.map((item: any) => (
        <div key={item.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
          <span>{item.name}: {item.value}</span>
        </div>
      ))}
    </div>
  );
}
export function ChartLegend() { return null; }
export function ChartLegendContent() { return null; }
export function ChartStyle() { return null; }
`,
};

function normalizeUiName(raw: string): string {
  return raw
    .replace(/^\/+/, "")
    .replace(/^components\/ui\//, "")
    .replace(/\.(tsx|ts|jsx|js)$/, "")
    .trim();
}

function stubKey(name: string): string {
  const n = normalizeUiName(name);
  if (UI_STUBS[n]) return n;
  const dashed = n.replace(/_/g, "-");
  if (UI_STUBS[dashed]) return dashed;
  return n;
}

export function detectUiImports(code: string): string[] {
  const found = new Set<string>();
  const re =
    /from\s+["'](?:@\/components\/ui\/|\/components\/ui\/|\.\/ui\/|\.\.\/.*components\/ui\/)([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(code)) !== null) {
    found.add(normalizeUiName(match[1]));
  }
  return Array.from(found);
}

function toPascalParts(name: string): string[] {
  return normalizeUiName(name)
    .split(/[-_/]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1));
}

/** Fallback stub when a specific component isn't in the registry */
export function makeFallbackUiStub(name: string, namedExports: string[] = []): string {
  const base = toPascalParts(name).join("") || "Ui";
  const exports = namedExports.length
    ? namedExports
    : [base, `${base}Content`, `${base}Header`, `${base}Title`, `${base}Description`, `${base}Footer`, `${base}Trigger`];

  const lines = [
    `import React from "react";`,
    `import { cn } from "/lib/utils.ts";`,
    ``,
  ];

  for (const exp of exports) {
    const tag =
      /table/i.test(exp) && /head/i.test(exp)
        ? "th"
        : /table/i.test(exp) && /cell|row/i.test(exp)
          ? /row/i.test(exp)
            ? "tr"
            : "td"
          : /table/i.test(exp) && /body|header|footer/i.test(exp)
            ? /body/i.test(exp)
              ? "tbody"
              : /header/i.test(exp)
                ? "thead"
                : "tfoot"
            : /table$/i.test(exp)
              ? "table"
              : /button|trigger/i.test(exp)
                ? "button"
                : /label/i.test(exp)
                  ? "label"
                  : /input/i.test(exp)
                    ? "input"
                    : "div";

    lines.push(
      `export function ${exp}({ className, ...props }: any) {`,
      `  return <${tag} className={cn("${tag === "table" ? "w-full text-sm" : tag === "button" ? "inline-flex items-center rounded-md px-3 py-2 text-sm" : ""}", className)} {...props} />;`,
      `}`,
      ``,
    );
  }

  return lines.join("\n");
}

export function collectNamedExportsFromImport(code: string, uiPath: string): string[] {
  const escaped = uiPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `import\\s*\\{([^}]+)\\}\\s*from\\s*["'][^"']*components\\/ui\\/${escaped}["']`,
    "g",
  );
  const names: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(code)) !== null) {
    for (const part of match[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/i)[0]?.trim();
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) names.push(name);
    }
  }
  return [...new Set(names)];
}

export function resolveUiStubFiles(allCode: string): Record<string, string> {
  const needed = detectUiImports(allCode);
  // always include core set
  const always = ["button", "card", "input", "label", "table", "badge", "tabs", "avatar"];
  const names = [...new Set([...always, ...needed])];

  const files: Record<string, string> = {};

  // dialog before sheet (sheet re-exports dialog)
  const ordered = names.sort((a, b) => {
    if (a === "dialog") return -1;
    if (b === "dialog") return 1;
    return a.localeCompare(b);
  });

  for (const name of ordered) {
    const key = stubKey(name);
    const pathName = normalizeUiName(name);
    const path = `/components/ui/${pathName}.tsx`;
    if (UI_STUBS[key]) {
      files[path] = UI_STUBS[key];
    } else {
      const exports = collectNamedExportsFromImport(allCode, pathName);
      files[path] = makeFallbackUiStub(name, exports);
    }
  }

  return files;
}

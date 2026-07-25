import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

const SIZE = {
  xs: { box: "h-5 w-5", px: 20 },
  sm: { box: "h-8 w-8", px: 32 },
  md: { box: "h-10 w-10", px: 40 },
  lg: { box: "h-14 w-14", px: 56 },
} as const;

export function LucaMark({
  className,
  size = "md",
  /** `onDark` = white mark (default). `onLight` = inverted for light surfaces. */
  tone = "onDark",
}: {
  className?: string;
  size?: keyof typeof SIZE;
  tone?: "onDark" | "onLight";
}) {
  const { box, px } = SIZE[size];

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden",
        box,
        className,
      )}
      aria-hidden
    >
      <Image
        src="/brand/luca-mark.png"
        alt=""
        width={px}
        height={px}
        className={cn(
          "h-full w-full object-contain",
          tone === "onLight" && "invert",
        )}
        priority
      />
    </span>
  );
}

export function LucaWordmark({
  href = "/",
  className,
}: {
  href?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2.5 text-zinc-100 transition hover:opacity-90",
        className,
      )}
    >
      <LucaMark size="sm" />
      <span className="text-[15px] font-semibold tracking-tight">Luca</span>
    </Link>
  );
}

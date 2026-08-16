import { cn } from "@/lib/utils";

type BrandBadge = {
  src: string;
  alt: string;
  bg: string;
  invert: boolean;
};

const BADGES: Record<string, BrandBadge> = {
  visa: {
    src: "/card-brands/visa.svg",
    alt: "Visa",
    bg: "bg-[#1A1F71]",
    invert: true,
  },
  mastercard: {
    src: "/card-brands/mastercard.svg",
    alt: "Mastercard",
    bg: "bg-white",
    invert: false,
  },
  amex: {
    src: "/card-brands/amex.svg",
    alt: "American Express",
    bg: "bg-[#2E77BC]",
    invert: true,
  },
  americanexpress: {
    src: "/card-brands/amex.svg",
    alt: "American Express",
    bg: "bg-[#2E77BC]",
    invert: true,
  },
  discover: {
    src: "/card-brands/discover.svg",
    alt: "Discover",
    bg: "bg-[#FF6000]",
    invert: true,
  },
  jcb: {
    src: "/card-brands/jcb.svg",
    alt: "JCB",
    bg: "bg-[#0B4EA2]",
    invert: true,
  },
  diners: {
    src: "/card-brands/diners.svg",
    alt: "Diners Club",
    bg: "bg-[#0079BE]",
    invert: true,
  },
  dinersclub: {
    src: "/card-brands/diners.svg",
    alt: "Diners Club",
    bg: "bg-[#0079BE]",
    invert: true,
  },
};

function brandKey(brand: string): string {
  return brand.toLowerCase().replace(/[\s_-]+/g, "");
}

export function CardBrandMark({
  brand,
  className,
}: {
  brand: string;
  className?: string;
}) {
  const badge = BADGES[brandKey(brand)];

  if (!badge) {
    return (
      <span
        className={cn(
          "shrink-0 text-[11px] font-semibold uppercase tracking-wide text-zinc-400",
          className,
        )}
      >
        {brand}
      </span>
    );
  }

  return (
    <div
      className={cn(
        "flex h-8 w-[52px] shrink-0 items-center justify-center rounded-md px-2",
        badge.bg,
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${badge.src}?v=3`}
        alt={badge.alt}
        className={cn(
          "h-3.5 w-[38px] object-contain",
          badge.invert && "brightness-0 invert",
        )}
      />
    </div>
  );
}

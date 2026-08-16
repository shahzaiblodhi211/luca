"use client";

interface LogoProps {
  width?: number;
  height?: number;
  className?: string;
}

export function BrandLogo({ width = 166, height = 22, className = "" }: LogoProps) {
  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <svg
        width={width}
        height={height}
        viewBox="0 0 264 35"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-auto h-full max-h-[35px]"
      >
        {/* SHANE text */}
        <text
          x="0"
          y="26"
          fill="#FFFFFF"
          fontFamily="var(--font-montserrat), sans-serif"
          fontWeight="700"
          fontSize="26"
          letterSpacing="1.5"
        >
          SHANE
        </text>

        {/* Divider bar | */}
        <text
          x="110"
          y="26"
          fill="#00A2ED"
          fontFamily="var(--font-open-sans), sans-serif"
          fontWeight="300"
          fontSize="26"
        >
          |
        </text>

        {/* HALL text */}
        <text
          x="128"
          y="26"
          fill="#FFFFFF"
          fontFamily="var(--font-montserrat), sans-serif"
          fontWeight="700"
          fontSize="26"
          letterSpacing="1.5"
        >
          HALL
        </text>

        {/* Cyan accent bar over HALL */}
        <rect x="128" y="2" width="24" height="3" fill="#00A2ED" rx="1.5" />
      </svg>
    </div>
  );
}

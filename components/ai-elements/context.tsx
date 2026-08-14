"use client";

import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import { createContext, useContext, useMemo } from "react";

export type ContextUsageDisplay = {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  totalTokens?: number;
};

const PERCENT_MAX = 100;
const ICON_RADIUS = 10;
const ICON_VIEWBOX = 24;
const ICON_CENTER = 12;
const ICON_STROKE_WIDTH = 2;

type ModelId = string;

interface ContextSchema {
  usedTokens: number;
  maxTokens: number;
  usage?: ContextUsageDisplay;
  modelId?: ModelId;
}

const ContextContext = createContext<ContextSchema | null>(null);

const useContextValue = () => {
  const context = useContext(ContextContext);
  if (!context) {
    throw new Error("Context components must be used within Context");
  }
  return context;
};

export type ContextProps = ComponentProps<typeof HoverCard> & ContextSchema;

export const Context = ({
  usedTokens,
  maxTokens,
  usage,
  modelId,
  ...props
}: ContextProps) => {
  const contextValue = useMemo(
    () => ({ maxTokens, modelId, usage, usedTokens }),
    [maxTokens, modelId, usage, usedTokens],
  );

  return (
    <ContextContext.Provider value={contextValue}>
      <HoverCard closeDelay={100} openDelay={200} {...props} />
    </ContextContext.Provider>
  );
};

const ContextIcon = () => {
  const { usedTokens, maxTokens } = useContextValue();
  const circumference = 2 * Math.PI * ICON_RADIUS;
  const usedPercent = Math.min(1, usedTokens / Math.max(1, maxTokens));
  const dashOffset = circumference * (1 - usedPercent);

  return (
    <svg
      aria-hidden
      height="20"
      viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
      width="20"
      className="text-composer-icon"
    >
      <circle
        cx={ICON_CENTER}
        cy={ICON_CENTER}
        fill="none"
        opacity="0.25"
        r={ICON_RADIUS}
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
      />
      <circle
        cx={ICON_CENTER}
        cy={ICON_CENTER}
        fill="none"
        r={ICON_RADIUS}
        stroke="currentColor"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        strokeWidth={ICON_STROKE_WIDTH}
        style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
      />
    </svg>
  );
};

export type ContextTriggerProps = ComponentProps<typeof Button>;

export const ContextTrigger = ({ children, className, ...props }: ContextTriggerProps) => {
  const { usedTokens, maxTokens } = useContextValue();
  const usedPercent = Math.min(1, usedTokens / Math.max(1, maxTokens));
  const renderedPercent = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    style: "percent",
  }).format(usedPercent);

  return (
    <HoverCardTrigger asChild>
      {children ?? (
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "h-9 gap-1.5 rounded-full px-2.5 text-composer-icon hover:bg-composer-icon-hover-bg hover:text-composer-icon-hover",
            className,
          )}
          {...props}
        >
          <ContextIcon />
          <span className="text-[13px] font-medium tabular-nums text-composer-fg">
            {renderedPercent}
          </span>
        </Button>
      )}
    </HoverCardTrigger>
  );
};

export type ContextContentProps = ComponentProps<typeof HoverCardContent>;

export const ContextContent = ({
  className,
  ...props
}: ContextContentProps) => (
  <HoverCardContent
    align="start"
    side="top"
    sideOffset={8}
    className={cn(
      "z-[200] min-w-[240px] divide-y divide-zinc-800 overflow-hidden border-zinc-800 bg-[#141414] p-0 text-zinc-100 shadow-xl",
      className,
    )}
    {...props}
  />
);

export type ContextContentHeaderProps = ComponentProps<"div"> & {
  title?: string;
  quotaLabel?: string;
};

export const ContextContentHeader = ({
  children,
  className,
  title = "Context used",
  quotaLabel = "of window",
  ...props
}: ContextContentHeaderProps) => {
  const { usedTokens, maxTokens } = useContextValue();
  const usedPercent = Math.min(1, usedTokens / Math.max(1, maxTokens));
  const displayPct = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    style: "percent",
  }).format(usedPercent);
  const used = new Intl.NumberFormat("en-US", { notation: "compact" }).format(
    usedTokens,
  );
  const total = new Intl.NumberFormat("en-US", { notation: "compact" }).format(
    maxTokens,
  );

  return (
    <div className={cn("w-full space-y-2 p-3", className)} {...props}>
      {children ?? (
        <>
          <div className="flex items-center justify-between gap-3 text-xs">
            <p className="font-medium text-zinc-200">{title}</p>
            <p className="font-mono text-zinc-500">
              {used} / {total}
            </p>
          </div>
          <p className="text-[11px] text-zinc-500">
            {displayPct} {quotaLabel}
          </p>
          <Progress value={usedPercent * PERCENT_MAX} />
        </>
      )}
    </div>
  );
};

export type ContextContentBodyProps = ComponentProps<"div">;

export const ContextContentBody = ({
  children,
  className,
  ...props
}: ContextContentBodyProps) => (
  <div className={cn("w-full space-y-2 p-3", className)} {...props}>
    {children}
  </div>
);

export type ContextContentFooterProps = ComponentProps<"div">;

export const ContextContentFooter = ({
  children,
  className,
  ...props
}: ContextContentFooterProps) => (
  <div
    className={cn(
      "flex w-full items-center justify-between gap-3 bg-zinc-900/80 p-3 text-xs",
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

const TokensLine = ({ label, tokens }: { label: string; tokens: number }) => (
  <div className="flex items-center justify-between text-xs">
    <span className="text-zinc-500">{label}</span>
    <span className="font-mono tabular-nums text-zinc-300">
      {new Intl.NumberFormat("en-US", { notation: "compact" }).format(tokens)}
    </span>
  </div>
);

export { TokensLine };

export type ContextInputUsageProps = ComponentProps<"div">;

export const ContextInputUsage = ({
  className,
  children,
  ...props
}: ContextInputUsageProps) => {
  const { usage } = useContextValue();
  const inputTokens = usage?.inputTokens ?? 0;
  if (children) return children;
  return (
    <div className={cn(className)} {...props}>
      <TokensLine label="Input" tokens={inputTokens} />
    </div>
  );
};

export type ContextOutputUsageProps = ComponentProps<"div">;

export const ContextOutputUsage = ({
  className,
  children,
  ...props
}: ContextOutputUsageProps) => {
  const { usage } = useContextValue();
  const outputTokens = usage?.outputTokens ?? 0;
  if (children) return children;
  return (
    <div className={cn(className)} {...props}>
      <TokensLine label="Output" tokens={outputTokens} />
    </div>
  );
};

export type ContextReasoningUsageProps = ComponentProps<"div">;

export const ContextReasoningUsage = ({
  className,
  children,
  ...props
}: ContextReasoningUsageProps) => {
  const { usage } = useContextValue();
  const reasoningTokens = usage?.reasoningTokens ?? 0;
  if (children) return children;
  if (!reasoningTokens) return null;
  return (
    <div className={cn(className)} {...props}>
      <TokensLine label="Reasoning" tokens={reasoningTokens} />
    </div>
  );
};

export type ContextCacheUsageProps = ComponentProps<"div">;

export const ContextCacheUsage = ({
  className,
  children,
  ...props
}: ContextCacheUsageProps) => {
  const { usage } = useContextValue();
  const cacheTokens = usage?.cachedInputTokens ?? 0;
  if (children) return children;
  if (!cacheTokens) return null;
  return (
    <div className={cn(className)} {...props}>
      <TokensLine label="Cache" tokens={cacheTokens} />
    </div>
  );
};

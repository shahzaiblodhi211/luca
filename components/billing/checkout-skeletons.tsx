import { ShimmerBlock } from "@/components/ui/shimmer-block";
import { cn } from "@/lib/utils";

export function CheckoutPaySkeleton({
  tone = "light",
}: {
  tone?: "dark" | "light";
}) {
  const rule = tone === "light" ? "bg-zinc-200" : "bg-zinc-800";
  return (
    <div
      className="flex w-full flex-col"
      aria-busy
      aria-label="Preparing checkout"
    >
      <ShimmerBlock tone={tone} className="h-12 w-full rounded-lg" />
      <div className="my-6 flex items-center gap-3">
        <span className={cn("h-px flex-1", rule)} />
        <ShimmerBlock tone={tone} className="h-2 w-8 rounded-full" />
        <span className={cn("h-px flex-1", rule)} />
      </div>

      <ShimmerBlock tone={tone} className="h-4 w-40 rounded-full" />
      <ShimmerBlock tone={tone} className="mt-3 h-3 w-12 rounded-full" />
      <ShimmerBlock tone={tone} className="mt-1.5 h-11 w-full rounded-lg" />

      <ShimmerBlock tone={tone} className="mt-8 h-4 w-36 rounded-full" />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <ShimmerBlock tone={tone} className="h-16 rounded-lg" />
        <ShimmerBlock tone={tone} className="h-16 rounded-lg" />
      </div>
      <ShimmerBlock tone={tone} className="mt-3 h-11 w-full rounded-lg" />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <ShimmerBlock tone={tone} className="h-11 rounded-lg" />
        <ShimmerBlock tone={tone} className="h-11 rounded-lg" />
      </div>
      <ShimmerBlock tone={tone} className="mt-4 h-3 w-28 rounded-full" />
      <ShimmerBlock tone={tone} className="mt-1.5 h-11 w-full rounded-lg" />
      <ShimmerBlock tone={tone} className="mt-6 h-12 w-full rounded-lg" />
      <ShimmerBlock tone={tone} className="mx-auto mt-5 h-2.5 w-4/5 rounded-full" />
      <ShimmerBlock tone={tone} className="mx-auto mt-2 h-2.5 w-2/5 rounded-full" />
    </div>
  );
}

export function CheckoutSummarySkeleton() {
  return (
    <div
      className="flex h-full w-full max-w-[460px] flex-col"
      aria-busy
      aria-label="Loading plan"
    >
      <div className="mb-12 flex items-center gap-3">
        <ShimmerBlock className="h-8 w-8 rounded-full" />
        <ShimmerBlock className="h-8 w-8 rounded-md" />
      </div>
      <ShimmerBlock className="h-4 w-48 rounded-full" />
      <ShimmerBlock className="mt-3 h-11 w-56 rounded-lg" />
      <div className="mt-10 grid grid-cols-2 gap-3">
        <ShimmerBlock className="h-12 rounded-xl" />
        <ShimmerBlock className="h-12 rounded-xl" />
      </div>
      <ShimmerBlock className="mt-3 h-3 w-3/4 rounded-full" />
      <ShimmerBlock className="mt-12 h-24 w-full rounded-xl" />
      <div className="mt-12 space-y-3.5">
        <div className="flex justify-between">
          <ShimmerBlock className="h-3.5 w-20 rounded-full" />
          <ShimmerBlock className="h-3.5 w-16 rounded-full" />
        </div>
        <div className="flex justify-between">
          <ShimmerBlock className="h-3.5 w-12 rounded-full" />
          <ShimmerBlock className="h-3.5 w-28 rounded-full" />
        </div>
        <div className="flex justify-between pt-1">
          <ShimmerBlock className="h-4 w-28 rounded-full" />
          <ShimmerBlock className="h-4 w-20 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function CheckoutPageSkeleton() {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-2">
      <div className="bg-black px-5 pb-7 pt-12 sm:px-8 sm:pt-14 lg:flex lg:min-h-dvh lg:justify-end lg:px-10 lg:pb-10 lg:pr-[60px] lg:pt-16 xl:px-12 xl:pr-[68px]">
        <CheckoutSummarySkeleton />
      </div>
      <section className="bg-white px-5 pb-7 pt-12 sm:px-8 sm:pt-14 lg:min-h-dvh lg:px-10 lg:pb-10 lg:pl-[60px] lg:pt-16 xl:px-12 xl:pl-[68px]">
        <CheckoutPaySkeleton />
      </section>
    </div>
  );
}

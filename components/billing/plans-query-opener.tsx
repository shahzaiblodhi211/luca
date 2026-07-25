"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePlansModal } from "./plans-modal";

/** Opens the plans modal when `?upgrade=1` is present, then cleans the URL. */
export function PlansQueryOpener() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { openPlans } = usePlansModal();

  useEffect(() => {
    if (params.get("upgrade") !== "1") return;
    openPlans();
    router.replace(pathname || "/", { scroll: false });
  }, [params, openPlans, router, pathname]);

  return null;
}

import { redirect } from "next/navigation";
import { LucaCheckoutPage } from "@/components/billing/luca-checkout-page";
import { getSessionUser } from "@/lib/auth";
import { normalizeCheckoutPlan } from "@/lib/polar/create-checkout-session";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ plan?: string }>;
};

export default async function CheckoutPage({ searchParams }: PageProps) {
  const user = await getSessionUser();
  const { plan: rawPlan } = await searchParams;
  const planId = normalizeCheckoutPlan(rawPlan);

  if (!planId) {
    redirect("/billing?error=invalid_plan");
  }

  if (!user) {
    redirect(`/?auth=login&return=${encodeURIComponent(`/checkout?plan=${planId}`)}`);
  }

  return <LucaCheckoutPage user={user} />;
}

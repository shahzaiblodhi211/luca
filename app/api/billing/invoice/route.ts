import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { findUserById } from "@/lib/auth/users";
import { getPolarClient } from "@/lib/polar/config";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const orderId = new URL(req.url).searchParams.get("id")?.trim();
  if (!orderId) {
    return NextResponse.json({ error: "Missing invoice." }, { status: 400 });
  }

  const polar = getPolarClient();
  if (!polar) {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  }

  const doc = await findUserById(user.id);
  try {
    const order = await polar.orders.get({ id: orderId });
    const owner =
      order.customer?.externalId ||
      (order.metadata?.userId as string | undefined);
    if (
      owner &&
      owner !== user.id &&
      order.customerId !== doc?.polarCustomerId
    ) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }

    try {
      const invoice = await polar.orders.invoice({ id: orderId });
      return NextResponse.redirect(invoice.url);
    } catch {
      await polar.orders.generateInvoice({ id: orderId });
      const invoice = await polar.orders.invoice({ id: orderId });
      return NextResponse.redirect(invoice.url);
    }
  } catch (err) {
    console.error("[billing/invoice]", err);
    return NextResponse.json(
      { error: "Could not open that invoice." },
      { status: 400 },
    );
  }
}

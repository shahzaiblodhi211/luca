import { NextResponse } from "next/server";
import {
  createUser,
  createSessionToken,
  isValidEmail,
  normalizeEmail,
  setSessionCookie,
  toPublicUser,
  validatePassword,
  findUserByEmail,
  sendWelcomeEmail,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      email?: string;
      password?: string;
      name?: string;
    };
    const email = normalizeEmail(body.email || "");
    const password = String(body.password || "");
    const name = String(body.name || "").trim();

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
    }
    if (name.length < 2) {
      return NextResponse.json(
        { error: "Add your name (at least 2 characters)." },
        { status: 400 },
      );
    }
    const pwErr = validatePassword(password);
    if (pwErr) {
      return NextResponse.json({ error: pwErr }, { status: 400 });
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }

    const user = await createUser({ email, name, password });
    const publicUser = toPublicUser(user);
    const token = await createSessionToken(publicUser);
    await setSessionCookie(token);

    sendWelcomeEmail({ email: user.email, name: user.name });

    return NextResponse.json({ user: publicUser });
  } catch (err) {
    console.error("[auth/signup]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Signup failed" },
      { status: 500 },
    );
  }
}

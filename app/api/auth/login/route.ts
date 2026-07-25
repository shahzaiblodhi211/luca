import { NextResponse } from "next/server";
import {
  createSessionToken,
  findUserByEmail,
  isValidEmail,
  normalizeEmail,
  setSessionCookie,
  toPublicUser,
  verifyPassword,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      email?: string;
      password?: string;
    };
    const email = normalizeEmail(body.email || "");
    const password = String(body.password || "");

    if (!isValidEmail(email) || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 },
      );
    }

    const user = await findUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json(
        { error: "Incorrect email or password." },
        { status: 401 },
      );
    }

    const publicUser = toPublicUser(user);
    const token = await createSessionToken(publicUser);
    await setSessionCookie(token);

    return NextResponse.json({ user: publicUser });
  } catch (err) {
    console.error("[auth/login]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Login failed" },
      { status: 500 },
    );
  }
}

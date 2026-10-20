import { NextResponse, type NextRequest } from "next/server";
import { WORLD_COOKIE, RESTART_HREF, worlds, type WorldId } from "@/content/quiz";

// Worlds are served at "/" by cookie, so the address bar never shows which version is open.
// "/" + world cookie -> rewrite to that world · RESTART_HREF -> clear cookie, back to the questionnaire ·
// a typed world path -> "/" (allowed in development so probes can open a world directly).
const ROUTES = new Set(Object.values(worlds).map((w) => w.href));

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === RESTART_HREF) {
    const res = NextResponse.redirect(new URL("/", req.url));
    res.cookies.delete(WORLD_COOKIE);
    return res;
  }
  if (pathname === "/") {
    const id = req.cookies.get(WORLD_COOKIE)?.value as WorldId | undefined;
    const w = id ? worlds[id] : undefined;
    return w ? NextResponse.rewrite(new URL(w.href, req.url)) : NextResponse.next();
  }
  if (ROUTES.has(pathname) && process.env.NODE_ENV === "production") return NextResponse.redirect(new URL("/", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/", "/restart", "/v5", "/v6", "/v7"] };

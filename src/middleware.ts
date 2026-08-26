import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Supabase session refresh + protected-route logic.
 * - Refreshes expired JWTs via Supabase.
 * - Redirects unauthenticated users to /auth/login.
 *
 * Important: do not expose service_role here; uses anon/publishable key via cookies.
 */

// Routes that require authentication
const PROTECTED_PREFIXES = [
  "/author",
  "/reviewer",
  "/editor",
  "/production",
  "/finance",
  "/admin",
  "/account",
  "/onboarding",
];

// Routes that are public (never redirect)
const PUBLIC_PREFIXES = ["/auth", "/_next", "/favicon", "/api/public", "/api/auth"];

// If unauthenticated, send to /auth/login?next=<original_path>
function redirectToLogin(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/auth/login";
  url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If env is missing, fail open but log — don't break the app in dev without config.
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("[middleware] Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // Refresh session — `getUser()` validates JWT against Supabase Auth.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  const isPublic = PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));

  // Unauthenticated → redirect to login for protected routes.
  if (!user && isProtected && !isPublic) {
    return redirectToLogin(request);
  }

  // Authenticated user hitting /auth/login or /auth/register → redirect to role dashboard.
  if (user && (pathname === "/auth/login" || pathname === "/auth/register")) {
    const url = request.nextUrl.clone();
    url.pathname = "/author/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/author/:path*",
    "/reviewer/:path*",
    "/editor/:path*",
    "/production/:path*",
    "/finance/:path*",
    "/admin/:path*",
    "/account/:path*",
    "/onboarding",
    "/auth/:path*",
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

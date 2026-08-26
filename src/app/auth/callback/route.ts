import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.clone();
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/author/dashboard";
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (error) {
    url.pathname = "/auth/login";
    url.searchParams.set("error", errorDescription || error);
    return NextResponse.redirect(url);
  }

  if (code) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const response = NextResponse.redirect(new URL(next, request.url));

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      const errUrl = new URL("/auth/login", request.url);
      errUrl.searchParams.set("error", exchangeError.message);
      return NextResponse.redirect(errUrl);
    }

    return response;
  }

  // No code — maybe hash fragment flow (handled client-side) — redirect to login
  url.pathname = "/auth/login";
  return NextResponse.redirect(url);
}

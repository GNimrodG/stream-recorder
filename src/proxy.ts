import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isAuthDisabled } from "@/auth";

// Define public routes that don't require authentication
const publicRoutes = ["/login", "/api/auth", "/auth-debug"];

export async function proxy(request: NextRequest) {
  const next = () => {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-pathname", request.nextUrl.pathname);

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  };

  // If auth is disabled, allow all requests
  if (isAuthDisabled) {
    return next();
  }

  const { pathname } = request.nextUrl;

  const isPublicRoute = publicRoutes.some((route) => pathname === route || pathname.startsWith(route + "/"));

  // Allow public routes
  if (isPublicRoute) {
    return next();
  }

  // Check for session token
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  });

  // Redirect unauthenticated users to login
  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (svg, png, jpg, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

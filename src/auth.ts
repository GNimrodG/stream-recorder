import type { NextAuthOptions } from "next-auth";

// Check if auth is disabled via environment variable
export const isAuthDisabled =
  process.env.AUTH_DISABLED === "true" ||
  !process.env.AUTH_AUTHENTIK_ISSUER ||
  !process.env.AUTH_AUTHENTIK_CLIENT_ID ||
  !process.env.AUTH_AUTHENTIK_CLIENT_SECRET;

if (isAuthDisabled) {
  console.log(
    "Authentication is disabled. All routes are accessible without login.",
  );

  if (process.env.AUTH_DISABLED !== "true") {
    console.warn(
      "AUTH_DISABLED is not set to 'true', but required Authentik environment variables are missing. Please set AUTH_DISABLED=true to disable authentication.",
    );
  }
}

// Custom Authentik provider configuration for OAuth2/OpenID Connect
export const authOptions: NextAuthOptions = {
  providers: isAuthDisabled
    ? []
    : [
        {
          id: "authentik",
          name: "Authentik",
          type: "oauth",
          wellKnown: `${process.env.AUTH_AUTHENTIK_ISSUER}/.well-known/openid-configuration`,
          clientId: process.env.AUTH_AUTHENTIK_CLIENT_ID,
          clientSecret: process.env.AUTH_AUTHENTIK_CLIENT_SECRET,
          authorization: { params: { scope: "openid profile email" } },
          client: {
            token_endpoint_auth_method: "client_secret_post",
            id_token_signed_response_alg: "HS256",
          },
          idToken: true,
          checks: ["state"],
          profile(profile) {
            return {
              id: profile.sub,
              name: profile.name ?? profile.preferred_username,
              email: profile.email,
              image: profile.picture,
            };
          },
        },
      ],
  callbacks: {
    async jwt({ token, profile, account }) {
      if (profile) {
        token.groups = profile.groups;
      }
      if (account) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.groups) {
        session.user.groups = token.groups as string[];
      }
      // Add user ID to session
      if (token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  // Trust host is required when behind a reverse proxy
  useSecureCookies: process.env.NODE_ENV === "production",
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-next-auth.session-token"
          : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  debug: process.env.NODE_ENV === "development",
};

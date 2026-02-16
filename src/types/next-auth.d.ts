import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      groups?: string[];
    };
  }

  interface Profile {
    sub?: string;
    name?: string;
    preferred_username?: string;
    email?: string;
    picture?: string;
    groups?: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    groups?: string[];
  }
}

import { headers } from "next/headers";
import { auth } from "@/auth";
import SidebarClient from "./SidebarClient";

export { drawerWidth } from "./SidebarClient";

export default async function Sidebar() {
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || "/";
  const session = await auth();

  return <SidebarClient currentPath={pathname} session={session} />;
}

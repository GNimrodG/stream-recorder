import os from "node:os";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { getInstanceIdentity } from "@/lib/instanceIdentity";
import SidebarClient from "./SidebarClient";

export { drawerWidth } from "./SidebarClient";

export default async function Sidebar() {
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || "/";
  const session = await auth();
  const instanceName = getInstanceIdentity().name;
  const hostname = os.hostname();

  return (
    <SidebarClient currentPath={pathname} session={session} instanceName={instanceName} hostname={hostname} />
  );
}

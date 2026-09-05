import { NextRequest, NextResponse } from "next/server";
import { InstanceIdentity } from "@/types/sync";
import { getInstanceIdentity, updateInstanceIdentity } from "@/lib/instanceIdentity";

function withEnvVars(identity: InstanceIdentity) {
  return { ...identity, envVars: { INSTANCE_NAME: process.env.INSTANCE_NAME || null } };
}

export async function GET() {
  return NextResponse.json(withEnvVars(getInstanceIdentity()));
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const identity = updateInstanceIdentity({
      name: typeof body.name === "string" ? body.name : undefined,
      publicUrl: typeof body.publicUrl === "string" ? body.publicUrl : undefined,
    });
    return NextResponse.json(withEnvVars(identity));
  } catch (error) {
    console.error("Error updating instance identity:", error);
    return NextResponse.json({ error: "Failed to update instance identity" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createPeer, getAllPeers, toPublicPeer } from "@/lib/syncPeers";

export async function GET() {
  return NextResponse.json(getAllPeers().map(toPublicPeer));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.name || !body.baseUrl || !body.remoteApiKey || !body.instanceId) {
      return NextResponse.json(
        { error: "name, baseUrl, remoteApiKey and instanceId are required" },
        { status: 400 },
      );
    }

    const peer = createPeer({
      name: body.name,
      baseUrl: body.baseUrl,
      remoteApiKey: body.remoteApiKey,
      instanceId: body.instanceId,
    });

    return NextResponse.json(toPublicPeer(peer), { status: 201 });
  } catch (error) {
    console.error("Error creating sync peer:", error);
    return NextResponse.json({ error: "Failed to create sync peer" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { pushToPeer } from "@/lib/sync/client";
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

    // Don't make the user wait for the next scheduled tick to see their first sync — kick one
    // off now, in the background, so it doesn't hold up the response.
    pushToPeer(peer).catch((error) => console.error(`Initial sync with newly added peer ${peer.name} failed:`, error));

    return NextResponse.json(toPublicPeer(peer), { status: 201 });
  } catch (error) {
    console.error("Error creating sync peer:", error);
    return NextResponse.json({ error: "Failed to create sync peer" }, { status: 500 });
  }
}

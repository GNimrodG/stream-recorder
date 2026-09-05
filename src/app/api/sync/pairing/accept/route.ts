import { NextRequest, NextResponse } from "next/server";
import { getInstanceIdentity } from "@/lib/instanceIdentity";
import { decodePairingCode } from "@/lib/sync/pairing";
import { toPublicPeer, upsertPeerByInstanceId } from "@/lib/syncPeers";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.code) {
      return NextResponse.json({ error: "Pairing code is required" }, { status: 400 });
    }

    const identity = getInstanceIdentity();
    if (!identity.publicUrl) {
      return NextResponse.json(
        { error: "Set this instance's public URL first so the other instance can reach it back." },
        { status: 400 },
      );
    }

    const { baseUrl, token } = decodePairingCode(body.code);

    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/sync/pairing/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        instanceId: identity.instanceId,
        baseUrl: identity.publicUrl,
        apiKey: identity.syncApiKey,
        name: identity.name,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Failed to reach the other instance" }));
      return NextResponse.json({ error: error.error || "Pairing failed" }, { status: 400 });
    }

    const remote = await response.json();
    if (!remote.instanceId || !remote.baseUrl || !remote.apiKey) {
      return NextResponse.json({ error: "The other instance returned an incomplete pairing response" }, { status: 502 });
    }

    const peer = upsertPeerByInstanceId({
      instanceId: remote.instanceId,
      name: remote.name || "Linked instance",
      baseUrl: remote.baseUrl,
      remoteApiKey: remote.apiKey,
    });

    return NextResponse.json(toPublicPeer(peer), { status: 201 });
  } catch (error) {
    console.error("Error accepting pairing code:", error);
    return NextResponse.json({ error: "Invalid or unreadable pairing code" }, { status: 400 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getInstanceIdentity } from "@/lib/instanceIdentity";
import { consumePairingToken } from "@/lib/sync/pairing";
import { upsertPeerByInstanceId } from "@/lib/syncPeers";

/**
 * Called by the OTHER instance's server during pairing, authenticated only by the single-use
 * pairing token (not a session) — this is the one sync endpoint reachable without a prior
 * credential, mitigated by the token's short TTL and single-use consumption.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.token || !body.instanceId || !body.baseUrl || !body.apiKey || !body.name) {
      return NextResponse.json({ error: "Invalid pairing request" }, { status: 400 });
    }

    if (!consumePairingToken(body.token)) {
      return NextResponse.json({ error: "Pairing code is invalid or has expired" }, { status: 401 });
    }

    upsertPeerByInstanceId({
      instanceId: body.instanceId,
      name: body.name,
      baseUrl: body.baseUrl,
      remoteApiKey: body.apiKey,
    });

    const identity = getInstanceIdentity();
    return NextResponse.json({
      instanceId: identity.instanceId,
      baseUrl: identity.publicUrl,
      apiKey: identity.syncApiKey,
      name: identity.name,
    });
  } catch (error) {
    console.error("Error completing pairing:", error);
    return NextResponse.json({ error: "Failed to complete pairing" }, { status: 500 });
  }
}

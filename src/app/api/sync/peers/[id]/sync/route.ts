import { NextRequest, NextResponse } from "next/server";
import { getPeerById, toPublicPeer } from "@/lib/syncPeers";
import { pushToPeer } from "@/lib/sync/client";

/** Triggers an on-demand sync with one linked peer, instead of waiting for the next scheduled tick. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const peer = getPeerById(id);

  if (!peer) {
    return NextResponse.json({ error: "Peer not found" }, { status: 404 });
  }

  try {
    await pushToPeer(peer);
  } catch (error) {
    // pushToPeer already persisted the failure onto the peer record — surface it to the caller too.
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed", peer: toPublicPeer(getPeerById(id) ?? peer) },
      { status: 502 },
    );
  }

  return NextResponse.json({ peer: toPublicPeer(getPeerById(id) ?? peer) });
}

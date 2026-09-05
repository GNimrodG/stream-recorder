import { NextRequest, NextResponse } from "next/server";
import { deletePeer, toPublicPeer, updatePeer } from "@/lib/syncPeers";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const body = await request.json();
    const peer = updatePeer(id, body);

    if (!peer) {
      return NextResponse.json({ error: "Peer not found" }, { status: 404 });
    }

    return NextResponse.json(toPublicPeer(peer));
  } catch (error) {
    console.error("Error updating sync peer:", error);
    return NextResponse.json({ error: "Failed to update sync peer" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deleted = deletePeer(id);

  if (!deleted) {
    return NextResponse.json({ error: "Peer not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

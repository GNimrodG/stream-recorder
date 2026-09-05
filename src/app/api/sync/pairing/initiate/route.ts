import { NextResponse } from "next/server";
import { getInstanceIdentity } from "@/lib/instanceIdentity";
import { createPairingToken, encodePairingCode } from "@/lib/sync/pairing";

export async function POST() {
  const identity = getInstanceIdentity();

  if (!identity.publicUrl) {
    return NextResponse.json(
      { error: "Set this instance's public URL first so the other instance can reach it back." },
      { status: 400 },
    );
  }

  const { token, expiresAt } = createPairingToken();
  const code = encodePairingCode({ baseUrl: identity.publicUrl, token });

  return NextResponse.json({ code, expiresAt });
}

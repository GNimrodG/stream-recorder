import { NextRequest, NextResponse } from "next/server";
import { deleteStream, getStreamById, updateStream } from "@/lib/streams";
import { isSupportedStreamUrl, normalizeStreamUrl, supportedStreamUrlError } from "@/lib/streamUrl";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const stream = getStreamById(id);

  if (!stream) {
    return NextResponse.json({ error: "Stream not found" }, { status: 404 });
  }

  return NextResponse.json(stream);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const body = await request.json();
    if (body.rtspUrl !== undefined) {
      body.rtspUrl = normalizeStreamUrl(body.rtspUrl);
      if (!isSupportedStreamUrl(body.rtspUrl)) {
        return NextResponse.json({ error: supportedStreamUrlError() }, { status: 400 });
      }
    }
    const stream = updateStream(id, body);

    if (!stream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    }

    return NextResponse.json(stream);
  } catch (error) {
    console.error("Error updating stream:", error);
    return NextResponse.json({ error: "Failed to update stream" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deleted = deleteStream(id);

  if (!deleted) {
    return NextResponse.json({ error: "Stream not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

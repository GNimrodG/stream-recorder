import { NextRequest, NextResponse } from "next/server";
import { createStream, getAllStreams } from "@/lib/streams";
import { isSupportedStreamUrl, normalizeStreamUrl, supportedStreamUrlError } from "@/lib/streamUrl";

export async function GET() {
  const streams = getAllStreams();
  return NextResponse.json(streams);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.name || !body.rtspUrl) {
      return NextResponse.json({ error: "Name and stream URL are required" }, { status: 400 });
    }

    const streamUrl = normalizeStreamUrl(body.rtspUrl);
    if (!isSupportedStreamUrl(streamUrl)) {
      return NextResponse.json({ error: supportedStreamUrlError() }, { status: 400 });
    }

    const stream = createStream({
      name: body.name,
      rtspUrl: streamUrl,
      description: body.description,
      favorite: body.favorite,
      autoRecordWhenLive: body.autoRecordWhenLive,
    });

    return NextResponse.json(stream, { status: 201 });
  } catch (error) {
    console.error("Error creating stream:", error);
    return NextResponse.json({ error: "Failed to create stream" }, { status: 500 });
  }
}

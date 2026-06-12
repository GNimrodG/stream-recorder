import { NextRequest, NextResponse } from "next/server";
import { getCutJob } from "@/lib/videoCutter";
import { ensureInitialized } from "@/app/api/recordings/route";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; jobId: string }> }) {
  ensureInitialized();

  try {
    const { jobId } = await params;
    const job = getCutJob(jobId);

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json(job);
  } catch (error) {
    console.error("Error fetching job status:", error);
    return NextResponse.json({ error: "Failed to fetch job status" }, { status: 500 });
  }
}

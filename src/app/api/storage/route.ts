import { NextResponse } from "next/server";
import { getStorageStats, runStorageCleanup } from "@/lib/storage";

export async function GET() {
  try {
    return NextResponse.json(await getStorageStats());
  } catch (error) {
    console.error("Error getting storage stats:", error);
    return NextResponse.json({ error: "Failed to get storage stats" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const result = await runStorageCleanup();
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Error running storage cleanup:", error);
    return NextResponse.json({ error: "Failed to run storage cleanup" }, { status: 500 });
  }
}

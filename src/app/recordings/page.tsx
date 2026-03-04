import RecordingsPageClient from "@/app/recordings/RecordingsPageClient";
import { ensureRecordingsInitialized, getPaginatedRecordingsWithStats } from "@/lib/recordings";
import { RecordingFilterStatus } from "@/types/recording";

type PageSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function parsePositiveInt(value: string | undefined, defaultValue: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function parseStatus(value: string | undefined): RecordingFilterStatus {
  const validStatuses: RecordingFilterStatus[] = [
    "all",
    "scheduled",
    "starting",
    "recording",
    "completed",
    "failed",
    "cancelled",
    "retrying",
  ];

  if (value && validStatuses.includes(value as RecordingFilterStatus)) {
    return value as RecordingFilterStatus;
  }

  return "all";
}

export default async function RecordingsPage({ searchParams }: { searchParams?: Promise<PageSearchParams> }) {
  ensureRecordingsInitialized();

  const resolvedSearchParams = (await searchParams) ?? {};
  const page = parsePositiveInt(firstValue(resolvedSearchParams.page), 1);
  const pageSize = parsePositiveInt(firstValue(resolvedSearchParams.pageSize), 10);
  const status = parseStatus(firstValue(resolvedSearchParams.status));
  const initialName = firstValue(resolvedSearchParams.name);
  const initialRtspUrl = firstValue(resolvedSearchParams.rtspUrl);

  const { data, pagination } = getPaginatedRecordingsWithStats({ page, pageSize, status });

  return (
    <RecordingsPageClient
      initialRecordings={data}
      initialPagination={pagination}
      initialStatus={status}
      initialName={initialName}
      initialRtspUrl={initialRtspUrl}
    />
  );
}

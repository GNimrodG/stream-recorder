import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import { RecordingWithStatus } from "@/types/recording";
import { formatDate, formatDuration } from "@/utils";
import { getStatusColor } from "@/theme";

const TIMELINE_MINUTE_WIDTH_REM = 0.15;
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const NOT_FINISHED_STATES = new Set(["scheduled", "starting", "recording", "retrying"]);
// Active states that should show the pulsing animation
const ACTIVE_STATES = new Set(["starting", "recording", "retrying"]);

type TimelinePoint = {
  recording: RecordingWithStatus;
  startMin: number;
  endMin: number;
};

type TimelineLaneBar = {
  recording: RecordingWithStatus;
  actualDuration: number;
  endTime: string;
  startIndex: number;
  endIndex: number;
  startDiff: number;
  endDiff: number;
};

const getTimelineEndMs = (recording: RecordingWithStatus): number => {
  const startMs = new Date(recording.startTime).getTime();
  const plannedEndMs = startMs + Math.max(0, recording.duration) * 1000;

  if (NOT_FINISHED_STATES.has(recording.status)) {
    return plannedEndMs;
  }

  const finalEndMs = new Date(recording.endedAt ?? recording.completedAt ?? "").getTime();

  if (Number.isFinite(finalEndMs)) {
    return Math.max(finalEndMs, startMs);
  }

  return Math.max(plannedEndMs, startMs);
};

// Cached formatters to avoid recreating Date objects
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

const formatDayLabel = (timestampMs: number): string => dateFormatter.format(new Date(timestampMs));
const formatTickLabel = (timestampMs: number): string => timeFormatter.format(new Date(timestampMs));

const createTimelineModel = (recordings: RecordingWithStatus[]) => {
  if (!recordings.length) return null;

  const points: TimelinePoint[] = [];

  // Single pass to create points
  for (const recording of recordings) {
    const startMs = new Date(recording.startTime).getTime();
    if (Number.isFinite(startMs)) {
      points.push({
        recording,
        startMin: Math.floor(startMs / MS_PER_MINUTE) * MS_PER_MINUTE,
        endMin: Math.ceil(getTimelineEndMs(recording) / MS_PER_MINUTE) * MS_PER_MINUTE,
      });
    }
  }

  if (!points.length) return null;

  // Calculate timeline bounds
  let minStartMin = Infinity;
  let maxEndMin = Math.ceil(Date.now() / MS_PER_DAY) * MS_PER_DAY;
  for (const point of points) {
    minStartMin = Math.min(minStartMin, point.startMin);
    maxEndMin = Math.max(maxEndMin, point.endMin);
  }

  minStartMin = Math.floor(minStartMin / MS_PER_HOUR) * MS_PER_HOUR;
  maxEndMin = Math.ceil(maxEndMin / MS_PER_HOUR) * MS_PER_HOUR;

  if (!Number.isFinite(minStartMin) || !Number.isFinite(maxEndMin)) return null;

  const totalMinutes = Math.ceil((maxEndMin - minStartMin) / MS_PER_MINUTE);
  // Add an extra column at the end to ensure there's space for recordings that end exactly at the max end time
  const totalColumns = Math.ceil(totalMinutes / 60) + 2;

  // Build day marks
  const dayMarks: { fromIndex: number; toIndex: number; label: string }[] = [];
  let currentDayStartMin = Math.floor(minStartMin / MS_PER_DAY) * MS_PER_DAY;
  while (currentDayStartMin < maxEndMin) {
    const index = Math.floor((currentDayStartMin - minStartMin) / MS_PER_HOUR) - 1;
    dayMarks.push({
      fromIndex: Math.max(0, index),
      toIndex: index + 24,
      label: formatDayLabel(currentDayStartMin),
    });
    currentDayStartMin += MS_PER_DAY;
  }

  // Build hour marks
  const hourMarks: { index: number; label: string; from: number; to: number }[] = [];
  let currentHourMin = Math.ceil(minStartMin / MS_PER_HOUR) * MS_PER_HOUR;
  // Include the final hour boundary so the label for the max end hour is rendered
  while (currentHourMin <= maxEndMin) {
    const index = Math.floor((currentHourMin - minStartMin) / MS_PER_HOUR);
    hourMarks.push({
      index,
      label: formatTickLabel(currentHourMin),
      from: currentHourMin,
      to: currentHourMin + MS_PER_HOUR,
    });
    currentHourMin += MS_PER_HOUR;
  }

  // Layout recording bars into lanes
  points.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const laneEndIndexes: number[] = [];
  const lanes: TimelineLaneBar[][] = [];

  for (const point of points) {
    const startIndex = Math.floor((point.startMin - minStartMin) / MS_PER_HOUR);
    const endIndex = Math.ceil((point.endMin - minStartMin) / MS_PER_HOUR);
    const startDiff = (point.startMin - minStartMin) % MS_PER_HOUR;
    const endDiff = MS_PER_HOUR - Math.ceil((point.endMin - minStartMin) % MS_PER_HOUR);

    // Find first available lane
    let laneIndex = laneEndIndexes.findIndex((laneEndIndex) => laneEndIndex <= startIndex);
    if (laneIndex < 0) {
      laneIndex = laneEndIndexes.length;
      laneEndIndexes.push(endIndex);
      lanes.push([]);
    } else {
      laneEndIndexes[laneIndex] = endIndex;
    }

    lanes[laneIndex].push({
      recording: point.recording,
      endTime: new Date(point.endMin).toISOString(),
      actualDuration: (point.endMin - point.startMin) / 1000,
      startIndex,
      endIndex,
      startDiff,
      endDiff,
    });
  }

  return { minStartMin, maxEndMin, totalColumns, dayMarks, hourMarks, lanes };
};

type RecordingTimelineProps = {
  recordings: RecordingWithStatus[];
};

export type RecordingTimelineHandle = {
  scrollToCurrentTime: () => void;
  scrollToNextRecording: () => void;
};

const RecordingTimeline = forwardRef<RecordingTimelineHandle, RecordingTimelineProps>(({ recordings }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const hourRefsMap = useRef<Map<number, HTMLDivElement>>(new Map());
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const timelineModel = useMemo(() => createTimelineModel(recordings), [recordings]);

  // Prevent hydration mismatch by only rendering time-dependent UI after mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true);
    setCurrentTime(() => Date.now());
  }, []);

  const currentMark = useMemo(() => {
    if (!timelineModel || currentTime === null) return null;
    return timelineModel.hourMarks.findIndex((mark) => currentTime >= mark.from && currentTime < mark.to) ?? null;
  }, [timelineModel, currentTime]);

  const currentTimePosition = useMemo(() => {
    if (!timelineModel || currentTime === null) return null;
    const offsetMs = currentTime - timelineModel.minStartMin;
    const offsetMinutes = offsetMs / MS_PER_MINUTE;
    return {
      hourIndex: Math.floor(offsetMinutes / 60),
      minutesInHour: offsetMinutes % 60,
    };
  }, [timelineModel, currentTime]);

  // Register hour ref callbacks
  const registerHourRef = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el) {
      hourRefsMap.current.set(index, el);
    } else {
      hourRefsMap.current.delete(index);
    }
  }, []);

  // Auto-scroll to current hour when it changes
  useEffect(() => {
    if (currentMark !== null && currentMark !== -1) {
      const hourElement = hourRefsMap.current.get(currentMark);
      hourElement?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }
  }, [currentMark]);

  // Expose imperative methods
  useImperativeHandle(ref, () => ({
    scrollToCurrentTime: () => {
      if (currentMark !== null && currentMark !== -1) {
        const hourElement = hourRefsMap.current.get(currentMark);
        hourElement?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      }
    },
    scrollToNextRecording: () => {
      if (!timelineModel || !containerRef.current) return;
      const now = Date.now();

      // Find next recording
      let nextStartMs = Infinity;
      for (const lane of timelineModel.lanes) {
        for (const bar of lane) {
          const startMs = new Date(bar.recording.startTime).getTime();
          if (startMs > now && startMs < nextStartMs) {
            nextStartMs = startMs;
          }
        }
      }

      if (nextStartMs !== Infinity) {
        const offsetMs = nextStartMs - timelineModel.minStartMin;
        const hourIndex = Math.floor(offsetMs / MS_PER_MINUTE / 60);
        const hourElement = hourRefsMap.current.get(hourIndex);
        hourElement?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      }
    },
  }));

  // Update current time every minute
  useEffect(() => {
    if (!isMounted) return;
    const interval = setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, [isMounted]);

  if (!timelineModel) {
    return <Typography color="text.secondary">No recordings available to render timeline.</Typography>;
  }

  return (
    <Box
      ref={containerRef}
      sx={{
        "--one-minute-width": `${TIMELINE_MINUTE_WIDTH_REM}rem`,
        "--gap-width": "3px",
        overflow: "auto",
        maxWidth: "100%",
        borderRadius: 1,
        // Define pulse keyframes once so children can reference the animation
        "@keyframes recordingPulse": {
          "0%": { opacity: 1 },
          "50%": { opacity: 0.6 },
          "100%": { opacity: 1 },
        },
      }}>
      <Box
        sx={{
          display: "grid",
          minHeight: "100%",
          width: "max-content",
          minWidth: "100%",
          gridAutoRows: "max-content",
          gap: "0px var(--gap-width)",
          gridTemplateRows: "auto auto 1fr",
          gridAutoColumns: "calc(var(--one-minute-width) * 60)",
          position: "relative",
        }}>
        {/* Current time indicator line */}
        {isMounted && currentTimePosition && (
          <Box
            sx={{
              gridColumn: currentTimePosition.hourIndex + 1,
              gridRow: `1 / ${timelineModel.lanes.length + 3}`,
              marginLeft: `calc(var(--one-minute-width) * ${currentTimePosition.minutesInHour})`,
              width: "2px",
              backgroundColor: "#d32f2f",
              zIndex: 10,
              pointerEvents: "none",
            }}
          />
        )}

        {/* Day marks */}
        <Box
          sx={{
            position: "sticky",
            top: 0,
            display: "grid",
            gridAutoFlow: "column",
            gridArea: `1 / 1 / 2 / ${timelineModel.totalColumns}`,
            gridTemplateColumns: "subgrid",
          }}>
          {timelineModel.dayMarks.map((mark) => (
            <Box
              key={`day-${mark.fromIndex}`}
              sx={{
                gridArea: `1 / ${mark.fromIndex + 1} / 2 / ${mark.toIndex + 1}`,
                borderBottom: "1px solid",
                borderColor: "divider",
                bgcolor: "background.paper",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                px: 0.5,
              }}>
              <Typography
                variant="button"
                sx={{
                  position: "sticky",
                  left: 0,
                  right: 0,
                  paddingX: 1,
                }}>
                {mark.label}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* Hour marks */}
        <Box
          sx={{
            position: "sticky",
            display: "grid",
            gridAutoFlow: "column",
            gridArea: `2 / 1 / 3 / ${timelineModel.totalColumns}`,
            gridTemplateColumns: "subgrid",
            paddingBottom: (theme) => theme.spacing(2),
          }}>
          {timelineModel.hourMarks.map((mark, i) => (
            <Box
              key={`hour-${mark.index}`}
              data-hour-index={mark.index}
              ref={(el) => registerHourRef(mark.index, el as HTMLDivElement | null)}
              sx={{
                gridArea: `1 / ${mark.index + 1} / 2 / ${mark.index + 2}`,
                bgcolor: currentMark === i ? "primary.main" : "background.paper",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                px: 0.5,
              }}>
              <Typography variant="caption">{mark.label}</Typography>
            </Box>
          ))}
        </Box>

        {/* Background grid */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "subgrid",
            gridArea: `3 / 1 / ${timelineModel.lanes.length + 3} / ${timelineModel.totalColumns}`,
          }}>
          {Array.from({ length: timelineModel.totalColumns - 1 }).map((_, colIndex) => (
            <Box
              key={`bg-col-${colIndex}`}
              sx={{
                mt: (theme) => theme.spacing(-2),
                width: "var(--gap-width)",
                marginLeft: "calc(var(--gap-width) * -1)",
                backgroundColor: "divider",
              }}
            />
          ))}
        </Box>

        {/* Recording bars */}
        {timelineModel.lanes.map((lane, laneIndex) => (
          <Box
            key={`lane-${laneIndex}`}
            sx={{
              display: "grid",
              gridAutoFlow: "dense",
              gridTemplateColumns: "subgrid",
              gridArea: `${laneIndex + 3} / 1 / ${laneIndex + 4} / ${timelineModel.totalColumns}`,
              gap: "4px 1px",
              paddingBottom: (theme) => theme.spacing(2),
            }}>
            {lane.map((item) => (
              <Box
                key={item.recording.id}
                sx={{
                  gridColumn: `${item.startIndex + 1} / ${item.endIndex + 1}`,
                  bgcolor: getStatusColor(item.recording.status),
                  borderRadius: 0.5,
                  p: 0.5,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginLeft: `calc(var(--one-minute-width) * ${item.startDiff / MS_PER_MINUTE})`,
                  marginRight: `calc(var(--one-minute-width) * ${item.endDiff / MS_PER_MINUTE})`,
                  // Apply pulse animation only for active recording states
                  ...(ACTIVE_STATES.has(item.recording.status)
                    ? { animation: "recordingPulse 1.2s ease-in-out infinite" }
                    : {}),
                }}
                title={`${item.recording.name} | ${formatDate(item.recording.startTime)} - ${formatDate(item.endTime)} | ${formatDuration(item.actualDuration)}`}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    color: (theme) => theme.palette.getContrastText(getStatusColor(item.recording.status)),
                    lineHeight: 1,
                    textOverflow: "ellipsis",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                  }}>
                  {item.recording.name}
                </Typography>
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  );
});

RecordingTimeline.displayName = "RecordingTimeline";

export default RecordingTimeline;

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import { RecordingWithStatus } from "@/types/recording";
import { formatDate, formatDuration } from "@/utils";

const TIMELINE_MINUTE_WIDTH_REM = 0.15;
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const ACTIVE_STATUSES = new Set(["starting", "recording", "retrying"]);

type TimelinePoint = {
  recording: RecordingWithStatus;
  startMin: number;
  endMin: number;
};

type TimelineLaneBar = {
  recording: RecordingWithStatus;
  actualDuration: number;
  startIndex: number;
  endIndex: number;
  startDiff: number;
  endDiff: number;
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "completed":
      return "#2e7d32";
    case "recording":
    case "starting":
    case "retrying":
      return "#d32f2f";
    case "failed":
      return "#f57c00";
    case "cancelled":
      return "#6b7280";
    default:
      return "#0288d1";
  }
};

const getTimelineEndMs = (recording: RecordingWithStatus, nowMs: number) => {
  const startMs = new Date(recording.startTime).getTime();
  const plannedEndMs = startMs + Math.max(0, recording.duration) * 1000;
  const finalEndMs = new Date(recording.endedAt ?? recording.completedAt ?? "").getTime();

  if (Number.isFinite(finalEndMs)) {
    return Math.max(finalEndMs, startMs);
  }

  if (ACTIVE_STATUSES.has(recording.status)) {
    // Keep active bars bounded to "now" so long planned durations do not stretch the whole timeline.
    return Math.max(nowMs, startMs);
  }

  return Math.max(plannedEndMs, startMs);
};

const formatDayLabel = (timestampMs: number) => {
  const date = new Date(timestampMs);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const formatTickLabel = (timestampMs: number) => {
  const date = new Date(timestampMs);
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const createTimelineModel = (recordings: RecordingWithStatus[]) => {
  if (!recordings.length) {
    return null;
  }

  const nowMs = Date.now();
  const points = recordings
    .map((recording) => {
      const startMs = new Date(recording.startTime).getTime();
      if (!Number.isFinite(startMs)) {
        return null;
      }

      return {
        recording,
        startMin: Math.floor(startMs / MS_PER_MINUTE) * MS_PER_MINUTE,
        endMin: Math.ceil(getTimelineEndMs(recording, nowMs) / MS_PER_MINUTE) * MS_PER_MINUTE,
      } as TimelinePoint;
    })
    .filter((point): point is TimelinePoint => Boolean(point));

  if (!points.length) {
    return null;
  }

  const minStartMin = Math.floor(Math.min(...points.map((point) => point.startMin)) / MS_PER_HOUR) * MS_PER_HOUR;
  const maxEndMin = Math.ceil(Math.max(...points.map((point) => point.endMin)) / MS_PER_HOUR) * MS_PER_HOUR;

  if (!Number.isFinite(minStartMin) || !Number.isFinite(maxEndMin)) {
    return null;
  }

  const totalMinutes = Math.ceil((maxEndMin - minStartMin) / MS_PER_MINUTE);
  const totalColumns = Math.ceil(totalMinutes / 60);

  const dayMarks: { fromIndex: number; toIndex: number; label: string }[] = [];
  let currentDayStartMin = Math.floor(minStartMin / MS_PER_DAY) * MS_PER_DAY;
  while (currentDayStartMin < maxEndMin) {
    const index = Math.floor((currentDayStartMin - minStartMin) / MS_PER_HOUR);
    dayMarks.push({
      fromIndex: Math.max(0, index),
      toIndex: index + 24,
      label: formatDayLabel(currentDayStartMin),
    });
    currentDayStartMin += MS_PER_DAY;
  }

  const hourMarks: { index: number; label: string; from: number; to: number }[] = [];
  let currentHourMin = Math.ceil(minStartMin / MS_PER_HOUR) * MS_PER_HOUR;
  while (currentHourMin < maxEndMin) {
    const index = Math.floor((currentHourMin - minStartMin) / MS_PER_HOUR);
    hourMarks.push({
      index,
      label: formatTickLabel(currentHourMin),
      from: currentHourMin,
      to: currentHourMin + MS_PER_HOUR,
    });
    currentHourMin += MS_PER_HOUR;
  }

  const pointsByStartTime = points.toSorted((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const laneEndIndexes: number[] = [];
  const lanes: TimelineLaneBar[][] = [];

  for (const point of pointsByStartTime) {
    const actualDuration = (point.endMin - point.startMin) / MS_PER_MINUTE;

    const startIndex = Math.floor((point.startMin - minStartMin) / MS_PER_HOUR);
    const endIndex = Math.ceil((point.endMin - minStartMin) / MS_PER_HOUR);

    // start diff: if the recording starts at 10:10 and the hour mark is at 10:00, then the margin is 10 minutes. If it starts at 9:50, the margin is 50 minutes (or -10 minutes mod 60). This can be used to add padding inside the lane bars if desired.
    const startDiff = (point.startMin - minStartMin) % MS_PER_HOUR;
    const endDiff = (point.endMin - minStartMin) % MS_PER_HOUR;

    let laneIndex = laneEndIndexes.findIndex((laneEndIndex) => laneEndIndex <= startIndex);
    if (laneIndex < 0) {
      laneIndex = laneEndIndexes.length;
      laneEndIndexes.push(0);
      lanes.push([]);
    }

    laneEndIndexes[laneIndex] = endIndex;
    lanes[laneIndex].push({
      recording: point.recording,
      startIndex,
      endIndex,
      startDiff,
      endDiff,
      actualDuration,
    });
  }

  return {
    minStartMin,
    maxEndMin,
    totalColumns,
    dayMarks,
    hourMarks,
    lanes,
  };
};

type RecordingTimelineProps = {
  recordings: RecordingWithStatus[];
};

export type RecordingTimelineHandle = {
  scrollToCurrentTime: () => void;
  scrollToNextRecording: () => void;
};

const RecordingTimeline = forwardRef<RecordingTimelineHandle, RecordingTimelineProps>(({ recordings }, ref) => {
  const [currentHourRef, setCurrentHourRef] = useState<HTMLDivElement | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineModel = useMemo(() => createTimelineModel(recordings), [recordings]);

  const currentMark = useMemo(() => {
    if (!timelineModel) {
      return null;
    }

    return timelineModel.hourMarks.findIndex((mark) => currentTime >= mark.from && currentTime < mark.to) ?? null;
  }, [timelineModel, currentTime]);

  // Calculate the position of the current time indicator line
  const currentTimePosition = useMemo(() => {
    if (!timelineModel || !currentTime) {
      return null;
    }

    // Get the timeline start (minStartMin is in milliseconds and is the actual timeline start)
    const offsetMs = currentTime - timelineModel.minStartMin;
    const offsetMinutes = offsetMs / MS_PER_MINUTE;

    // Calculate which hour column and the minutes within that hour
    const hourIndex = Math.floor(offsetMinutes / 60);
    const minutesInHour = offsetMinutes % 60;

    return {
      hourIndex,
      minutesInHour,
    };
  }, [timelineModel, currentTime]);

  // Expose scrollToCurrentTime method via ref
  useImperativeHandle(ref, () => ({
    scrollToCurrentTime: () => {
      if (containerRef.current && currentHourRef) {
        currentHourRef.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      }
    },
    scrollToNextRecording: () => {
      if (!timelineModel || !containerRef.current) {
        return;
      }

      const now = Date.now();
      const nextRecording = timelineModel.lanes
        .flat()
        .map((bar) => ({
          ...bar,
          startMs: new Date(bar.recording.startTime).getTime(),
        }))
        .filter((bar) => bar.startMs > now)
        .sort((a, b) => a.startMs - b.startMs)[0];

      if (nextRecording) {
        const offsetMs = nextRecording.startMs - timelineModel.minStartMin;
        const offsetMinutes = offsetMs / MS_PER_MINUTE;
        const hourIndex = Math.floor(offsetMinutes / 60);
        const targetHourMark = timelineModel.hourMarks[hourIndex];

        if (targetHourMark) {
          const targetElement = containerRef.current.querySelector(
            `[data-hour-index="${hourIndex}"]`,
          ) as HTMLDivElement;
          if (targetElement) {
            targetElement.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
          }
        }
      }
    },
  }));

  // Update current time every minute to keep the current time indicator line accurate
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60_000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (currentHourRef) {
      currentHourRef.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }
  }, [currentMark, currentHourRef]);

  if (!timelineModel) {
    return <Typography color="text.secondary">No recordings available to render timeline.</Typography>;
  }

  return (
    <Box
      ref={containerRef}
      sx={{
        "--one-minute-width": `${TIMELINE_MINUTE_WIDTH_REM}rem`,
        overflow: "auto",
        maxWidth: "100%",
        borderRadius: 1,
      }}>
      <Box
        sx={{
          display: "grid",
          minHeight: "100%",
          width: "max-content",
          minWidth: "100%",
          gridAutoRows: "max-content",
          gap: "0px 1px",
          gridTemplateRows: "auto auto 1fr",
          gridAutoColumns: "calc(var(--one-minute-width) * 60)",
          position: "relative",
        }}>
        {/* Current time indicator line */}
        {currentTimePosition !== null && (
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
              <Typography variant="button">{mark.label}</Typography>
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
              ref={(el) => {
                if (i === currentMark) {
                  setCurrentHourRef(el as HTMLDivElement);
                }
              }}
              sx={{
                gridArea: `1 / ${mark.index + 1} / 2 / ${mark.index + 2}`,
                bgcolor: currentMark === i ? "primary.dark" : "background.paper",
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
                marginTop: (theme) => theme.spacing(-2),
                width: "1px",
                marginLeft: `-1px`,
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
                }}
                title={`${item.recording.name} | ${formatDate(item.recording.startTime)} | ${formatDuration(item.actualDuration)}`}>
                <Typography
                  variant="caption"
                  sx={{
                    color: "common.white",
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

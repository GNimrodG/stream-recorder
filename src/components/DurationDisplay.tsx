import { RecordingWithStatus } from "@/types/recording";
import { Tooltip } from "@mui/material";
import { formatDuration, getActualDuration } from "@/utils";
import { FC } from "react";

interface DurationDisplayProps {
  recording: RecordingWithStatus;
}

const DurationDisplay: FC<DurationDisplayProps> = ({ recording }) => {
  return (
    <Tooltip
      title={
        recording.status !== "failed" && recording.status !== "completed"
          ? `${formatDuration(recording.duration)} scheduled` + (recording.ignoreDuration ? ", until stream ends" : "")
          : `${formatDuration(recording.duration)} scheduled, ${formatDuration(getActualDuration(recording))} actual`
      }>
      <span>
        {formatDuration(getActualDuration(recording))}
        {recording.ignoreDuration ? "+" : ""}
      </span>
    </Tooltip>
  );
};

export default DurationDisplay;

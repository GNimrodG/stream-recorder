import { STATUS_CONFIG } from "@/lib/status-config";
import { Chip, Stack, Tooltip, Typography } from "@mui/material";
import type { FC } from "react";
import { RecordingWithStatus } from "@/types/recording";
import ErrorIcon from "@mui/icons-material/Announcement";
import WarningIcon from "@mui/icons-material/Warning";

interface StatusDisplayProps {
  recording: RecordingWithStatus;
}

const StatusDisplay: FC<StatusDisplayProps> = ({ recording }) => {
  const config = STATUS_CONFIG[recording.status];

  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      <Chip
        icon={config?.icon}
        label={config?.label || recording.status || "Unknown"}
        color={config?.color}
        size="small"
      />

      {recording.errorMessage && (
        <Tooltip title={recording.errorMessage}>
          {recording.status === "failed" ? (
            <ErrorIcon color="error" fontSize="small" sx={{ ml: 1 }} />
          ) : (
            <WarningIcon color="warning" fontSize="small" sx={{ ml: 1 }} />
          )}
        </Tooltip>
      )}

      {!!recording.fps && (
        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "var(--font-geist-mono)" }}>
          {recording.fps} FPS
        </Typography>
      )}

      {!!recording.frames && (
        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "var(--font-geist-mono)" }}>
          {recording.frames} frames
        </Typography>
      )}

      {!!recording.time && (
        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "var(--font-geist-mono)" }}>
          {recording.time}
        </Typography>
      )}

      {!!recording.bitrate && (
        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "var(--font-geist-mono)" }}>
          {recording.bitrate}
        </Typography>
      )}

      {!!recording.speed && (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "var(--font-geist-mono)" }}>
            {recording.speed}x
          </Typography>

          {recording.speed < 1 && (
            <Tooltip title="Recording is processing slower than real-time. This may indicate performance issues or a bottleneck in the recording pipeline.">
              <WarningIcon color="warning" fontSize="small" sx={{ ml: 0.5 }} />
            </Tooltip>
          )}
        </>
      )}
    </Stack>
  );
};

export default StatusDisplay;

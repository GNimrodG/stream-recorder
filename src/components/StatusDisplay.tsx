import { STATUS_CONFIG } from "@/lib/status-config";
import { Chip, Stack, Tooltip, Typography } from "@mui/material";
import type { FC } from "react";
import { Recording } from "@/types/recording";
import ErrorIcon from "@mui/icons-material/Announcement";
import WarningIcon from "@mui/icons-material/Warning";

interface StatusDisplayProps {
  recording: Recording;
}

const StatusDisplay: FC<StatusDisplayProps> = ({ recording }) => {
  const config = STATUS_CONFIG[recording.status];

  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      <Chip
        icon={config.icon}
        label={config.label || recording.status}
        color={config.color}
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
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontFamily: "var(--font-geist-mono)" }}>
          {recording.fps} FPS
        </Typography>
      )}

      {!!recording.frameCount && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontFamily: "var(--font-geist-mono)" }}>
          {recording.frameCount} frames
        </Typography>
      )}

      {!!recording.bitrate && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontFamily: "var(--font-geist-mono)" }}>
          {recording.bitrate}
        </Typography>
      )}

      {!!recording.speed && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontFamily: "var(--font-geist-mono)" }}>
          {recording.speed}x
        </Typography>
      )}
    </Stack>
  );
};

export default StatusDisplay;

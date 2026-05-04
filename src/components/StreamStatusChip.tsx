import { Chip, Tooltip } from "@mui/material";
import { formatDate } from "@/utils";
import { StreamStatusResult } from "@/types/stream";

export interface ChipStatusChipProps {
  status: StreamStatusResult;
}

export default function StreamStatusChip({ status }: ChipStatusChipProps) {
  const tooltipText = `${status.status.toUpperCase()} | Last checked: ${formatDate(status.lastChecked)}`;

  return (
    <Tooltip title={tooltipText}>
      <Chip
        label={
          status.status === "live"
            ? "LIVE"
            : status.status === "error"
              ? "Error"
              : status.status === "resp_timeout"
                ? status.httpStatus === 401
                  ? "Offline (Auth)"
                  : "Offline"
                : status.httpStatus === 404
                  ? "Offline"
                  : "Server Unavailable"
        }
        color={
          status.status === "live"
            ? "success"
            : status.status === "error"
              ? status.httpStatus === 401
                ? "default"
                : "error"
              : "default"
        }
        size="small"
      />
    </Tooltip>
  );
}

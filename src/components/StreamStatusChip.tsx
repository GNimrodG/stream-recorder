import { Chip, Tooltip } from "@mui/material";
import { formatDate } from "@/utils";
import { StreamStatusResult } from "@/types/stream";

export interface ChipStatusChipProps {
  status: StreamStatusResult;
}

export default function StreamStatusChip({ status }: ChipStatusChipProps) {
  return (
    <Tooltip title={`${status.status.toUpperCase()} | Last checked: ${formatDate(status.lastChecked)}`}>
      <Chip
        label={status.status === "live" ? "LIVE" : status.status === "error" ? "Error" : "Offline"}
        color={status.status === "live" ? "success" : status.status === "error" ? "error" : "default"}
        size="small"
      />
    </Tooltip>
  );
}

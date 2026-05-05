import { Chip, Tooltip } from "@mui/material";
import { formatDate } from "@/utils";
import { StreamStatusResult } from "@/types/stream";
import type { ChipOwnProps } from "@mui/material/Chip";

export interface ChipStatusChipProps {
  status: StreamStatusResult;
}

interface StatusConfig {
  label: string;
  color: ChipOwnProps["color"];
}

const getStatusConfig = (status: StreamStatusResult): StatusConfig => {
  const statusMap: Record<string, StatusConfig> = {
    live: { label: "LIVE", color: "success" },
    timeout: { label: "Server Unreachable", color: "default" },
    resp_timeout: { label: "Offline", color: "default" },
    not_found: { label: "Offline", color: "default" },
    invalid: { label: "Server Unavailable", color: "default" },
  };

  // Handle error status with HTTP code variations
  if (status.status === "error") {
    if (status.httpStatus === 401) {
      return { label: "Offline (Auth)", color: "default" };
    }
    if (status.httpStatus === 404) {
      return { label: "Offline", color: "default" };
    }
    return { label: "Error", color: "error" };
  }

  return statusMap[status.status] || { label: "Unknown", color: "default" };
};

export default function StreamStatusChip({ status }: ChipStatusChipProps) {
  const tooltipText = `${status.status.toUpperCase()} | Last checked: ${formatDate(status.lastChecked)}`;
  const config = getStatusConfig(status);

  return (
    <Tooltip title={tooltipText}>
      <Chip label={config.label} color={config.color} size="small" />
    </Tooltip>
  );
}

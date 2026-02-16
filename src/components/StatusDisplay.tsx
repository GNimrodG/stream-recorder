import { STATUS_CONFIG } from "@/lib/status-config";
import { Chip } from "@mui/material";
import type { FC } from "react";

interface StatusDisplayProps {
  status: keyof typeof STATUS_CONFIG;
}

const StatusDisplay: FC<StatusDisplayProps> = ({ status }) => {
  const config = STATUS_CONFIG[status];

  return (
    <Chip
      icon={config.icon}
      label={config.label || status}
      color={config.color}
      size="small"
    />
  );
};

export default StatusDisplay;

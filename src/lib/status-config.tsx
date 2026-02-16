import ScheduleIcon from "@mui/icons-material/Schedule";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import CancelIcon from "@mui/icons-material/Cancel";

export const STATUS_CONFIG = {
  scheduled: {
    color: "info" as const,
    icon: <ScheduleIcon fontSize="small" />,
    label: "Scheduled",
  },
  recording: {
    color: "error" as const,
    icon: <FiberManualRecordIcon fontSize="small" />,
    label: "Recording",
  },
  completed: {
    color: "success" as const,
    icon: <CheckCircleIcon fontSize="small" />,
    label: "Completed",
  },
  failed: {
    color: "error" as const,
    icon: <ErrorIcon fontSize="small" />,
    label: "Failed",
  },
  cancelled: {
    color: "warning" as const,
    icon: <CancelIcon fontSize="small" />,
    label: "Cancelled",
  },
};

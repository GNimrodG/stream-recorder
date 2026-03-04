import ScheduleIcon from "@mui/icons-material/Schedule";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import CancelIcon from "@mui/icons-material/Cancel";
import { STATUS_COLORS } from "@/theme";

export const STATUS_CONFIG = {
  scheduled: {
    color: STATUS_COLORS.scheduled,
    icon: <ScheduleIcon fontSize="small" />,
    label: "Scheduled",
  },
  starting: {
    color: STATUS_COLORS.starting,
    icon: <ScheduleIcon fontSize="small" />,
    label: "Starting",
  },
  recording: {
    color: STATUS_COLORS.recording,
    icon: <FiberManualRecordIcon fontSize="small" />,
    label: "Recording",
  },
  completed: {
    color: STATUS_COLORS.completed,
    icon: <CheckCircleIcon fontSize="small" />,
    label: "Completed",
  },
  failed: {
    color: STATUS_COLORS.failed,
    icon: <ErrorIcon fontSize="small" />,
    label: "Failed",
  },
  cancelled: {
    color: STATUS_COLORS.cancelled,
    icon: <CancelIcon fontSize="small" />,
    label: "Cancelled",
  },
  retrying: {
    color: STATUS_COLORS.retrying,
    icon: <ScheduleIcon fontSize="small" />,
    label: "Retrying",
  },
};

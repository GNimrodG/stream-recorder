"use client";
import { createTheme } from "@mui/material/styles";
import { blue, orange, red } from "@mui/material/colors";
import { RecordingStatus } from "@/types/recording";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: blue[500],
    },
    warning: {
      main: orange[500],
    },
    error: {
      main: red[500],
    },
    tonalOffset: {
      light: 0.2,
      dark: 0.7,
    },
  },
  typography: {
    fontFamily: "var(--font-geist-sans)",
  },
});

export const STATUS_COLORS: Record<RecordingStatus, string> = {
  scheduled: theme.palette.info.main,
  completed: theme.palette.success.main,
  recording: theme.palette.error.light,
  starting: theme.palette.warning.dark,
  retrying: theme.palette.warning.main,
  failed: theme.palette.error.main,
  cancelled: theme.palette.grey[500],
};

export const getStatusColor = (status: RecordingStatus): string => STATUS_COLORS[status] ?? "#0288d1";

export default theme;

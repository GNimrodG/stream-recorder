import Box from "@mui/material/Box";
import LinearProgress, { LinearProgressProps } from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";
import { useId } from "react";

export function LinearProgressWithLabelAndValue(props: LinearProgressProps & { value: number }) {
  const progressId = useId();
  return (
    <Box sx={{ ...props.sx, display: "flex", alignItems: "center" }}>
      <Box sx={{ width: "100%", mr: 1 }}>
        <LinearProgress
          variant="determinate"
          aria-labelledby={progressId}
          {...props}
          sx={{ height: 8, borderRadius: 1 }}
        />
      </Box>
      <Box sx={{ minWidth: 35 }}>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {`${Math.round(props.value)}%`}
        </Typography>
      </Box>
    </Box>
  );
}

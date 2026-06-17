import Box from "@mui/material/Box";
import LinearProgress, { LinearProgressProps } from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";
import { useId } from "react";

export function LinearProgressWithLabelAndValue(props: LinearProgressProps & { value: number; valueBuffer?: number }) {
  const progressId = useId();
  return (
    <Box sx={{ ...props.sx, display: "flex", alignItems: "center" }}>
      <Box sx={{ width: "100%", mr: 1 }}>
        <LinearProgress
          aria-labelledby={progressId}
          {...props}
          value={Math.min(props.value, 100)}
          sx={{
            height: 8,
            borderRadius: 1,
            ["& .MuiLinearProgress-dashed"]: {
              background: (theme) => theme.palette.background.paper,
              animation: "none",
            },
          }}
        />
      </Box>
      <Box sx={{ minWidth: props.valueBuffer ? 60 : 35 }}>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {`${Math.round(props.value)}%`} {!!props.valueBuffer && `(${Math.round(props.valueBuffer - props.value)}%)`}
        </Typography>
      </Box>
    </Box>
  );
}

import { Box, CircularProgress } from "@mui/material";

export default function StreamsLoading() {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "50vh",
      }}>
      <CircularProgress />
    </Box>
  );
}

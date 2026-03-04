import { Box, CircularProgress } from "@mui/material";

export default function RootLoading() {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        bgcolor: "background.default",
      }}>
      <CircularProgress />
    </Box>
  );
}

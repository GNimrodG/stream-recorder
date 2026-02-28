"use client";

import React from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle } from "@mui/material";
import { RecordingWithStatus } from "@/types/recording";

type Props = {
  open: boolean;
  onCloseAction: () => void;
  recording: RecordingWithStatus | null;
};

export default function RecordingPreviewDialog({ open, onCloseAction, recording }: Props) {
  return (
    <Dialog open={open} onClose={onCloseAction} maxWidth="md" fullWidth>
      <DialogTitle>Stream Preview: {recording?.name}</DialogTitle>
      <DialogContent>
        {recording && (
          <Box
            sx={{
              width: "100%",
              aspectRatio: "16/9",
              bgcolor: "black",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
            <iframe
              src={`/api/recordings/${recording.id}/preview`}
              style={{ width: "100%", height: "100%", border: "none" }}
              title="Stream Preview"
            />
          </Box>
        )}
        <Alert severity="info" sx={{ mt: 2 }}>
          Live preview requires the stream to be actively recording. The preview shows a snapshot of the current stream.
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCloseAction}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

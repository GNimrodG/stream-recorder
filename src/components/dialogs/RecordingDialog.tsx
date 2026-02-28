"use client";

import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from "@mui/material";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import LinkIcon from "@mui/icons-material/Link";
import { CreateRecordingDto } from "@/types/recording";
import { SavedStream } from "@/types/stream";
import DurationInput from "@/components/inputs/DurationInput";
import { useCallback, useEffect, useState } from "react";

interface RecordingDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
  formData: CreateRecordingDto;
  onFormChange: (data: CreateRecordingDto) => void;
  title?: string;
  submitLabel?: string;
}

export default function RecordingDialog({
  open,
  onClose,
  onSubmit,
  formData,
  onFormChange,
  title = "Schedule New Recording",
  submitLabel = "Schedule Recording",
}: RecordingDialogProps) {
  const [selectedStreamId, setSelectedStreamId] = useState<string>("");
  const [savedStreams, setSavedStreams] = useState<SavedStream[]>([]);

  useEffect(() => {
    const fetchSavedStreams = async () => {
      try {
        const response = await fetch("/api/streams");
        const data = await response.json();
        setSavedStreams(data);
      } catch (error) {
        console.error("Failed to fetch saved streams:", error);
      }
    };

    if (open) {
      fetchSavedStreams().then();
    }
  }, [open]);

  const onStartTimeChange = useCallback(
    (date: Date | null) => {
      const rounded = date ? new Date(date) : null;
      rounded?.setSeconds(0, 0); // Round to nearest minute
      onFormChange({
        ...formData,
        startTime: (rounded ?? new Date()).toISOString(),
      });
    },
    [onFormChange, formData],
  );

  const onEndTimeChange = useCallback(
    (date: Date | null) => {
      if (!date) return;
      const duration = Math.round((date.getTime() - new Date(formData.startTime).getTime()) / 60000);
      onFormChange({
        ...formData,
        duration: duration > 0 ? duration : formData.duration,
      });
    },
    [onFormChange, formData],
  );

  const handleSelectSavedStream = (streamId: string) => {
    setSelectedStreamId(streamId);
    const stream = savedStreams.find((s) => s.id === streamId);
    if (stream) {
      onFormChange({
        ...formData,
        rtspUrl: stream.rtspUrl,
      });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          {/* Saved Streams Dropdown */}
          {savedStreams.length > 0 && (
            <>
              <FormControl fullWidth>
                <InputLabel>Use Saved Stream</InputLabel>
                <Select
                  value={selectedStreamId}
                  label="Use Saved Stream"
                  onChange={(e) => handleSelectSavedStream(e.target.value)}
                  startAdornment={<LinkIcon sx={{ mr: 1, ml: -0.5 }} />}>
                  <MenuItem value="" disabled>
                    <em>Select a saved stream...</em>
                  </MenuItem>
                  {savedStreams.map((stream) => (
                    <MenuItem key={stream.id} value={stream.id}>
                      {stream.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Divider>
                <Chip label="or enter manually" size="small" />
              </Divider>
            </>
          )}

          <TextField
            label="Recording Name"
            fullWidth
            value={formData.name}
            onChange={(e) => onFormChange({ ...formData, name: e.target.value })}
            placeholder="e.g., Camera 1 - Morning"
          />

          <TextField
            label="RTSP URL"
            fullWidth
            value={formData.rtspUrl}
            onChange={(e) => onFormChange({ ...formData, rtspUrl: e.target.value })}
            placeholder="rtsp://username:password@ip:port/stream"
            helperText="Enter the full RTSP stream URL"
          />

          <DateTimePicker label="Start Time" value={new Date(formData.startTime)} onChange={onStartTimeChange} />

          <DateTimePicker
            label="End Time"
            value={new Date(new Date(formData.startTime).getTime() + formData.duration * 1000)}
            onChange={onEndTimeChange}
          />

          {/* Duration with presets */}
          <DurationInput value={formData.duration} onChange={(duration) => onFormChange({ ...formData, duration })} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={onSubmit}
          disabled={!formData.name || !formData.rtspUrl || !formData.duration}>
          {submitLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

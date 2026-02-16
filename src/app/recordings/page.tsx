"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import AddIcon from "@mui/icons-material/Add";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import DeleteIcon from "@mui/icons-material/Delete";
import RefreshIcon from "@mui/icons-material/Refresh";
import ErrorIcon from "@mui/icons-material/Announcement";
import DownloadIcon from "@mui/icons-material/Download";
import PreviewIcon from "@mui/icons-material/Visibility";
import EditIcon from "@mui/icons-material/Edit";
import FolderIcon from "@mui/icons-material/Folder";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import { CreateRecordingDto, Recording } from "@/types/recording";
import RecordingDialog from "@/components/RecordingDialog";
import StatusDisplay from "@/components/StatusDisplay";
import { formatDate, formatDuration } from "@/utils";

export default function RecordingsPage() {
  return (
    <Suspense fallback={<CircularProgress />}>
      <RecordingsPageContent />
    </Suspense>
  );
}

function RecordingsPageContent() {
  const searchParams = useSearchParams();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(
    null,
  );
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({
    open: false,
    message: "",
    severity: "success",
  });

  const [formData, setFormData] = useState<CreateRecordingDto>({
    name: "",
    rtspUrl: "",
    startTime: new Date().toISOString(),
    duration: 3600,
  });

  const fetchRecordings = useCallback(async () => {
    try {
      const response = await fetch("/api/recordings");
      const data = await response.json();
      setRecordings(data);
    } catch (error) {
      console.error("Failed to fetch recordings:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecordings();
    const interval = setInterval(fetchRecordings, 10000);
    return () => clearInterval(interval);
  }, [fetchRecordings]);

  // Handle URL params for pre-filled recording form
  useEffect(() => {
    const name = searchParams.get("name");
    const rtspUrl = searchParams.get("rtspUrl");
    if (name || rtspUrl) {
      setFormData((prev) => ({
        ...prev,
        name: name || prev.name,
        rtspUrl: rtspUrl || prev.rtspUrl,
      }));
      setDialogOpen(true);
      // Clear URL params
      window.history.replaceState({}, "", "/recordings");
    }
  }, [searchParams]);

  const handleCreateRecording = async () => {
    try {
      const response = await fetch("/api/recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create recording");
      }

      setDialogOpen(false);
      setFormData({
        name: "",
        rtspUrl: "",
        startTime: new Date().toISOString(),
        duration: 3600,
      });
      setSnackbar({
        open: true,
        message: "Recording scheduled successfully!",
        severity: "success",
      });
      await fetchRecordings();
    } catch (error) {
      setSnackbar({
        open: true,
        message: (error as Error).message,
        severity: "error",
      });
    }
  };

  const handleUpdateRecording = async () => {
    if (!selectedRecording) return;

    try {
      const response = await fetch(`/api/recordings/${selectedRecording.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          rtspUrl: formData.rtspUrl,
          startTime: formData.startTime,
          duration: formData.duration,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update recording");
      }

      setEditDialogOpen(false);
      setSelectedRecording(null);
      setSnackbar({
        open: true,
        message: "Recording updated successfully!",
        severity: "success",
      });
      fetchRecordings();
    } catch (error) {
      setSnackbar({
        open: true,
        message: (error as Error).message,
        severity: "error",
      });
    }
  };

  const handleStartRecording = async (id: string) => {
    try {
      const response = await fetch(`/api/recordings/${id}?action=start`, {
        method: "POST",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to start recording");
      }
      setSnackbar({
        open: true,
        message: "Recording started!",
        severity: "success",
      });
      fetchRecordings();
    } catch (error) {
      setSnackbar({
        open: true,
        message: (error as Error).message,
        severity: "error",
      });
    }
  };

  const handleStopRecording = async (id: string) => {
    try {
      const response = await fetch(`/api/recordings/${id}?action=stop`, {
        method: "POST",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to stop recording");
      }
      setSnackbar({
        open: true,
        message: "Recording stopped!",
        severity: "success",
      });
      fetchRecordings();
    } catch (error) {
      setSnackbar({
        open: true,
        message: (error as Error).message,
        severity: "error",
      });
    }
  };

  const handleDeleteRecording = async (id: string) => {
    if (!confirm("Are you sure you want to delete this recording?")) return;

    try {
      const response = await fetch(`/api/recordings/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete recording");
      }
      setSnackbar({
        open: true,
        message: "Recording deleted!",
        severity: "success",
      });
      fetchRecordings();
    } catch (error) {
      setSnackbar({
        open: true,
        message: (error as Error).message,
        severity: "error",
      });
    }
  };

  const handleEditClick = (recording: Recording) => {
    setSelectedRecording(recording);
    setFormData({
      name: recording.name,
      rtspUrl: recording.rtspUrl,
      startTime: recording.startTime,
      duration: recording.duration,
    });
    setEditDialogOpen(true);
  };

  const handlePreviewClick = (recording: Recording) => {
    setSelectedRecording(recording);
    setPreviewDialogOpen(true);
  };

  const filteredRecordings =
    filterStatus === "all"
      ? recordings
      : recordings.filter((r) => r.status === filterStatus);

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      {/* Page Header */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}>
        <Typography variant="h4" fontWeight="bold">
          Recordings
        </Typography>
        <Tooltip title="Refresh">
          <IconButton onClick={fetchRecordings} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Filter Chips */}
      <Box sx={{ display: "flex", gap: 1, mb: 3, flexWrap: "wrap" }}>
        {[
          "all",
          "scheduled",
          "recording",
          "completed",
          "failed",
          "cancelled",
        ].map((status) => (
          <Chip
            key={status}
            label={status.charAt(0).toUpperCase() + status.slice(1)}
            onClick={() => setFilterStatus(status)}
            color={filterStatus === status ? "primary" : "default"}
            variant={filterStatus === status ? "filled" : "outlined"}
          />
        ))}
      </Box>

      {/* Recordings Table */}
      <Paper sx={{ p: 3 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 2,
          }}>
          <Typography variant="h6" sx={{ fontWeight: "bold" }}>
            All Recordings ({filteredRecordings.length})
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setFormData({
                name: "",
                rtspUrl: "",
                startTime: new Date().toISOString(),
                duration: 3600,
              });
              setDialogOpen(true);
            }}>
            New Recording
          </Button>
        </Box>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>RTSP URL</TableCell>
                <TableCell>Start Time</TableCell>
                <TableCell>Duration</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Output</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : filteredRecordings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    No recordings found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredRecordings.map((recording) => (
                  <TableRow key={recording.id}>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {recording.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Created: {formatDate(recording.createdAt)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Tooltip title={recording.rtspUrl}>
                        <Typography
                          variant="body2"
                          sx={{
                            maxWidth: 150,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}>
                          {recording.rtspUrl}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell>{formatDate(recording.startTime)}</TableCell>
                    <TableCell>{formatDuration(recording.duration)}</TableCell>
                    <TableCell>
                      <Stack direction="row" alignItems="center">
                        <StatusDisplay status={recording.status} />

                        {recording.errorMessage && (
                          <Tooltip title={recording.errorMessage}>
                            <ErrorIcon
                              color="error"
                              fontSize="small"
                              sx={{ ml: 1 }}
                            />
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      {recording.outputPath ? (
                        <Tooltip title={recording.outputPath}>
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 0.5,
                            }}>
                            <FolderIcon fontSize="small" color="action" />
                            <Typography
                              variant="caption"
                              sx={{
                                maxWidth: 100,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}>
                              {recording.outputPath.split("/").pop()}
                            </Typography>
                          </Box>
                        </Tooltip>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          -
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "flex-end",
                          gap: 0.5,
                        }}>
                        {recording.status === "recording" && (
                          <Tooltip title="Preview Stream">
                            <IconButton
                              color="info"
                              size="small"
                              onClick={() => handlePreviewClick(recording)}>
                              <PreviewIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        {recording.status === "scheduled" && (
                          <>
                            <Tooltip title="Edit">
                              <IconButton
                                color="primary"
                                size="small"
                                onClick={() => handleEditClick(recording)}>
                                <EditIcon />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Start Now">
                              <IconButton
                                color="success"
                                size="small"
                                onClick={() =>
                                  handleStartRecording(recording.id)
                                }>
                                <PlayArrowIcon />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                        {recording.status === "recording" && (
                          <Tooltip title="Stop">
                            <IconButton
                              color="error"
                              size="small"
                              onClick={() => handleStopRecording(recording.id)}>
                              <StopIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        {recording.status === "completed" &&
                          recording.outputPath && (
                            <>
                              <Tooltip title="Watch">
                                <IconButton
                                  color="success"
                                  size="small"
                                  component="a"
                                  href="/viewer">
                                  <PlayCircleIcon />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Download">
                                <IconButton
                                  color="primary"
                                  size="small"
                                  component="a"
                                  href={`/api/recordings/${recording.id}/download`}
                                  download>
                                  <DownloadIcon />
                                </IconButton>
                              </Tooltip>
                            </>
                          )}
                        <Tooltip title="Delete">
                          <IconButton
                            color="error"
                            size="small"
                            onClick={() => handleDeleteRecording(recording.id)}>
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Create Recording Dialog */}
      <RecordingDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleCreateRecording}
        formData={formData}
        onFormChange={setFormData}
        title="Schedule New Recording"
        submitLabel="Schedule Recording"
      />

      {/* Edit Recording Dialog */}
      <RecordingDialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        onSubmit={handleUpdateRecording}
        formData={formData}
        onFormChange={setFormData}
        title="Edit Recording"
        submitLabel="Update Recording"
      />

      {/* Preview Dialog */}
      <Dialog
        open={previewDialogOpen}
        onClose={() => setPreviewDialogOpen(false)}
        maxWidth="md"
        fullWidth>
        <DialogTitle>Stream Preview: {selectedRecording?.name}</DialogTitle>
        <DialogContent>
          {selectedRecording && (
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
                src={`/api/recordings/${selectedRecording.id}/preview`}
                style={{ width: "100%", height: "100%", border: "none" }}
                title="Stream Preview"
              />
            </Box>
          )}
          <Alert severity="info" sx={{ mt: 2 }}>
            Live preview requires the stream to be actively recording. The
            preview shows a snapshot of the current stream.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}>
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </LocalizationProvider>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  IconButton,
  Paper,
  Snackbar,
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
import { CreateRecordingDto, RecordingStats } from "@/types/recording";
import RecordingDialog from "@/components/dialogs/RecordingDialog";
import { formatDate, formatDuration } from "@/utils";
import StatusDisplay from "@/components/StatusDisplay";
import useRecordings from "@/hooks/useRecordings";

export default function Dashboard() {
  const { recordings, loading: recordingsLoading, fetchRecordings } = useRecordings(5000, true);
  const [stats, setStats] = useState<RecordingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
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

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch("/api/recordings/stats");
      const data = await response.json();
      // Only update if data actually changed
      setStats((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(data)) {
          return prev;
        }
        return data;
      });
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  }, []);

  const fetchAll = useCallback(
    async (showLoading = true) => {
      if (showLoading) {
        setLoading(true);
      }
      await Promise.all([fetchRecordings(), fetchStats()]);
      if (showLoading) {
        setLoading(false);
      }
    },
    [fetchRecordings, fetchStats],
  );

  useEffect(() => {
    fetchAll(true); // Show loading on initial load
    const interval = setInterval(() => fetchAll(false), 10000); // No loading on refresh
    return () => clearInterval(interval);
  }, [fetchAll]);

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
      fetchAll(false);
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
      fetchAll(false);
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
      fetchAll(false);
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
      fetchAll(false);
    } catch (error) {
      setSnackbar({
        open: true,
        message: (error as Error).message,
        severity: "error",
      });
    }
  };

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
          Dashboard
        </Typography>
        <Tooltip title="Refresh">
          <IconButton onClick={() => fetchAll(true)} disabled={loading || recordingsLoading}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {[
          {
            title: "Total Recordings",
            value: stats?.total ?? 0,
            color: "#1976d2",
          },
          {
            title: "Scheduled",
            value: stats?.scheduled ?? 0,
            color: "#0288d1",
          },
          {
            title: "Recording Now",
            value: stats?.recording ?? 0,
            color: "#d32f2f",
          },
          {
            title: "Completed",
            value: stats?.completed ?? 0,
            color: "#2e7d32",
          },
          {
            title: "Failed",
            value: stats?.failed ?? 0,
            color: "#f57c00",
          },
        ].map((card, _i, arr) => (
          <Grid size={{ xs: 12, sm: 12 / arr.length }} key={card.title}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom variant="body2">
                  {card.title}
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: "bold", color: card.color }}>
                  {card.value ?? <CircularProgress size={24} />}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

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
            Recent Recordings
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
            New Recording
          </Button>
        </Box>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: { xs: "auto", md: "30%" } }}>Name</TableCell>
                <TableCell sx={{ width: { xs: "auto", md: "10%" } }}>RTSP URL</TableCell>
                <TableCell sx={{ width: { xs: "auto", md: "10%" } }}>Start Time</TableCell>
                <TableCell sx={{ width: { xs: "auto", md: "10%" } }}>Duration</TableCell>
                <TableCell sx={{ width: { xs: "auto", md: "40%" } }}>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {!recordings.length && (loading || recordingsLoading) ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <CircularProgress size="2rem" />
                  </TableCell>
                </TableRow>
              ) : recordings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    No recordings found. Create your first recording!
                  </TableCell>
                </TableRow>
              ) : (
                recordings
                  .toSorted((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
                  .slice(0, 10)
                  .map((recording) => (
                    <TableRow key={recording.id}>
                      <TableCell>{recording.name}</TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{
                            maxWidth: "100%",
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}>
                          {recording.rtspUrl}
                        </Typography>
                      </TableCell>
                      <TableCell>{formatDate(recording.startTime)}</TableCell>
                      <TableCell>{formatDuration(recording.duration)}</TableCell>
                      <TableCell>
                        <StatusDisplay recording={recording} />
                      </TableCell>
                      <TableCell align="right">
                        {recording.status === "scheduled" && (
                          <Tooltip title="Start Now">
                            <IconButton color="success" onClick={() => handleStartRecording(recording.id)}>
                              <PlayArrowIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        {(recording.status === "recording" || recording.status === "retrying") && (
                          <Tooltip title="Stop">
                            <IconButton color="error" onClick={() => handleStopRecording(recording.id)}>
                              <StopIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Delete">
                          <IconButton color="error" onClick={() => handleDeleteRecording(recording.id)}>
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
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

      {/* Snackbar */}
      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </LocalizationProvider>
  );
}

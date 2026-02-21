"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import RefreshIcon from "@mui/icons-material/Refresh";
import VideoCameraBackIcon from "@mui/icons-material/VideoCameraBack";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import VideocamIcon from "@mui/icons-material/Videocam";
import LinkIcon from "@mui/icons-material/Link";
import StarIcon from "@mui/icons-material/Star";
import RadioButtonCheckedIcon from "@mui/icons-material/RadioButtonChecked";
import { SavedStream } from "@/types/stream";
import { formatDate } from "@/utils";

export default function StreamsPage() {
  const [streams, setStreams] = useState<SavedStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedStream, setSelectedStream] = useState<SavedStream | null>(null);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error" | "info";
  }>({
    open: false,
    message: "",
    severity: "success",
  });

  const [streamChecking, setStreamChecking] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [formData, setFormData] = useState<Omit<SavedStream, "id" | "createdAt" | "updatedAt">>({
    name: "",
    rtspUrl: "",
    description: "",
    favorite: false,
  });

  const fetchStreams = useCallback(async () => {
    try {
      const response = await fetch("/api/streams");
      const data = await response.json();
      setStreams(data);
    } catch (error) {
      console.error("Failed to fetch streams:", error);
      setSnackbar({
        open: true,
        message: "Failed to load saved streams",
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStreams();
  }, [fetchStreams]);

  const handleOpenDialog = (stream?: SavedStream) => {
    if (stream) {
      setEditMode(true);
      setSelectedStream(stream);
      setFormData(structuredClone(stream));
    } else {
      setEditMode(false);
      setSelectedStream(null);
      setFormData({
        name: "",
        rtspUrl: "",
        description: "",
        favorite: false,
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setSelectedStream(null);
    setFormData({ name: "", rtspUrl: "", description: "" });
  };

  const handleSaveStream = async () => {
    try {
      const url = editMode && selectedStream ? `/api/streams/${selectedStream.id}` : "/api/streams";

      const method = editMode ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save stream");
      }

      handleCloseDialog();
      setSnackbar({
        open: true,
        message: editMode ? "Stream updated successfully!" : "Stream saved successfully!",
        severity: "success",
      });
      await fetchStreams();
    } catch (error) {
      setSnackbar({
        open: true,
        message: (error as Error).message,
        severity: "error",
      });
    }
  };

  const handleDeleteStream = async (id: string) => {
    if (!confirm("Are you sure you want to delete this saved stream?")) return;

    try {
      const response = await fetch(`/api/streams/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete stream");
      }
      setSnackbar({
        open: true,
        message: "Stream deleted!",
        severity: "success",
      });
      await fetchStreams();
    } catch (error) {
      setSnackbar({
        open: true,
        message: (error as Error).message,
        severity: "error",
      });
    }
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setSnackbar({
      open: true,
      message: "URL copied to clipboard!",
      severity: "info",
    });
  };

  const handleQuickRecord = (stream: SavedStream) => {
    // Navigate to recordings page with pre-filled data
    const params = new URLSearchParams({
      name: stream.name,
      rtspUrl: stream.rtspUrl,
    });
    window.location.href = `/recordings?${params.toString()}`;
  };

  const handleCheckStream = async (stream: SavedStream) => {
    setStreamChecking(true);
    try {
      const response = await fetch(`/api/streams/${stream.id}/check`);
      const data = (await response.json()) as {
        snapshot?: string;
        error?: string;
      };

      if (response.ok) {
        setPreviewImage(data.snapshot || null);
        setSnackbar({
          open: true,
          message: "Stream is live! Snapshot captured.",
          severity: "success",
        });
      } else {
        throw new Error(data.error || "Stream is not live");
      }
    } catch (error) {
      setSnackbar({
        open: true,
        message: (error as Error).message,
        severity: "error",
      });
    } finally {
      setStreamChecking(false);
    }
  };

  return (
    <>
      {/* Page Header */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}>
        <Typography variant="h4" fontWeight="bold">
          Saved Streams
        </Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Tooltip title="Refresh">
            <IconButton onClick={fetchStreams} disabled={loading}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>
            Add Stream
          </Button>
        </Box>
      </Box>

      {/* Info Card */}
      <Card sx={{ mb: 3, bgcolor: "primary.dark" }}>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <VideocamIcon sx={{ fontSize: 40 }} />
            <Box>
              <Typography variant="h6">Quick Access to Your Streams</Typography>
              <Typography variant="body2" color="text.secondary">
                Save your frequently used RTSP URLs here for quick access when creating recordings.
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Streams Grid/Table */}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress />
        </Box>
      ) : streams.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: "center" }}>
          <LinkIcon sx={{ fontSize: 64, color: "text.secondary", mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            No saved streams yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Add your RTSP stream URLs here for quick access
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>
            Add Your First Stream
          </Button>
        </Paper>
      ) : (
        <>
          {/* Card Grid View */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {streams
              .filter((x) => x.favorite)
              .map((stream) => (
                <Grid size={{ xs: 12, sm: 6, md: 4 }} key={stream.id}>
                  <Card sx={{ height: "100%" }}>
                    <CardContent>
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          mb: 1,
                        }}>
                        <Typography variant="h6" noWrap sx={{ flex: 1 }}>
                          {stream.name}
                        </Typography>
                        <Chip label="RTSP" size="small" color="primary" variant="outlined" />
                      </Box>

                      {stream.description && (
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                          {stream.description}
                        </Typography>
                      )}

                      <Tooltip title={stream.rtspUrl}>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            display: "block",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            mb: 2,
                            fontFamily: "monospace",
                            bgcolor: "action.hover",
                            p: 0.5,
                            borderRadius: 1,
                          }}>
                          {stream.rtspUrl}
                        </Typography>
                      </Tooltip>

                      <Box sx={{ display: "flex", gap: 1 }}>
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<RadioButtonCheckedIcon />}
                          onClick={() => handleQuickRecord(stream)}>
                          Record
                        </Button>
                        <Tooltip title="Check if stream is live">
                          <IconButton
                            size="small"
                            color="success"
                            disabled={streamChecking}
                            onClick={() => handleCheckStream(stream)}>
                            <VideoCameraBackIcon />
                          </IconButton>
                        </Tooltip>
                        <IconButton size="small" onClick={() => handleCopyUrl(stream.rtspUrl)}>
                          <ContentCopyIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => handleOpenDialog(stream)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => handleDeleteStream(stream.id)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
          </Grid>

          {/* Table View */}
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 2 }}>
              All Saved Streams
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>RTSP URL</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell>Added</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {streams.map((stream) => (
                    <TableRow key={stream.id}>
                      <TableCell>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Typography variant="body2" fontWeight="medium">
                            {stream.name}
                          </Typography>

                          {stream.favorite && <StarIcon sx={{ color: "gold" }} />}
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Tooltip title={stream.rtspUrl}>
                          <Typography
                            variant="body2"
                            sx={{
                              maxWidth: 200,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              fontFamily: "monospace",
                              fontSize: 12,
                            }}>
                            {stream.rtspUrl}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {stream.description || "-"}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">{formatDate(stream.createdAt)}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={0.5}>
                          <Tooltip title="Check if stream is live">
                            <IconButton
                              size="small"
                              color="success"
                              disabled={streamChecking}
                              onClick={() => handleCheckStream(stream)}>
                              <VideoCameraBackIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Quick Record">
                            <IconButton size="small" color="primary" onClick={() => handleQuickRecord(stream)}>
                              <RadioButtonCheckedIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Copy URL">
                            <IconButton size="small" onClick={() => handleCopyUrl(stream.rtspUrl)}>
                              <ContentCopyIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={() => handleOpenDialog(stream)}>
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton size="small" color="error" onClick={() => handleDeleteStream(stream.id)}>
                              <DeleteIcon />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      )}

      {/* Add/Edit Stream Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editMode ? "Edit Stream" : "Add New Stream"}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            <TextField
              label="Stream Name"
              fullWidth
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Front Door Camera"
            />
            <TextField
              label="RTSP URL"
              fullWidth
              value={formData.rtspUrl}
              onChange={(e) => setFormData({ ...formData, rtspUrl: e.target.value })}
              placeholder="rtsp://username:password@ip:port/stream"
              helperText="The full RTSP stream URL including credentials if needed"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <LinkIcon />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <TextField
              label="Description (optional)"
              fullWidth
              multiline
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="e.g., Main entrance camera, 1080p"
            />

            <FormControlLabel
              control={
                <Checkbox
                  checked={formData.favorite || false}
                  onChange={(e) => setFormData({ ...formData, favorite: e.target.checked })}
                />
              }
              label="Mark as Favorite for quick access"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveStream} disabled={!formData.name || !formData.rtspUrl}>
            {editMode ? "Update" : "Save"} Stream
          </Button>
        </DialogActions>
      </Dialog>

      {/* Stream Snapshot Dialog */}
      <Dialog open={!!previewImage} onClose={() => setPreviewImage(null)} maxWidth="md" fullWidth>
        <DialogTitle>Stream Snapshot</DialogTitle>
        <DialogContent sx={{ textAlign: "center" }}>
          {previewImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewImage} alt="Stream Snapshot" style={{ maxWidth: "100%" }} />
          ) : (
            <Typography variant="body2" color="text.secondary">
              No snapshot available
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewImage(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}

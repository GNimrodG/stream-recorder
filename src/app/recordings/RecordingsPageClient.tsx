"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
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
import DownloadIcon from "@mui/icons-material/Download";
import PreviewIcon from "@mui/icons-material/Visibility";
import ArticleIcon from "@mui/icons-material/Article";
import EditIcon from "@mui/icons-material/Edit";
import FolderIcon from "@mui/icons-material/Folder";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import SensorsIcon from "@mui/icons-material/Sensors";
import SensorsOffIcon from "@mui/icons-material/SensorsOff";
import {
  CreateRecordingDto,
  RecordingFilterStatus,
  RecordingPaginationMeta,
  RecordingWithStatus,
} from "@/types/recording";
import RecordingDialog from "@/components/dialogs/RecordingDialog";
import RecordingLogsDialog from "@/components/dialogs/RecordingLogsDialog";
import StatusDisplay from "@/components/StatusDisplay";
import RecordingPreviewDialog from "@/components/dialogs/RecordingPreviewDialog";
import { formatDate, formatDuration, getActualDuration } from "@/utils";
import CustomChip from "@/components/CustomChip";
import { STATUS_COLORS } from "@/theme";

const FILTERS: RecordingFilterStatus[] = [
  "all",
  "scheduled",
  "starting",
  "recording",
  "completed",
  "failed",
  "cancelled",
  "retrying",
];

type PaginatedRecordingsResponse = {
  data: RecordingWithStatus[];
  pagination: RecordingPaginationMeta;
};

type Props = {
  initialRecordings: RecordingWithStatus[];
  initialPagination: RecordingPaginationMeta;
  initialStatus: RecordingFilterStatus;
  initialName?: string;
  initialRtspUrl?: string;
};

export default function RecordingsPageClient({
  initialRecordings,
  initialPagination,
  initialStatus,
  initialName,
  initialRtspUrl,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [recordings, setRecordings] = useState<RecordingWithStatus[]>(initialRecordings);
  const [pagination, setPagination] = useState<RecordingPaginationMeta>(initialPagination);
  const [filterStatus, setFilterStatus] = useState<RecordingFilterStatus>(initialStatus);
  const [loading, setLoading] = useState(false);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecording, setEditingRecording] = useState<RecordingWithStatus | null>(null);
  const [previewRecording, setPreviewRecording] = useState<RecordingWithStatus | null>(null);
  const [logsRecording, setLogsRecording] = useState<RecordingWithStatus | null>(null);
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

  const replaceQuery = useCallback(
    (next: { page: number; pageSize: number; status: RecordingFilterStatus }, clearPrefill = false) => {
      const params = new URLSearchParams(searchParams.toString());

      if (next.status === "all") {
        params.delete("status");
      } else {
        params.set("status", next.status);
      }

      if (next.page === 1) {
        params.delete("page");
      } else {
        params.set("page", String(next.page));
      }

      if (next.pageSize === 10) {
        params.delete("pageSize");
      } else {
        params.set("pageSize", String(next.pageSize));
      }

      if (clearPrefill) {
        params.delete("name");
        params.delete("rtspUrl");
      }

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const fetchRecordings = useCallback(
    async (
      query: { page: number; pageSize: number; status: RecordingFilterStatus },
      options: { showLoading?: boolean } = { showLoading: true },
    ) => {
      if (options.showLoading) {
        setLoading(true);
      }

      try {
        const statusQuery = query.status === "all" ? "" : `&status=${query.status}`;
        const response = await fetch(`/api/recordings?page=${query.page}&pageSize=${query.pageSize}${statusQuery}`);
        const data: PaginatedRecordingsResponse = await response.json();
        setRecordings(data.data);
        setPagination(data.pagination);
      } catch (error) {
        console.error("Failed to fetch recordings:", error);
      } finally {
        if (options.showLoading) {
          setLoading(false);
        }
      }
    },
    [],
  );

  // Open the create dialog with pre-filled URL params and clean up those params afterwards.
  useEffect(() => {
    if (!initialName && !initialRtspUrl) {
      return;
    }

    setFormData((prev) => ({
      ...prev,
      name: initialName || prev.name,
      rtspUrl: initialRtspUrl || prev.rtspUrl,
    }));
    setDialogOpen(true);
    replaceQuery(
      {
        page: pagination.page,
        pageSize: pagination.pageSize,
        status: filterStatus,
      },
      true,
    );
  }, [filterStatus, initialName, initialRtspUrl, pagination.page, pagination.pageSize, replaceQuery]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchRecordings(
        {
          page: pagination.page,
          pageSize: pagination.pageSize,
          status: filterStatus,
        },
        { showLoading: false },
      );
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchRecordings, filterStatus, pagination.page, pagination.pageSize]);

  const refreshCurrentPage = useCallback(async () => {
    setIsManualRefreshing(true);
    try {
      await fetchRecordings(
        { page: pagination.page, pageSize: pagination.pageSize, status: filterStatus },
        { showLoading: false },
      );
    } finally {
      setIsManualRefreshing(false);
    }
  }, [fetchRecordings, filterStatus, pagination.page, pagination.pageSize]);

  const applyQueryState = useCallback(
    async (next: { page: number; pageSize: number; status: RecordingFilterStatus }) => {
      setFilterStatus(next.status);
      setPagination((prev) => ({ ...prev, page: next.page, pageSize: next.pageSize }));
      replaceQuery(next);
      await fetchRecordings(next);
    },
    [fetchRecordings, replaceQuery],
  );

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
      await refreshCurrentPage();
    } catch (error) {
      setSnackbar({
        open: true,
        message: (error as Error).message,
        severity: "error",
      });
    }
  };

  const handleUpdateRecording = async () => {
    if (!editingRecording) return;

    try {
      const response = await fetch(`/api/recordings/${editingRecording.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          startTime: formData.startTime,
          duration: formData.duration,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update recording");
      }

      setEditingRecording(null);
      setSnackbar({
        open: true,
        message: "Recording updated successfully!",
        severity: "success",
      });
      await refreshCurrentPage();
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
      await refreshCurrentPage();
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
      await refreshCurrentPage();
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
      await refreshCurrentPage();
    } catch (error) {
      setSnackbar({
        open: true,
        message: (error as Error).message,
        severity: "error",
      });
    }
  };

  const handleIgnoreLiveStatus = async (recording: RecordingWithStatus) => {
    try {
      const action = recording.isIgnoringLiveStatus ? "enableLiveCheck" : "disableLiveCheck";
      const response = await fetch(`/api/recordings/${recording.id}?action=${action}`, {
        method: "POST",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update live status setting");
      }
      setSnackbar({
        open: true,
        message: recording.isIgnoringLiveStatus
          ? "Now respecting live status for this recording"
          : "Now ignoring live status for this recording",
        severity: "success",
      });
      await refreshCurrentPage();
    } catch (error) {
      setSnackbar({
        open: true,
        message: (error as Error).message,
        severity: "error",
      });
    }
  };

  const handleEditClick = (recording: RecordingWithStatus) => {
    setEditingRecording(recording);
    setFormData({
      name: recording.name,
      rtspUrl: recording.rtspUrl,
      startTime: recording.startTime,
      duration: recording.duration,
    });
  };

  const handlePreviewClick = (recording: RecordingWithStatus) => {
    setPreviewRecording(recording);
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
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
          <IconButton onClick={refreshCurrentPage} disabled={loading || isManualRefreshing}>
            {isManualRefreshing ? <CircularProgress size={20} /> : <RefreshIcon />}
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ display: "flex", gap: 1, mb: 3, flexWrap: "wrap" }}>
        {FILTERS.map((status) =>
          filterStatus === status ? (
            <CustomChip
              key={status}
              label={status.charAt(0).toUpperCase() + status.slice(1)}
              color={STATUS_COLORS[status as Exclude<RecordingFilterStatus, "all">] || undefined}
              variant="filled"
            />
          ) : (
            <Chip
              key={status}
              label={status.charAt(0).toUpperCase() + status.slice(1)}
              onClick={() => applyQueryState({ page: 1, pageSize: pagination.pageSize, status })}
              variant="outlined"
            />
          ),
        )}
      </Box>

      <Paper sx={{ p: 3 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 2,
          }}>
          <Typography variant="h6" sx={{ fontWeight: "bold" }}>
            All Recordings ({pagination.total})
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
                <TableCell sx={{ width: { xs: "auto", md: "30%" } }}>Name</TableCell>
                <TableCell sx={{ width: { xs: "auto", md: "10%" } }}>RTSP URL</TableCell>
                <TableCell sx={{ width: { xs: "auto", md: "10%" } }}>Start Time</TableCell>
                <TableCell sx={{ width: { xs: "auto", md: "5%" } }}>Duration</TableCell>
                <TableCell sx={{ width: { xs: "auto", md: "40%" } }}>Status</TableCell>
                <TableCell sx={{ width: { xs: "auto", md: "15%" } }}>Ended At</TableCell>
                <TableCell sx={{ width: { xs: "auto", md: "20%" }, minWidth: 0 }}>Output</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center">
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : recordings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center">
                    No recordings found.
                  </TableCell>
                </TableRow>
              ) : (
                recordings.map((recording) => (
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
                            maxWidth: 200,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}>
                          {recording.rtspUrl}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell>{formatDate(recording.startTime)}</TableCell>
                    <TableCell>
                      <Tooltip
                        title={`${formatDuration(recording.duration)} scheduled, ${formatDuration(getActualDuration(recording))} actual`}>
                        <span>{formatDuration(getActualDuration(recording))}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" alignItems="center">
                        <StatusDisplay recording={recording} />
                      </Stack>
                    </TableCell>
                    <TableCell>
                      {recording.endedAt ? (
                        <Tooltip title={recording.endedAt}>
                          <Typography variant="caption">{formatDate(recording.endedAt)}</Typography>
                        </Tooltip>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          -
                        </Typography>
                      )}
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
                                maxWidth: "30rem",
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
                            <IconButton color="info" size="small" onClick={() => handlePreviewClick(recording)}>
                              <PreviewIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="View Logs">
                          <IconButton color="inherit" size="small" onClick={() => setLogsRecording(recording)}>
                            <ArticleIcon />
                          </IconButton>
                        </Tooltip>

                        {(recording.status === "recording" || recording.status === "retrying") && (
                          <Tooltip title="Stop">
                            <IconButton color="error" size="small" onClick={() => handleStopRecording(recording.id)}>
                              <StopIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        {recording.status !== "failed" &&
                          recording.status !== "cancelled" &&
                          recording.status !== "completed" &&
                          (recording.isIgnoringLiveStatus ? (
                            <Tooltip title="Enable live status check">
                              <IconButton
                                color="success"
                                size="small"
                                onClick={() => handleIgnoreLiveStatus(recording)}>
                                <SensorsIcon />
                              </IconButton>
                            </Tooltip>
                          ) : (
                            <Tooltip title="Ignore live status check">
                              <IconButton
                                color="warning"
                                size="small"
                                onClick={() => handleIgnoreLiveStatus(recording)}>
                                <SensorsOffIcon />
                              </IconButton>
                            </Tooltip>
                          ))}
                        {recording.status === "scheduled" && (
                          <>
                            <Tooltip title="Start Now">
                              <IconButton
                                color="warning"
                                size="small"
                                onClick={() => handleStartRecording(recording.id)}>
                                <PlayArrowIcon />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Edit">
                              <IconButton color="primary" size="small" onClick={() => handleEditClick(recording)}>
                                <EditIcon />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                        {recording.status === "completed" && recording.outputPath && (
                          <>
                            <Tooltip title="Watch">
                              <IconButton
                                color="success"
                                size="small"
                                component="a"
                                href={`/viewer?recordingId=${recording.id}`}>
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
                          <IconButton color="error" size="small" onClick={() => handleDeleteRecording(recording.id)}>
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

        <TablePagination
          component="div"
          count={pagination.total}
          page={Math.max(0, pagination.page - 1)}
          rowsPerPage={pagination.pageSize}
          onPageChange={(_event, nextPageIndex) =>
            applyQueryState({ page: nextPageIndex + 1, pageSize: pagination.pageSize, status: filterStatus })
          }
          onRowsPerPageChange={(event) =>
            applyQueryState({ page: 1, pageSize: Number.parseInt(event.target.value, 10), status: filterStatus })
          }
          rowsPerPageOptions={[5, 10, 25, 50]}
        />
      </Paper>

      <RecordingDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleCreateRecording}
        formData={formData}
        onFormChange={setFormData}
        title="Schedule New Recording"
        submitLabel="Schedule Recording"
      />

      <RecordingDialog
        open={!!editingRecording}
        onClose={() => setEditingRecording(null)}
        onSubmit={handleUpdateRecording}
        formData={formData}
        onFormChange={setFormData}
        title="Edit Recording"
        submitLabel="Update Recording"
      />

      <RecordingPreviewDialog
        open={!!previewRecording}
        onCloseAction={() => setPreviewRecording(null)}
        recording={previewRecording}
      />

      <RecordingLogsDialog
        open={!!logsRecording}
        onCloseAction={() => setLogsRecording(null)}
        recording={logsRecording}
      />

      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </LocalizationProvider>
  );
}

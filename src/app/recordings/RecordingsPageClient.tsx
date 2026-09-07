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
  TablePagination,
  Tooltip,
  Typography,
} from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import AddIcon from "@mui/icons-material/Add";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  CreateRecordingDto,
  RecordingFilterStatus,
  RecordingPaginationMeta,
  RecordingWithStatus,
} from "@/types/recording";
import RecordingDialog from "@/components/dialogs/RecordingDialog";
import RecordingLogsDialog from "@/components/dialogs/RecordingLogsDialog";
import RecordingGapsDialog from "@/components/dialogs/RecordingGapsDialog";
import RecordingPreviewDialog from "@/components/dialogs/RecordingPreviewDialog";
import CustomChip from "@/components/CustomChip";
import { STATUS_COLORS } from "@/theme";
import RecordingsTable from "@/components/recordings/RecordingsTable";

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
};

type RecordingDialogState =
  | {
      mode: "create";
    }
  | {
      mode: "edit";
      recording: RecordingWithStatus;
    };

export default function RecordingsPageClient({
  initialRecordings,
  initialPagination,
  initialStatus,
}: Readonly<Props>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [recordings, setRecordings] = useState<RecordingWithStatus[]>(initialRecordings);
  const [pagination, setPagination] = useState<RecordingPaginationMeta>(initialPagination);
  const [filterStatus, setFilterStatus] = useState<RecordingFilterStatus>(initialStatus);
  const [loading, setLoading] = useState(false);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [recordingDialogState, setRecordingDialogState] = useState<RecordingDialogState | null>(null);
  const [previewRecording, setPreviewRecording] = useState<RecordingWithStatus | null>(null);
  const [logsRecording, setLogsRecording] = useState<RecordingWithStatus | null>(null);
  const [gapsRecording, setGapsRecording] = useState<RecordingWithStatus | null>(null);
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
    ignoreDuration: false,
  });

  const isEditDialog = recordingDialogState?.mode === "edit";

  const replaceQuery = useCallback(
    (next: { page: number; pageSize: number; status: RecordingFilterStatus }) => {
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

  const closeRecordingDialog = useCallback(() => {
    setRecordingDialogState(null);
  }, []);

  const openCreateDialog = useCallback(() => {
    setFormData({
      name: "",
      rtspUrl: "",
      startTime: new Date().toISOString(),
      duration: 3600,
      ignoreDuration: false,
    });
    setRecordingDialogState({ mode: "create" });
  }, []);

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

      closeRecordingDialog();
      setFormData({
        name: "",
        rtspUrl: "",
        startTime: new Date().toISOString(),
        duration: 3600,
        ignoreDuration: false,
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
    if (recordingDialogState?.mode !== "edit") return;

    const editingRecordingId = recordingDialogState.recording.id;

    try {
      const response = await fetch(`/api/recordings/${editingRecordingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          rtspUrl: formData.rtspUrl,
          startTime: formData.startTime,
          duration: formData.duration,
          ignoreDuration: formData.ignoreDuration,
          executionInstanceId: formData.executionInstanceId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update recording");
      }

      closeRecordingDialog();
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
    setFormData({
      name: recording.name,
      rtspUrl: recording.rtspUrl,
      startTime: recording.startTime,
      duration: recording.duration,
      ignoreDuration: recording.ignoreDuration || false,
      executionInstanceId: recording.executionInstanceId,
    });
    setRecordingDialogState({ mode: "edit", recording });
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
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateDialog}>
            New Recording
          </Button>
        </Box>

        <RecordingsTable
          recordings={recordings}
          loading={loading}
          variant="full"
          emptyMessage="No recordings found."
          onEdit={handleEditClick}
          onStart={handleStartRecording}
          onStop={handleStopRecording}
          onDelete={handleDeleteRecording}
          onViewLogs={setLogsRecording}
          onViewGaps={setGapsRecording}
          onPreview={handlePreviewClick}
          onIgnoreLiveStatus={handleIgnoreLiveStatus}
        />

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
        open={!!recordingDialogState}
        onClose={closeRecordingDialog}
        onSubmit={isEditDialog ? handleUpdateRecording : handleCreateRecording}
        formData={formData}
        onFormChange={setFormData}
        title={isEditDialog ? "Edit Recording" : "Schedule New Recording"}
        submitLabel={isEditDialog ? "Update Recording" : "Schedule Recording"}
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

      <RecordingGapsDialog
        open={!!gapsRecording}
        onCloseAction={() => setGapsRecording(null)}
        recording={gapsRecording}
      />

      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </LocalizationProvider>
  );
}

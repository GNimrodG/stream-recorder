"use client";

import {
  Box,
  CircularProgress,
  IconButton,
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
import { useRouter } from "next/navigation";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import DeleteIcon from "@mui/icons-material/Delete";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import DownloadIcon from "@mui/icons-material/Download";
import EditIcon from "@mui/icons-material/Edit";
import PreviewIcon from "@mui/icons-material/Visibility";
import ArticleIcon from "@mui/icons-material/Article";
import TimelineIcon from "@mui/icons-material/Timeline";
import FolderIcon from "@mui/icons-material/Folder";
import SensorsIcon from "@mui/icons-material/Sensors";
import SensorsOffIcon from "@mui/icons-material/SensorsOff";
import { RecordingWithStatus } from "@/types/recording";
import { formatDate } from "@/utils";
import StatusDisplay from "@/components/StatusDisplay";
import DurationDisplay from "@/components/DurationDisplay";

export type RecordingsTableVariant = "compact" | "full";

type RecordingsTableProps = {
  recordings: RecordingWithStatus[];
  loading?: boolean;
  /** Only show the loading spinner when there are no recordings to display yet, keeping stale rows visible during background refreshes. */
  spinnerOnlyWhenEmpty?: boolean;
  variant?: RecordingsTableVariant;
  emptyMessage?: string;
  onEdit: (recording: RecordingWithStatus) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onDelete: (id: string) => void;
  onViewLogs: (recording: RecordingWithStatus) => void;
  onViewGaps: (recording: RecordingWithStatus) => void;
  onPreview?: (recording: RecordingWithStatus) => void;
  onIgnoreLiveStatus?: (recording: RecordingWithStatus) => void;
};

export default function RecordingsTable({
  recordings,
  loading = false,
  spinnerOnlyWhenEmpty = false,
  variant = "full",
  emptyMessage = "No recordings found.",
  onEdit,
  onStart,
  onStop,
  onDelete,
  onViewLogs,
  onViewGaps,
  onPreview,
  onIgnoreLiveStatus,
}: Readonly<RecordingsTableProps>) {
  const router = useRouter();
  const isCompact = variant === "compact";
  const columnCount = isCompact ? 6 : 8;
  const showSpinner = spinnerOnlyWhenEmpty ? !recordings.length && loading : loading;

  const outputActions = (recording: RecordingWithStatus) => (
    <>
      <Tooltip title="Watch">
        <IconButton color="success" size="small" component="a" href={`/viewer?recordingId=${recording.id}`}>
          <PlayCircleIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title="Edit Video">
        <IconButton color="secondary" size="small" onClick={() => router.push(`/editor/${recording.id}`)}>
          <EditIcon />
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
  );

  const commonActions = (recording: RecordingWithStatus) => (
    <>
      <Tooltip title="View Logs">
        <IconButton color="inherit" size="small" onClick={() => onViewLogs(recording)}>
          <ArticleIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title="Connection timeline">
        <IconButton color="inherit" size="small" onClick={() => onViewGaps(recording)}>
          <TimelineIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title="Delete">
        <IconButton color="error" size={isCompact ? "medium" : "small"} onClick={() => onDelete(recording.id)}>
          <DeleteIcon />
        </IconButton>
      </Tooltip>
    </>
  );

  return (
    <TableContainer>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: { xs: "auto", md: isCompact ? "20%" : "30%" } }}>Name</TableCell>
            <TableCell sx={{ width: { xs: "auto", md: isCompact ? "5%" : "10%" } }}>Stream URL</TableCell>
            <TableCell sx={{ width: { xs: "auto", md: "10%" } }}>Start Time</TableCell>
            <TableCell sx={{ width: { xs: "auto", md: isCompact ? "10%" : "5%" } }}>Duration</TableCell>
            <TableCell sx={{ width: { xs: "auto", md: isCompact ? "20%" : "40%" } }}>Status</TableCell>
            {!isCompact && <TableCell sx={{ width: { xs: "auto", md: "15%" } }}>Ended At</TableCell>}
            {!isCompact && <TableCell sx={{ width: { xs: "auto", md: "20%" }, minWidth: 0 }}>Output</TableCell>}
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {showSpinner ? (
            <TableRow>
              <TableCell colSpan={columnCount} align="center">
                <CircularProgress size={isCompact ? "2rem" : undefined} />
              </TableCell>
            </TableRow>
          ) : recordings.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columnCount} align="center">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            recordings.map((recording) => (
              <TableRow key={recording.id}>
                {/* Name */}
                <TableCell>
                  <Typography variant="body2" fontWeight={isCompact ? undefined : "medium"}>
                    {recording.name}
                  </Typography>
                  {!isCompact && (
                    <Typography variant="caption" color="text.secondary">
                      Created: {formatDate(recording.createdAt)}
                    </Typography>
                  )}
                </TableCell>
                {/* Stream URL */}
                <TableCell>
                  <Tooltip title={isCompact ? "" : recording.rtspUrl}>
                    <Typography
                      variant="body2"
                      sx={{
                        maxWidth: isCompact ? "100%" : 200,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>
                      {recording.rtspUrl}
                    </Typography>
                  </Tooltip>
                </TableCell>
                {/* Start Time */}
                <TableCell>{formatDate(recording.startTime)}</TableCell>
                {/* Duration */}
                <TableCell>
                  <DurationDisplay recording={recording} />
                </TableCell>
                {/* Status */}
                <TableCell>
                  {isCompact ? (
                    <StatusDisplay recording={recording} />
                  ) : (
                    <Stack direction="row" alignItems="center">
                      <StatusDisplay recording={recording} />
                    </Stack>
                  )}
                </TableCell>
                {/* Ended At */}
                {!isCompact && (
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
                )}
                {/* Output Path */}
                {!isCompact && (
                  <TableCell>
                    {recording.outputPath ? (
                      <Tooltip title={recording.outputPath}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
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
                )}
                {/* Actions */}
                <TableCell align="right">
                  {isCompact ? (
                    <>
                      {recording.outputPath && outputActions(recording)}
                      {recording.status === "scheduled" && (
                        <>
                          <Tooltip title="Edit">
                            <IconButton color="primary" size="small" onClick={() => onEdit(recording)}>
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Start Now">
                            <IconButton color="success" size="small" onClick={() => onStart(recording.id)}>
                              <PlayArrowIcon />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                      {(recording.status === "recording" || recording.status === "retrying") && (
                        <Tooltip title="Stop">
                          <IconButton color="error" onClick={() => onStop(recording.id)}>
                            <StopIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                      {commonActions(recording)}
                    </>
                  ) : (
                    <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 0.5 }}>
                      {recording.status === "recording" && onPreview && (
                        <Tooltip title="Preview Stream">
                          <IconButton color="info" size="small" onClick={() => onPreview(recording)}>
                            <PreviewIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                      {(recording.status === "recording" || recording.status === "retrying") && (
                        <Tooltip title="Stop">
                          <IconButton color="error" size="small" onClick={() => onStop(recording.id)}>
                            <StopIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                      {recording.status !== "failed" &&
                        recording.status !== "cancelled" &&
                        recording.status !== "completed" &&
                        onIgnoreLiveStatus &&
                        (recording.isIgnoringLiveStatus ? (
                          <Tooltip title="Enable live status check">
                            <IconButton color="success" size="small" onClick={() => onIgnoreLiveStatus(recording)}>
                              <SensorsIcon />
                            </IconButton>
                          </Tooltip>
                        ) : (
                          <Tooltip title="Ignore live status check">
                            <IconButton color="warning" size="small" onClick={() => onIgnoreLiveStatus(recording)}>
                              <SensorsOffIcon />
                            </IconButton>
                          </Tooltip>
                        ))}
                      {recording.status === "scheduled" && (
                        <>
                          <Tooltip title="Start Now">
                            <IconButton color="warning" size="small" onClick={() => onStart(recording.id)}>
                              <PlayArrowIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Edit">
                            <IconButton color="primary" size="small" onClick={() => onEdit(recording)}>
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                      {recording.outputPath && outputActions(recording)}
                      {commonActions(recording)}
                    </Box>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

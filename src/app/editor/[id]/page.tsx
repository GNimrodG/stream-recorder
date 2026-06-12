"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Slider,
  Stack,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  LinearProgress,
} from "@mui/material";
import { Delete as DeleteIcon, Add as AddIcon, Download as DownloadIcon, Edit as EditIcon } from "@mui/icons-material";
import { VideoMetadata, VideoSegment, CutJob, SceneChange, SceneRegion } from "@/types/editor";
import AudioWaveform from "@/components/editor/AudioWaveform";
import SceneDetectionPanel from "@/components/editor/SceneDetectionPanel";
import Timeline, { type HoverCursorHandle } from "@/components/editor/Timeline";
import RegionSelector from "@/components/editor/RegionSelector";

interface EditorParams {
  id: string;
}

const formatTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

export default function VideoEditorPage() {
  const params = useParams() as unknown as EditorParams;
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const waveformHoverRef = useRef<HoverCursorHandle>(null);
  const timelineHoverRef = useRef<HoverCursorHandle>(null);

  const syncHoverCursor = useCallback((time: number | null) => {
    waveformHoverRef.current?.setHover(time);
    timelineHoverRef.current?.setHover(time);
  }, []);

  // State
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [segments, setSegments] = useState<VideoSegment[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [viewStart, setViewStart] = useState(0);
  const [scenes, setScenes] = useState<SceneChange[]>([]);
  const [sceneRegion, setSceneRegion] = useState<SceneRegion | null>(null);
  const [isSelectingRegion, setIsSelectingRegion] = useState(false);
  const [cutJob, setCutJob] = useState<CutJob | null>(null);
  const [processing, setProcessing] = useState(false);
  const [playerDuration, setPlayerDuration] = useState<number | null>(null);
  const [editSegmentId, setEditSegmentId] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editStart, setEditStart] = useState(0);
  const [editEnd, setEditEnd] = useState(0);

  // Load video metadata
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/recordings/${params.id}/edit/metadata`);
        if (!res.ok) throw new Error("Failed to load video metadata");
        const data = await res.json();
        setMetadata(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    loadMetadata();
  }, [params.id]);

  // Poll cut job status
  useEffect(() => {
    if (!cutJob?.id) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/recordings/${params.id}/edit/jobs/${cutJob.id}`);
        if (!res.ok) return;
        const data = await res.json();
        setCutJob(data);

        if (data.status === "completed" || data.status === "failed") {
          setProcessing(false);
          clearInterval(interval);
        }
      } catch (err) {
        console.error("Error polling job status:", err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [cutJob?.id, params.id]);

  // Handle video time update
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;

    const duration = videoRef.current.duration;
    if (Number.isFinite(duration) && duration > 0) {
      if (metadata?.duration && duration < metadata.duration * 0.1) {
        setPlayerDuration(metadata.duration);
        return;
      }

      setPlayerDuration(duration);
    }
  };

  const handleSeek = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
    setCurrentTime(time);
  };

  // Add segment
  const addSegment = () => {
    const newSegment: VideoSegment = {
      id: `segment-${Date.now()}`,
      startTime: Math.max(0, currentTime - 5),
      endTime: Math.min(metadata?.duration || currentTime + 5, currentTime + 5),
      enabled: true,
    };
    setSegments([...segments, newSegment].sort((a, b) => a.startTime - b.startTime));
  };

  // Delete segment
  const deleteSegment = (id: string) => {
    setSegments(segments.filter((s) => s.id !== id));
  };

  // Toggle segment
  const toggleSegment = (id: string) => {
    setSegments(segments.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  };

  const seekToSegmentStart = (segment: VideoSegment) => {
    handleSeek(segment.startTime);
  };

  const seekToSegmentEnd = (segment: VideoSegment) => {
    handleSeek(segment.endTime);
  };

  const setSegmentStartToCurrent = (segment: VideoSegment) => {
    setSegments((current) =>
      current
        .map((s) =>
          s.id === segment.id ? { ...s, startTime: Math.max(0, Math.min(currentTime, s.endTime - 0.5)) } : s,
        )
        .sort((a, b) => a.startTime - b.startTime),
    );
  };

  const setSegmentEndToCurrent = (segment: VideoSegment) => {
    setSegments((current) =>
      current
        .map((s) => (s.id === segment.id ? { ...s, endTime: Math.max(currentTime, s.startTime + 0.5) } : s))
        .sort((a, b) => a.startTime - b.startTime),
    );
  };

  const importScenesAsSegments = () => {
    if (!metadata) return;

    const sortedScenes = [...scenes]
      .map((scene) => Math.max(0, Math.min(metadata.duration, scene.timestamp)))
      .filter(
        (timestamp, index, all) => timestamp > 0 && timestamp < metadata.duration && all.indexOf(timestamp) === index,
      )
      .sort((a, b) => a - b);

    const boundaries = [0, ...sortedScenes, metadata.duration].filter(
      (value, index, all) => index === 0 || value > all[index - 1],
    );

    const nextSegments = boundaries.slice(0, -1).map((startTime, index) => ({
      id: `scene-segment-${index}`,
      startTime,
      endTime: boundaries[index + 1],
      enabled: true,
    }));

    if (nextSegments.length > 0) {
      setSegments(nextSegments);
    }
  };

  const handleRegionToggle = () => {
    if (!isSelectingRegion) {
      setSceneRegion({ x: 0, y: 0, w: 1, h: 1 });
    }
    setIsSelectingRegion((current) => !current);
  };

  const handleRegionDone = () => {
    setIsSelectingRegion(false);
  };

  // Open edit dialog
  const openEditDialog = (segment: VideoSegment) => {
    setEditSegmentId(segment.id);
    setEditStart(segment.startTime);
    setEditEnd(segment.endTime);
    setEditDialogOpen(true);
  };

  // Save segment edit
  const saveSegmentEdit = () => {
    if (editStart >= editEnd) {
      setError("Start time must be before end time");
      return;
    }

    setSegments(
      segments
        .map((s) => (s.id === editSegmentId ? { ...s, startTime: editStart, endTime: editEnd } : s))
        .sort((a, b) => a.startTime - b.startTime),
    );

    setEditDialogOpen(false);
    setEditSegmentId(null);
  };

  // Perform cut
  const performCut = async () => {
    try {
      setProcessing(true);
      setError(null);

      const enabledSegments = segments.filter((s) => s.enabled);
      if (enabledSegments.length === 0) {
        setError("At least one segment must be enabled");
        setProcessing(false);
        return;
      }

      const res = await fetch(`/api/recordings/${params.id}/edit/cut`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordingId: params.id,
          segments: enabledSegments,
          codec: "copy",
          outputFormat: "mp4",
        }),
      });

      if (!res.ok) throw new Error("Failed to start cut job");
      const data = await res.json();
      setCutJob({
        id: data.jobId,
        recordingId: params.id,
        status: "pending",
        progress: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setProcessing(false);
    }
  };

  // Download edited video
  const downloadEditedVideo = async () => {
    if (!cutJob?.outputPath) return;

    try {
      const res = await fetch(
        `/api/recordings/${params.id}/download?editedFile=${encodeURIComponent(cutJob.outputPath)}`,
      );
      if (!res.ok) throw new Error("Failed to download file");

      const blob = await res.blob();
      const url = globalThis.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = cutJob.outputPath.split("/").pop() || "edited-video.mp4";
      document.body.appendChild(a);
      a.click();
      globalThis.URL.revokeObjectURL(url);
      a.remove();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error && !cutJob) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">{error}</Alert>
        <Button onClick={() => router.back()} sx={{ mt: 2 }}>
          Go Back
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>
        Video Editor
      </Typography>

      <Stack spacing={3}>
        {/* Error Alert */}
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Video Player */}
        <Card>
          <CardContent>
            <Box sx={{ position: "relative" }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1, gap: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Video length: {formatTime(metadata?.duration ?? playerDuration ?? 0)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Current time: {formatTime(currentTime)}
                </Typography>
              </Box>
              <Box
                ref={videoRef}
                component="video"
                controls
                preload="metadata"
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                sx={{
                  width: "100%",
                  maxHeight: "500px",
                  backgroundColor: "#000",
                }}>
                <source src={`/api/recordings/${params.id}/stream`} type="video/mp4" />
                Your browser does not support the video tag.
              </Box>

              {metadata && (
                <RegionSelector
                  videoRef={videoRef}
                  region={sceneRegion}
                  isActive={isSelectingRegion}
                  onChange={setSceneRegion}
                  onDone={handleRegionDone}
                />
              )}
            </Box>
          </CardContent>
        </Card>

        {metadata && (
          <AudioWaveform
            ref={waveformHoverRef}
            recordingId={params.id}
            currentTime={currentTime}
            duration={metadata.duration}
            onSeek={handleSeek}
            zoom={zoom}
            viewStart={viewStart}
            scenes={scenes}
            onHoverChange={syncHoverCursor}
          />
        )}

        {metadata && (
          <Timeline
            ref={timelineHoverRef}
            duration={metadata.duration}
            currentTime={currentTime}
            segments={segments}
            scenes={scenes}
            onSeek={handleSeek}
            zoom={zoom}
            viewStart={viewStart}
            onZoomChange={(z) => setZoom(z)}
            onViewStartChange={(v) => setViewStart(v)}
            onAddSegment={(start, end) => {
              const startTime = typeof start === "number" ? start : currentTime;
              const endTime =
                typeof end === "number"
                  ? end
                  : Math.min(metadata.duration, startTime + Math.max(10, metadata.duration * 0.05));
              setSegments((current) =>
                [
                  ...current,
                  {
                    id: `segment-${Date.now()}`,
                    startTime,
                    endTime,
                    enabled: true,
                  },
                ].sort((a, b) => a.startTime - b.startTime),
              );
            }}
            onUpdateSegment={(segmentId, update) => {
              setSegments((current) =>
                current
                  .map((segment) => (segment.id === segmentId ? { ...segment, ...update } : segment))
                  .sort((a, b) => a.startTime - b.startTime),
              );
            }}
            onRemoveSegment={(segmentId) => {
              setSegments((current) => current.filter((segment) => segment.id !== segmentId));
            }}
            onHoverChange={syncHoverCursor}
          />
        )}

        {/* Segments Table */}
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="h6">Segments</Typography>
                <Stack direction="row" spacing={1}>
                  <Button startIcon={<AddIcon />} onClick={addSegment} disabled={processing}>
                    Add Segment
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={importScenesAsSegments}
                    disabled={processing || scenes.length === 0}>
                    Use Scene Boundaries
                  </Button>
                </Stack>
              </Box>

              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Enabled</TableCell>
                      <TableCell>Start</TableCell>
                      <TableCell>End</TableCell>
                      <TableCell>Duration</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {segments.map((segment) => (
                      <TableRow key={segment.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={segment.enabled}
                            onChange={() => toggleSegment(segment.id)}
                            disabled={processing}
                          />
                        </TableCell>
                        <TableCell>{formatTime(segment.startTime)}</TableCell>
                        <TableCell>{formatTime(segment.endTime)}</TableCell>
                        <TableCell>{formatTime(segment.endTime - segment.startTime)}</TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                            <Tooltip title="Seek to start">
                              <span>
                                <Button size="small" onClick={() => seekToSegmentStart(segment)} disabled={processing}>
                                  Start
                                </Button>
                              </span>
                            </Tooltip>
                            <Tooltip title="Seek to end">
                              <span>
                                <Button size="small" onClick={() => seekToSegmentEnd(segment)} disabled={processing}>
                                  End
                                </Button>
                              </span>
                            </Tooltip>
                            <Tooltip title="Set start to current position">
                              <span>
                                <Button
                                  size="small"
                                  onClick={() => setSegmentStartToCurrent(segment)}
                                  disabled={processing}>
                                  Set Start
                                </Button>
                              </span>
                            </Tooltip>
                            <Tooltip title="Set end to current position">
                              <span>
                                <Button
                                  size="small"
                                  onClick={() => setSegmentEndToCurrent(segment)}
                                  disabled={processing}>
                                  Set End
                                </Button>
                              </span>
                            </Tooltip>
                            <Tooltip title="Edit">
                              <span>
                                <IconButton size="small" onClick={() => openEditDialog(segment)} disabled={processing}>
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title="Delete">
                              <span>
                                <IconButton
                                  size="small"
                                  onClick={() => deleteSegment(segment.id)}
                                  disabled={processing || segments.length === 1}>
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Stack>
          </CardContent>
        </Card>

        {metadata && (
          <SceneDetectionPanel
            videoRef={videoRef}
            recordingId={params.id}
            duration={metadata.duration}
            onSeek={handleSeek}
            onScenesLoaded={setScenes}
            region={sceneRegion}
            isSelectingRegion={isSelectingRegion}
            onToggleRegionSelection={handleRegionToggle}
          />
        )}

        {/* Processing / Results */}
        {processing || cutJob ? (
          <Card>
            <CardContent>
              <Stack spacing={2}>
                {(processing || cutJob?.status === "processing") && (
                  <>
                    <Typography variant="subtitle2">Processing...</Typography>
                    <LinearProgress variant="determinate" value={cutJob?.progress || 0} />
                    <Typography variant="caption" color="textSecondary">
                      Progress: {cutJob?.progress || 0}%
                    </Typography>
                  </>
                )}

                {cutJob?.status === "completed" && (
                  <>
                    <Alert severity="success">Video cut completed successfully!</Alert>
                    <Button startIcon={<DownloadIcon />} onClick={downloadEditedVideo} variant="contained">
                      Download Edited Video
                    </Button>
                  </>
                )}

                {cutJob?.status === "failed" && (
                  <Alert severity="error">Error: {cutJob.error || "Unknown error occurred"}</Alert>
                )}
              </Stack>
            </CardContent>
          </Card>
        ) : null}

        {/* Action Buttons */}
        <Stack direction="row" spacing={2} sx={{ justifyContent: "flex-end" }}>
          <Button onClick={() => router.back()} disabled={processing}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={performCut}
            disabled={processing || segments.filter((s) => s.enabled).length === 0}>
            {processing ? "Processing..." : "Cut & Export"}
          </Button>
        </Stack>
      </Stack>

      {/* Edit Segment Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Segment</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Start Time (seconds)
              </Typography>
              <Slider
                value={editStart}
                onChange={(_, value) => {
                  if (typeof value === "number") {
                    setEditStart(value);
                  }
                }}
                min={0}
                max={metadata?.duration || 100}
                step={0.1}
              />
              <Typography variant="caption">{formatTime(editStart)}</Typography>
            </Box>

            <Box>
              <Typography variant="body2" sx={{ mb: 1 }}>
                End Time (seconds)
              </Typography>
              <Slider
                value={editEnd}
                onChange={(_, value) => {
                  if (typeof value === "number") {
                    setEditEnd(value);
                  }
                }}
                min={0}
                max={metadata?.duration || 100}
                step={0.1}
              />
              <Typography variant="caption">{formatTime(editEnd)}</Typography>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button onClick={saveSegmentEdit} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

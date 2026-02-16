"use client";

import { useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardMedia,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Paper,
  Slider,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import DownloadIcon from "@mui/icons-material/Download";
import CloseIcon from "@mui/icons-material/Close";
import LiveTvIcon from "@mui/icons-material/LiveTv";
import VideoLibraryIcon from "@mui/icons-material/VideoLibrary";
import { Recording } from "@/types/recording";
import useRecordings from "@/hooks/useRecordings";
import StatusDisplay from "@/components/StatusDisplay";
import { formatDate, formatDuration } from "@/utils";

export default function ViewerPage() {
  const { recordings, loading, fetchRecordings } = useRecordings();
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(
    null,
  );
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [liveDialogOpen, setLiveDialogOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error" | "info";
  }>({
    open: false,
    message: "",
    severity: "success",
  });

  // Video player state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  const handleWatchVideo = (recording: Recording) => {
    setSelectedRecording(recording);
    setVideoDialogOpen(true);
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleWatchLive = (recording: Recording) => {
    setSelectedRecording(recording);
    setLiveDialogOpen(true);
  };

  const handleCloseVideoDialog = () => {
    setVideoDialogOpen(false);
    setSelectedRecording(null);
    if (videoRef.current) {
      videoRef.current.pause();
    }
  };

  const handleCloseLiveDialog = () => {
    setLiveDialogOpen(false);
    setSelectedRecording(null);
  };

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleSeek = (_: Event, value: number | number[]) => {
    const time = value as number;
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleVolumeChange = (_: Event, value: number | number[]) => {
    const vol = value as number;
    setVolume(vol);
    if (videoRef.current) {
      videoRef.current.volume = vol;
    }
    setIsMuted(vol === 0);
  };

  const handleToggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      }
    }
  };

  const formatTime = (time: number) => {
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  // Filter recordings that can be viewed
  const viewableRecordings = recordings.filter((r) => {
    if (filterStatus === "all") {
      return r.status === "completed" || r.status === "recording";
    }
    return r.status === filterStatus;
  });

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
          Video Viewer
        </Typography>
        <Tooltip title="Refresh">
          <IconButton onClick={fetchRecordings} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Filter Chips */}
      <Box sx={{ display: "flex", gap: 1, mb: 3, flexWrap: "wrap" }}>
        {["all", "recording", "completed"].map((status) => (
          <Chip
            key={status}
            label={
              status === "all"
                ? "All Viewable"
                : status.charAt(0).toUpperCase() + status.slice(1)
            }
            onClick={() => setFilterStatus(status)}
            color={filterStatus === status ? "primary" : "default"}
            variant={filterStatus === status ? "filled" : "outlined"}
            icon={
              status === "recording" ? (
                <FiberManualRecordIcon />
              ) : status === "completed" ? (
                <CheckCircleIcon />
              ) : undefined
            }
          />
        ))}
      </Box>

      {/* Recordings Grid */}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress />
        </Box>
      ) : viewableRecordings.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: "center" }}>
          <VideoLibraryIcon
            sx={{ fontSize: 64, color: "text.secondary", mb: 2 }}
          />
          <Typography variant="h6" color="text.secondary">
            No viewable recordings found
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Complete recordings or active streams will appear here
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {viewableRecordings.map((recording) => (
            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={recording.id}>
              <Card
                sx={{
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                }}>
                <CardMedia
                  sx={{
                    height: 140,
                    bgcolor: "grey.900",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                  }}>
                  {recording.status === "recording" ? (
                    <>
                      <Box
                        sx={{
                          position: "absolute",
                          top: 8,
                          right: 8,
                          bgcolor: "error.main",
                          color: "white",
                          px: 1,
                          py: 0.5,
                          borderRadius: 1,
                          fontSize: 12,
                          fontWeight: "bold",
                          display: "flex",
                          alignItems: "center",
                          gap: 0.5,
                          animation: "pulse 1s infinite",
                          "@keyframes pulse": {
                            "0%, 100%": { opacity: 1 },
                            "50%": { opacity: 0.5 },
                          },
                        }}>
                        <FiberManualRecordIcon sx={{ fontSize: 12 }} /> LIVE
                      </Box>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/recordings/${recording.id}/preview?raw=true`}
                        alt={recording.name}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "contain",
                        }}
                      />
                    </>
                  ) : (
                    <>
                      <PlayArrowIcon sx={{ fontSize: 48, color: "grey.500" }} />
                      <Box
                        sx={{
                          position: "absolute",
                          bottom: 8,
                          right: 8,
                          bgcolor: "rgba(0,0,0,0.7)",
                          color: "white",
                          px: 1,
                          py: 0.5,
                          borderRadius: 1,
                          fontSize: 12,
                        }}>
                        {formatDuration(recording.duration)}
                      </Box>
                    </>
                  )}
                </CardMedia>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Typography variant="subtitle1" fontWeight="medium" noWrap>
                    {recording.name}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block">
                    {formatDate(recording.startTime)}
                  </Typography>

                  <StatusDisplay status={recording.status} />
                </CardContent>
                <CardActions>
                  {recording.status === "completed" && (
                    <>
                      <Button
                        size="small"
                        startIcon={<PlayArrowIcon />}
                        onClick={() => handleWatchVideo(recording)}>
                        Watch
                      </Button>
                      <IconButton
                        size="small"
                        component="a"
                        href={`/api/recordings/${recording.id}/download`}
                        download>
                        <DownloadIcon />
                      </IconButton>
                    </>
                  )}
                  {recording.status === "recording" && (
                    <Button
                      size="small"
                      color="error"
                      startIcon={<LiveTvIcon />}
                      onClick={() => handleWatchLive(recording)}>
                      View Live
                    </Button>
                  )}
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Video Player Dialog */}
      <Dialog
        open={videoDialogOpen}
        onClose={handleCloseVideoDialog}
        maxWidth="lg"
        fullWidth
        slotProps={{
          paper: {
            sx: { bgcolor: "grey.900" },
          },
        }}>
        <DialogTitle
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: "white",
          }}>
          <Typography variant="h6">{selectedRecording?.name}</Typography>
          <IconButton onClick={handleCloseVideoDialog} sx={{ color: "white" }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          {selectedRecording && (
            <Box sx={{ position: "relative", bgcolor: "black" }}>
              <video
                ref={videoRef}
                src={`/api/recordings/${selectedRecording.id}/stream`}
                style={{ width: "100%", maxHeight: "70vh" }}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
              />

              {/* Video Controls */}
              <Box sx={{ p: 2, bgcolor: "rgba(0,0,0,0.8)" }}>
                {/* Progress Bar */}
                <Slider
                  value={currentTime}
                  max={duration || 100}
                  onChange={handleSeek}
                  sx={{ color: "primary.main", mb: 1 }}
                />

                <Stack direction="row" alignItems="center" spacing={2}>
                  <IconButton onClick={handlePlayPause} sx={{ color: "white" }}>
                    {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
                  </IconButton>

                  <Typography
                    variant="body2"
                    sx={{ color: "white", minWidth: 100 }}>
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </Typography>

                  <Box sx={{ flexGrow: 1 }} />

                  <IconButton
                    onClick={handleToggleMute}
                    sx={{ color: "white" }}>
                    {isMuted ? <VolumeOffIcon /> : <VolumeUpIcon />}
                  </IconButton>

                  <Slider
                    value={isMuted ? 0 : volume}
                    max={1}
                    step={0.1}
                    onChange={handleVolumeChange}
                    sx={{ width: 100, color: "white" }}
                  />

                  <IconButton
                    onClick={handleFullscreen}
                    sx={{ color: "white" }}>
                    <FullscreenIcon />
                  </IconButton>

                  <IconButton
                    component="a"
                    href={`/api/recordings/${selectedRecording.id}/download`}
                    download
                    sx={{ color: "white" }}>
                    <DownloadIcon />
                  </IconButton>
                </Stack>
              </Box>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* Live Preview Dialog */}
      <Dialog
        open={liveDialogOpen}
        onClose={handleCloseLiveDialog}
        maxWidth="md"
        fullWidth>
        <DialogTitle
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="h6">{selectedRecording?.name}</Typography>
          </Box>
          <IconButton onClick={handleCloseLiveDialog}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {selectedRecording && (
            <Box sx={{ width: "100%", aspectRatio: "16/9", bgcolor: "black" }}>
              <iframe
                src={`/api/recordings/${selectedRecording.id}/preview`}
                style={{ width: "100%", height: "100%", border: "none" }}
                title="Live Stream Preview"
              />
            </Box>
          )}
          <Alert severity="info" sx={{ mt: 2 }}>
            Live preview shows snapshots that refresh automatically. For the
            actual recording, wait until it completes.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseLiveDialog}>Close</Button>
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
    </>
  );
}

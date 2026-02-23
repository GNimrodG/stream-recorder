"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import SaveIcon from "@mui/icons-material/Save";
import RefreshIcon from "@mui/icons-material/Refresh";
import SpeedIcon from "@mui/icons-material/Speed";
import StorageIcon from "@mui/icons-material/Storage";
import VideoSettingsIcon from "@mui/icons-material/VideoSettings";
import VideoLibraryIcon from "@mui/icons-material/VideoLibrary";
import PreviewIcon from "@mui/icons-material/Preview";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import { defaultSettings, Settings } from "@/types/settings";
import NumberField from "@/components/NumberField";

interface HardwareAccelInfo {
  nvidia: boolean;
  intel: boolean;
  amd: boolean;
  available: string[];
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [hwInfo, setHwInfo] = useState<HardwareAccelInfo | null>(null);
  const [isDocker, setIsDocker] = useState(false);
  const [envVars, setEnvVars] = useState<{
    FFMPEG_PATH: string | null;
    RECORDINGS_OUTPUT_DIR: string | null;
  } | null>(null);
  const [storageStats, setStorageStats] = useState<{
    usedGB: number;
    maxGB: number;
    percentage: number;
    autoDeleteDays: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error" | "info";
  }>({
    open: false,
    message: "",
    severity: "success",
  });

  useEffect(() => {
    fetchSettings();
    fetchHardwareInfo();
    fetchStorageStats();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch("/api/settings");
      const data = await response.json();
      const { isDocker: dockerFlag, envVars: envVarsData, ...settingsData } = data;
      setSettings(settingsData);
      setIsDocker(dockerFlag || false);
      setEnvVars(envVarsData || null);
    } catch (error) {
      console.error("Failed to fetch settings:", error);
      setSnackbar({
        open: true,
        message: "Failed to load settings",
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchHardwareInfo = async () => {
    try {
      const response = await fetch("/api/settings?hwinfo=true");
      const data = await response.json();
      setHwInfo(data);
    } catch (error) {
      console.error("Failed to fetch hardware info:", error);
    }
  };

  const fetchStorageStats = async () => {
    try {
      const response = await fetch("/api/storage");
      const data = await response.json();
      setStorageStats(data);
    } catch (error) {
      console.error("Failed to fetch storage stats:", error);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        throw new Error("Failed to save settings");
      }

      setHasChanges(false);
      setSnackbar({
        open: true,
        message: "Settings saved successfully!",
        severity: "success",
      });
    } catch (error) {
      setSnackbar({
        open: true,
        message: (error as Error).message,
        severity: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleManualCleanup = async () => {
    setCleaningUp(true);
    try {
      const response = await fetch("/api/storage", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to run cleanup");
      }

      const result = await response.json();
      setSnackbar({
        open: true,
        message: `Cleanup complete! Deleted ${result.deletedOld} old recordings, ${result.deletedForSpace} for space. Current storage: ${result.currentStorageGB.toFixed(2)} GB`,
        severity: "success",
      });

      // Refresh storage stats
      await fetchStorageStats();
    } catch (error) {
      setSnackbar({
        open: true,
        message: (error as Error).message,
        severity: "error",
      });
    } finally {
      setCleaningUp(false);
    }
  };

  const handleResetToDefaults = () => {
    if (confirm("Are you sure you want to reset all settings to defaults?")) {
      setSettings(defaultSettings);
      setHasChanges(true);
    }
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "50vh",
        }}>
        <CircularProgress />
      </Box>
    );
  }

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
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Typography variant="h4" fontWeight="bold">
            Settings
          </Typography>
          {hasChanges && <Chip label="Unsaved Changes" color="warning" size="small" />}
        </Box>
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
          onClick={handleSaveSettings}
          disabled={saving || !hasChanges}>
          Save Settings
        </Button>
      </Box>

      <Grid container spacing={3}>
        {/* Hardware Acceleration */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardHeader
              avatar={<SpeedIcon color="primary" />}
              title="Hardware Acceleration"
              subheader="Configure GPU encoding for better performance"
            />
            <CardContent>
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Detected Hardware:
                </Typography>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                  <Chip
                    icon={hwInfo?.nvidia ? <CheckCircleIcon /> : <CancelIcon />}
                    label="NVIDIA (NVENC)"
                    color={hwInfo?.nvidia ? "success" : "default"}
                    variant={hwInfo?.nvidia ? "filled" : "outlined"}
                    size="small"
                  />
                  <Chip
                    icon={hwInfo?.intel ? <CheckCircleIcon /> : <CancelIcon />}
                    label="Intel (QSV)"
                    color={hwInfo?.intel ? "success" : "default"}
                    variant={hwInfo?.intel ? "filled" : "outlined"}
                    size="small"
                  />
                  <Chip
                    icon={hwInfo?.amd ? <CheckCircleIcon /> : <CancelIcon />}
                    label="AMD (AMF)"
                    color={hwInfo?.amd ? "success" : "default"}
                    variant={hwInfo?.amd ? "filled" : "outlined"}
                    size="small"
                  />
                  <Tooltip title="Refresh hardware detection">
                    <IconButton size="small" onClick={fetchHardwareInfo}>
                      <RefreshIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>

              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Hardware Acceleration</InputLabel>
                <Select
                  value={settings.hardwareAcceleration}
                  label="Hardware Acceleration"
                  onChange={(e) =>
                    handleChange("hardwareAcceleration", e.target.value as Settings["hardwareAcceleration"])
                  }>
                  <MenuItem value="auto">Auto Detect</MenuItem>
                  <MenuItem value="nvidia" disabled={!hwInfo?.nvidia}>
                    NVIDIA (NVENC/CUDA)
                  </MenuItem>
                  <MenuItem value="intel" disabled={!hwInfo?.intel}>
                    Intel (Quick Sync)
                  </MenuItem>
                  <MenuItem value="amd" disabled={!hwInfo?.amd}>
                    AMD (AMF)
                  </MenuItem>
                  <MenuItem value="none">Disabled (CPU only)</MenuItem>
                </Select>
              </FormControl>

              <TextField
                fullWidth
                label="FFmpeg Path"
                value={settings.ffmpegPath}
                onChange={(e) => handleChange("ffmpegPath", e.target.value)}
                disabled={isDocker}
                helperText={
                  isDocker && envVars?.FFMPEG_PATH
                    ? `Using environment variable: ${envVars.FFMPEG_PATH}`
                    : isDocker
                      ? "FFmpeg path is managed by Docker container"
                      : "Leave as 'ffmpeg' if installed in PATH"
                }
              />
            </CardContent>
          </Card>
        </Grid>

        {/* Video Settings */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardHeader
              avatar={<VideoSettingsIcon color="primary" />}
              title="Video Settings"
              subheader="Configure output format and codecs"
            />
            <CardContent>
              <Grid container spacing={2}>
                <Grid size={{ xs: 6 }}>
                  <FormControl fullWidth>
                    <InputLabel>Output Format</InputLabel>
                    <Select
                      value={settings.outputFormat}
                      label="Output Format"
                      onChange={(e) => handleChange("outputFormat", e.target.value as Settings["outputFormat"])}>
                      <MenuItem value="mp4">MP4</MenuItem>
                      <MenuItem value="mkv">MKV</MenuItem>
                      <MenuItem value="avi">AVI</MenuItem>
                      <MenuItem value="ts">MPEG-TS</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <FormControl fullWidth>
                    <InputLabel>Video Codec</InputLabel>
                    <Select
                      value={settings.videoCodec}
                      label="Video Codec"
                      onChange={(e) => handleChange("videoCodec", e.target.value as Settings["videoCodec"])}>
                      <MenuItem value="copy">Copy (No re-encoding)</MenuItem>
                      <MenuItem value="h264">H.264</MenuItem>
                      <MenuItem value="h265">H.265 (HEVC)</MenuItem>
                      <MenuItem value="vp9">VP9</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <FormControl fullWidth>
                    <InputLabel>Audio Codec</InputLabel>
                    <Select
                      value={settings.audioCodec}
                      label="Audio Codec"
                      onChange={(e) => handleChange("audioCodec", e.target.value as Settings["audioCodec"])}>
                      <MenuItem value="copy">Copy (No re-encoding)</MenuItem>
                      <MenuItem value="aac">AAC</MenuItem>
                      <MenuItem value="mp3">MP3</MenuItem>
                      <MenuItem value="opus">Opus</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <FormControl fullWidth>
                    <InputLabel>RTSP Transport</InputLabel>
                    <Select
                      value={settings.rtspTransport}
                      label="RTSP Transport"
                      onChange={(e) => handleChange("rtspTransport", e.target.value as Settings["rtspTransport"])}>
                      <MenuItem value="tcp">TCP</MenuItem>
                      <MenuItem value="udp">UDP</MenuItem>
                      <MenuItem value="http">HTTP</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Recording Settings */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardHeader
              avatar={<VideoLibraryIcon color="primary" />}
              title="Recording Settings"
              subheader="Configure default recording behavior"
            />
            <CardContent>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12 }}>
                  <NumberField
                    fullWidth
                    label="Default Duration"
                    min={1}
                    value={settings.defaultDuration}
                    onValueChange={(v) => handleChange("defaultDuration", v ?? 3600)}
                    slotProps={{
                      input: {
                        endAdornment: <InputAdornment position="end">seconds</InputAdornment>,
                      },
                    }}
                    helperText={`${Math.floor(settings.defaultDuration / 3600)}h ${Math.floor((settings.defaultDuration % 3600) / 60)}m`}
                  />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <NumberField
                    fullWidth
                    label="Reconnect Attempts"
                    min={-1}
                    value={settings.reconnectAttempts}
                    onValueChange={(v) => handleChange("reconnectAttempts", v ?? 3)}
                    helperText="Set to -1 for infinite attempts, 0 for no reconnection"
                    slotProps={{
                      input: {
                        endAdornment: <InputAdornment position="end">seconds</InputAdornment>,
                      },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <NumberField
                    fullWidth
                    label="Reconnect Delay"
                    disabled={settings.reconnectAttempts === 0}
                    value={settings.reconnectDelay}
                    onValueChange={(v) => handleChange("reconnectDelay", v ?? 5)}
                    slotProps={{
                      input: {
                        endAdornment: <InputAdornment position="end">seconds</InputAdornment>,
                      },
                    }}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Storage Settings */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardHeader
              avatar={<StorageIcon color="primary" />}
              title="Storage Settings"
              subheader="Configure storage and cleanup"
            />
            <CardContent>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth
                    label="Output Directory"
                    value={settings.outputDirectory}
                    onChange={(e) => handleChange("outputDirectory", e.target.value)}
                    disabled={isDocker}
                    helperText={
                      isDocker && envVars?.RECORDINGS_OUTPUT_DIR
                        ? `Using environment variable: ${envVars.RECORDINGS_OUTPUT_DIR}`
                        : isDocker
                          ? "Output directory is managed by Docker volumes"
                          : undefined
                    }
                  />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <NumberField
                    fullWidth
                    label="Max Storage"
                    value={settings.maxStorageGB}
                    onValueChange={(v) => handleChange("maxStorageGB", v ?? 0)}
                    slotProps={{
                      input: {
                        endAdornment: <InputAdornment position="end">GB</InputAdornment>,
                      },
                    }}
                    helperText="Set to 0 for unlimited storage"
                  />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <NumberField
                    fullWidth
                    label="Auto Delete After"
                    value={settings.autoDeleteAfterDays}
                    onValueChange={(v) => handleChange("autoDeleteAfterDays", v ?? 0)}
                    slotProps={{
                      input: {
                        endAdornment: <InputAdornment position="end">days</InputAdornment>,
                      },
                    }}
                    helperText="Set to 0 to disable"
                  />
                </Grid>

                {/* Storage Stats Display */}
                {storageStats && (
                  <Grid size={{ xs: 12 }}>
                    <Box sx={{ mt: 2 }}>
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          mb: 1,
                        }}>
                        <Typography variant="body2" color="text.secondary">
                          Storage Used
                        </Typography>
                        <Typography variant="body2" fontWeight="medium">
                          {storageStats.usedGB.toFixed(2)} GB
                          {storageStats.maxGB > 0 && ` / ${storageStats.maxGB} GB`}
                        </Typography>
                      </Box>
                      {storageStats.maxGB > 0 && (
                        <LinearProgress
                          variant="determinate"
                          value={Math.min(storageStats.percentage, 100)}
                          color={
                            storageStats.percentage > 90
                              ? "error"
                              : storageStats.percentage > 75
                                ? "warning"
                                : "primary"
                          }
                          sx={{ height: 8, borderRadius: 1, mb: 2 }}
                        />
                      )}
                      <Button
                        fullWidth
                        variant="outlined"
                        startIcon={cleaningUp ? <CircularProgress size={20} /> : <DeleteSweepIcon />}
                        onClick={handleManualCleanup}
                        disabled={cleaningUp}
                        sx={{ mt: storageStats.maxGB > 0 ? 0 : 2 }}>
                        {cleaningUp ? "Cleaning up..." : "Run Manual Cleanup"}
                      </Button>
                    </Box>
                  </Grid>
                )}
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Preview Settings */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardHeader
              avatar={<PreviewIcon color="primary" />}
              title="Preview Settings"
              subheader="Configure live stream preview"
            />
            <CardContent>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.previewEnabled}
                    onChange={(e) => handleChange("previewEnabled", e.target.checked)}
                  />
                }
                label="Enable Live Preview"
                sx={{ mb: 2 }}
              />

              <Grid container spacing={2}>
                <Grid size={{ xs: 6 }}>
                  <FormControl fullWidth disabled={!settings.previewEnabled}>
                    <InputLabel>Preview Quality</InputLabel>
                    <Select
                      value={settings.previewQuality}
                      label="Preview Quality"
                      onChange={(e) => handleChange("previewQuality", e.target.value as Settings["previewQuality"])}>
                      <MenuItem value="low">Low (320p)</MenuItem>
                      <MenuItem value="medium">Medium (640p)</MenuItem>
                      <MenuItem value="high">High (1280p)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <NumberField
                    fullWidth
                    label="Snapshot Interval"
                    min={1}
                    value={settings.snapshotInterval}
                    onValueChange={(v) => handleChange("snapshotInterval", v ?? 5)}
                    disabled={!settings.previewEnabled}
                    slotProps={{
                      input: {
                        endAdornment: <InputAdornment position="end">seconds</InputAdornment>,
                      },
                    }}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Actions */}
        <Grid size={{ xs: 12 }}>
          <Paper
            sx={{
              p: 2,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}>
            <Button variant="outlined" color="warning" onClick={handleResetToDefaults}>
              Reset to Defaults
            </Button>
            <Box sx={{ display: "flex", gap: 2 }}>
              <Button variant="outlined" onClick={fetchSettings} disabled={loading}>
                Discard Changes
              </Button>
              <Button
                variant="contained"
                startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
                onClick={handleSaveSettings}
                disabled={saving || !hasChanges}>
                Save Settings
              </Button>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Snackbar */}
      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}

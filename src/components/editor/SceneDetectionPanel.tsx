"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  LinearProgress,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from "@mui/material";
import type { SceneChange, SceneRegion } from "@/types/editor";
import type { RefObject } from "react";
import type { SceneDetectionStreamEvent } from "@/lib/videoAnalysis";

type DetectionSource = "local" | "backend";

export type SceneDetectionPanelProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  recordingId: string;
  duration: number;
  onSeek: (time: number) => void;
  onScenesLoaded: (scenes: SceneChange[]) => void;
  region: SceneRegion | null;
  isSelectingRegion: boolean;
  onToggleRegionSelection: () => void;
};

export default function SceneDetectionPanel({
  videoRef,
  recordingId,
  duration,
  onSeek,
  onScenesLoaded,
  region,
  isSelectingRegion,
  onToggleRegionSelection,
}: Readonly<SceneDetectionPanelProps>) {
  const [scenes, setScenes] = useState<SceneChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const [speed, setSpeed] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [activeDetectionSource, setActiveDetectionSource] = useState<DetectionSource | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [selectedScene, setSelectedScene] = useState<SceneChange | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  const cancelBackendDetection = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
  }, []);

  const cancelLocalDetection = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const cancelDetection = useCallback(() => {
    cancelBackendDetection();
    cancelLocalDetection();
  }, [cancelBackendDetection, cancelLocalDetection]);

  const loadVideoFrame = (video: HTMLVideoElement, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, region: SceneRegion | null) => {
    const vw = video.videoWidth || canvas.width;
    const vh = video.videoHeight || canvas.height;
    const srcX = region ? region.x * vw : 0;
    const srcY = region ? region.y * vh : 0;
    const srcW = region ? Math.max(1, region.w * vw) : vw;
    const srcH = region ? Math.max(1, region.h * vh) : vh;
    ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  };

  const computeDiff = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
    let diff = 0;
    for (let i = 0; i < a.length; i += 4) {
      diff += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    }
    return diff / ((a.length / 4) * 3 * 255);
  };

  const sampleFrame = (video: HTMLVideoElement, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, t: number, controller: AbortController) => {
    return new Promise<{ data: Uint8ClampedArray; actualTime: number }>((resolve, reject) => {
      if (controller.signal.aborted) {
        reject(new DOMException("Local scene detection canceled", "AbortError"));
        return;
      }

      const cleanup = () => video.removeEventListener("seeked", onSeeked);
      const onSeeked = () => {
        if (controller.signal.aborted) {
          cleanup();
          reject(new DOMException("Local scene detection canceled", "AbortError"));
          return;
        }

        try {
          const data = loadVideoFrame(video, canvas, ctx, region);
          cleanup();
          resolve({ data, actualTime: video.currentTime });
        } catch (frameError) {
          cleanup();
          reject(frameError);
        }
      };

      video.addEventListener("seeked", onSeeked);
      video.currentTime = t;
    });
  };

  const refineTransition = async (
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    controller: AbortController,
    threshold: number,
    loTime: number,
    loData: Uint8ClampedArray,
    hiTime: number,
    initialScore: number,
  ) => {
    const MIN_WINDOW = 1 / 30;
    let lo = loTime;
    let ld = loData;
    let hi = hiTime;
    let bestTime = hiTime;
    let bestScore = initialScore;

    while (hi - lo > MIN_WINDOW) {
      const mid = (lo + hi) / 2;
      const { data: md, actualTime } = await sampleFrame(video, canvas, ctx, mid, controller);
      if (actualTime <= lo + 0.001) break;

      const midScore = computeDiff(ld, md);
      if (midScore > threshold) {
        hi = actualTime;
        bestTime = actualTime;
        bestScore = midScore;
      } else {
        lo = actualTime;
        ld = md;
      }
    }

    return { timestamp: bestTime, score: bestScore };
  };

  const handleBackendEvent = (event: SceneDetectionStreamEvent) => {
    if (event.type === "start") {
      setProgress(event.progress ?? 0);
      setFps(event.fps ?? null);
      setSpeed(event.speed ?? null);
      setStatus(event.message || "Starting server scene analysis…");
      return;
    }

    if (event.type === "progress") {
      if (typeof event.progress === "number") setProgress(event.progress);
      if (typeof event.fps === "number") setFps(event.fps);
      if (typeof event.speed === "string") setSpeed(event.speed);
      if (event.message) setStatus(event.message);
      return;
    }

    if (event.type === "scene" && event.scene) {
      const detectedScene = event.scene;
      if (!detectedScene) return;

      setScenes((current) => {
        const nextScenes = [...current, detectedScene].sort((a, b) => a.timestamp - b.timestamp);
        onScenesLoaded(nextScenes);
        return nextScenes;
      });
      if (typeof event.progress === "number") setProgress(event.progress);
      if (typeof event.fps === "number") setFps(event.fps);
      if (typeof event.speed === "string") setSpeed(event.speed);
      if (event.message) setStatus(event.message);
      return;
    }

    if (event.type === "done") {
      const finalScenes = event.scenes || [];
      setScenes(finalScenes);
      onScenesLoaded(finalScenes);
      setProgress(100);
      if (typeof event.fps === "number") setFps(event.fps);
      if (typeof event.speed === "string") setSpeed(event.speed);
      setStatus(event.message || "Scene analysis complete");
      cancelBackendDetection();
      return;
    }

    if (event.type === "error") {
      setError(event.message || "Scene detection failed");
      cancelBackendDetection();
    }
  };

  const runBackendDetection = async () => {
    cancelDetection();
    setLoading(true);
    setError(null);
    setProgress(0);
    setFps(null);
    setSpeed(null);
    setStatus("Starting server scene analysis…");
    setScenes([]);
    onScenesLoaded([]);
    setActiveDetectionSource("backend");

    try {
      const searchParams = new URLSearchParams();
      searchParams.set("threshold", "0.3");
      if (region) {
        searchParams.set("region", JSON.stringify(region));
      }

      const eventSource = new EventSource(`/api/recordings/${recordingId}/edit/scenes?${searchParams.toString()}`);
      sourceRef.current = eventSource;

      eventSource.addEventListener("start", (event) => {
        if (event instanceof MessageEvent) handleBackendEvent(JSON.parse(event.data) as SceneDetectionStreamEvent);
      });
      eventSource.addEventListener("progress", (event) => {
        if (event instanceof MessageEvent) handleBackendEvent(JSON.parse(event.data) as SceneDetectionStreamEvent);
      });
      eventSource.addEventListener("scene", (event) => {
        if (event instanceof MessageEvent) handleBackendEvent(JSON.parse(event.data) as SceneDetectionStreamEvent);
      });
      eventSource.addEventListener("done", (event) => {
        if (event instanceof MessageEvent) handleBackendEvent(JSON.parse(event.data) as SceneDetectionStreamEvent);
      });
      eventSource.addEventListener("error", () => {
        if (eventSource.readyState === EventSource.CLOSED) return;
        setError("Scene detection failed");
        cancelBackendDetection();
      });

      await new Promise<void>((resolve, reject) => {
        eventSource.addEventListener("done", () => resolve(), { once: true });
        eventSource.addEventListener("error", () => reject(new Error("Scene detection failed")), { once: true });
      });
    } catch (detectError) {
      setError(detectError instanceof Error ? detectError.message : "Scene detection failed");
    } finally {
      cancelBackendDetection();
      setLoading(false);
      setProgress(null);
      setFps(null);
      setSpeed(null);
      setStatus("");
      setActiveDetectionSource(null);
    }
  };

  const runLocalDetection = async () => {
    cancelDetection();
    setLoading(true);
    setError(null);
    setProgress(0);
    setFps(null);
    setSpeed(null);
    setStatus("Analyzing frames in the browser…");
    setScenes([]);
    onScenesLoaded([]);
    setActiveDetectionSource("local");

    try {
      const video = videoRef.current;
      if (!video) {
        throw new Error("Video element is not available yet");
      }

      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        throw new Error("Video metadata is still loading");
      }

      const controller = new AbortController();
      abortRef.current = controller;

      const wasPaused = video.paused;
      const originalTime = video.currentTime;
      video.pause();

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        throw new Error("Canvas 2D context is unavailable");
      }

      const maxSamples = region ? 1500 : 300;
      const sampleInterval = Math.max(1 / 30, duration / maxSamples);
      const totalSamples = Math.max(1, Math.floor(duration / sampleInterval));

      canvas.width = 160;
      canvas.height = 90;

      const detected: SceneChange[] = [];
      const throwIfAborted = () => {
        if (controller.signal.aborted) {
          throw new DOMException("Local scene detection canceled", "AbortError");
        }
      };

      let prevData: Uint8ClampedArray | null = null;
      let prevActualTime = 0;

      for (let i = 0; i < totalSamples; i++) {
        const t = i * sampleInterval;
        try {
          throwIfAborted();
          const { data, actualTime } = await sampleFrame(video, canvas, ctx, t, controller);
          if (prevData) {
            const score = computeDiff(prevData, data);
            if (score > 0.3) {
              const refined = await refineTransition(
                video,
                canvas,
                ctx,
                controller,
                0.3,
                prevActualTime,
                prevData,
                actualTime,
                score,
              );
              detected.push(refined);
            }
          }
          prevData = data;
          prevActualTime = actualTime;
          setProgress(Math.round(((i + 1) / totalSamples) * 100));
        } catch (e) {
          if ((e as Error).name === "AbortError") break;
        }
      }

      if (!controller.signal.aborted) {
        setScenes(detected);
        onScenesLoaded(detected);
        setStatus(`Found ${detected.length} scene changes`);
      }

      if (video.currentTime !== originalTime) {
        video.currentTime = originalTime;
      }

      if (!wasPaused) {
        video.play().catch(() => undefined);
      }
    } catch (detectError) {
      setError(detectError instanceof Error ? detectError.message : "Scene detection failed");
    } finally {
      cancelDetection();
      setLoading(false);
      setProgress(null);
      setFps(null);
      setSpeed(null);
      setStatus("");
      setActiveDetectionSource(null);
    }
  };

  useEffect(() => {
    setScenes([]);
    setProgress(null);
    setFps(null);
    setSpeed(null);
    setStatus("");
    cancelDetection();
    return () => {
      cancelDetection();
    };
  }, [cancelDetection, recordingId]);

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2 }}>
            <Box>
              <Typography variant="h6">Automatic Scene Detection</Typography>
              <Typography variant="body2" color="text.secondary">
                Detect likely cut points and jump to them from the timeline.
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {region ? "Region constrained detection is enabled." : "Detection uses the full frame."}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button
                variant={isSelectingRegion ? "contained" : "outlined"}
                onClick={onToggleRegionSelection}
                disabled={loading || duration <= 0}>
                {isSelectingRegion ? "Selecting Region…" : region ? "Edit Region" : "Select Region"}
              </Button>
              <Button variant={activeDetectionSource === "local" ? "contained" : "outlined"} onClick={runLocalDetection} disabled={loading || duration <= 0}>
                {loading && activeDetectionSource === "local" ? "Detecting…" : "Detect locally"}
              </Button>
              <Button variant={activeDetectionSource === "backend" ? "contained" : "outlined"} onClick={runBackendDetection} disabled={loading || duration <= 0}>
                {loading && activeDetectionSource === "backend" ? "Detecting…" : "Detect on server"}
              </Button>
              {loading && (
                <Button variant="outlined" color="inherit" onClick={cancelDetection}>
                  Cancel
                </Button>
              )}
            </Stack>
          </Box>

          {loading && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <CircularProgress size={16} />
                <Typography variant="caption" color="text.secondary">
                  {status || "Running local scene analysis…"}
                </Typography>
              </Box>
              <LinearProgress variant={typeof progress === "number" ? "determinate" : "indeterminate"} value={progress ?? 0} />
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5 }}>
                {typeof progress === "number" && (
                  <Typography variant="caption" color="text.secondary">
                    {Math.min(100, Math.max(0, progress)).toFixed(1)}% complete
                  </Typography>
                )}
                {typeof fps === "number" && (
                  <Typography variant="caption" color="text.secondary">
                    FPS: {fps.toFixed(1)}
                  </Typography>
                )}
                {speed && (
                  <Typography variant="caption" color="text.secondary">
                    Speed: {speed}
                  </Typography>
                )}
              </Box>
            </Box>
          )}

          {error && <Alert severity="error">{error}</Alert>}

          {scenes.length > 0 ? (
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {scenes.map((scene, index) => (
                <Chip
                  key={`${scene.timestamp}-${index}`}
                  label={`${formatSceneTime(scene.timestamp)} · ${(scene.score * 100).toFixed(0)}%`}
                  variant="outlined"
                  color="warning"
                  onClick={(e) => {
                    setSelectedScene(scene);
                    setAnchorEl(e.currentTarget);
                  }}
                />
              ))}

              <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={() => {
                  setAnchorEl(null);
                  setSelectedScene(null);
                }}>
                <MenuItem
                  onClick={() => {
                    if (selectedScene) onSeek(selectedScene.timestamp);
                    setAnchorEl(null);
                    setSelectedScene(null);
                  }}>
                  Seek to Scene
                </MenuItem>
              </Menu>
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {loading ? "Scanning for scene changes…" : "No scene changes detected yet."}
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function formatSceneTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

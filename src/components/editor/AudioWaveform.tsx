"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import type { AudioPeaksResponse, SceneChange } from "@/types/editor";

import type { HoverCursorHandle } from "./Timeline";

export type AudioWaveformProps = {
  recordingId: string;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  scenes?: SceneChange[];
  zoom?: number;
  viewStart?: number;
  onHoverChange?: (time: number | null) => void;
};

const AudioWaveform = forwardRef<HoverCursorHandle, AudioWaveformProps>(function AudioWaveform(
  {
    recordingId,
    currentTime,
    duration,
    onSeek,
    scenes = [],
    zoom = 1,
    viewStart = 0,
    onHoverChange,
  }: Readonly<AudioWaveformProps>,
  ref,
) {
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [channelPeaks, setChannelPeaks] = useState<number[][] | null>(null);
  const [channels, setChannels] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const waveformTrackRef = useRef<HTMLDivElement>(null);
  const hoverLineRef = useRef<HTMLDivElement>(null);
  const hoverTooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();

    const loadPeaks = async () => {
      setLoading(true);
      setError(null);
      setPeaks(null);
      setChannelPeaks(null);
      setChannels(0);

      try {
        const response = await fetch(`/api/recordings/${recordingId}/edit/peaks`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          if (response.status === 499) {
            return;
          }
          throw new Error("Failed to load waveform data");
        }

        const data = (await response.json()) as AudioPeaksResponse;
        setPeaks(data.peaks || []);
        setChannelPeaks(data.channelPeaks || null);
        setChannels(data.channels || (data.channelPeaks?.length ?? 0));
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load waveform");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    loadPeaks();

    return () => {
      controller.abort();
    };
  }, [recordingId]);

  const activePeaks = useMemo(() => peaks ?? [], [peaks]);
  const activeChannelPeaks = useMemo(() => {
    if (channelPeaks && channelPeaks.length > 0) {
      return channelPeaks;
    }

    if (activePeaks.length > 0) {
      return [activePeaks];
    }

    return [] as number[][];
  }, [activePeaks, channelPeaks]);

  const sceneMarkers = scenes
    .map((scene) => ({
      ...scene,
      left: duration > 0 ? Math.max(0, Math.min(100, (scene.timestamp / duration) * 100)) : 0,
    }))
    .filter((scene) => scene.left >= 0 && scene.left <= 100);

  const visibleDuration = duration / Math.max(1, zoom);
  const viewEnd = Math.min(duration, viewStart + visibleDuration);

  function formatTimePrecise(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return "00:00:00.0";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const frac = Math.floor((seconds - Math.floor(seconds)) * 10);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${frac}`;
  }

  const clientXToTime = (clientX: number, rect: DOMRect) => {
    if (!duration || rect.width <= 0) return 0;
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.max(0, Math.min(duration, viewStart + percent * visibleDuration));
  };

  const updateHoverOverlay = useCallback(
    (nextTime: number | null) => {
      const line = hoverLineRef.current;
      const tooltip = hoverTooltipRef.current;
      if (!line || !tooltip) return;

      if (nextTime === null || duration <= 0) {
        line.style.display = "none";
        tooltip.style.display = "none";
        return;
      }

      const leftPercent = Math.max(0, Math.min(100, ((nextTime - viewStart) / visibleDuration) * 100));
      line.style.display = "block";
      line.style.left = `${leftPercent}%`;

      tooltip.style.display = "block";
      tooltip.style.left = `${leftPercent}%`;
      tooltip.textContent = formatTimePrecise(nextTime);
    },
    [duration, viewStart, visibleDuration],
  );

  useImperativeHandle(
    ref,
    () => ({
      setHover: updateHoverOverlay,
    }),
    [updateHoverOverlay],
  );

  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
      <Box
        sx={{
          px: 2,
          py: 1,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          bgcolor: "background.paper",
        }}>
        <Typography variant="subtitle2">Audio Waveform</Typography>
        {loading ? (
          <CircularProgress size={16} />
        ) : (
          <Typography variant="caption" color="text.secondary">
            {activePeaks.length} bars{channels > 0 ? ` • ${channels} channel${channels > 1 ? "s" : ""}` : ""}
          </Typography>
        )}
      </Box>

      <Box
        sx={{
          position: "relative",
          height: 92,
          bgcolor: "grey.900",
          cursor: "pointer",
          px: 2,
          py: 1,
        }}>
        {error ? (
          <Box sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Typography variant="caption" color="error">
              {error}
            </Typography>
          </Box>
        ) : loading ? (
          <Box sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Typography variant="caption" color="text.secondary">
              Analyzing audio…
            </Typography>
          </Box>
        ) : activeChannelPeaks.length > 0 ? (
          <Box
            ref={waveformTrackRef}
            sx={{ position: "relative", height: "100%" }}
            onClick={(event: MouseEvent<HTMLDivElement>) => {
              if (!duration) return;
              const rect = waveformTrackRef.current?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
              onSeek(clientXToTime(event.clientX, rect));
            }}
            onMouseMove={(event: MouseEvent<HTMLDivElement>) => {
              if (!duration) return;
              const rect = waveformTrackRef.current?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
              const hoveredTime = clientXToTime(event.clientX, rect);
              updateHoverOverlay(hoveredTime);
              onHoverChange?.(hoveredTime);
            }}
            onMouseLeave={() => {
              updateHoverOverlay(null);
              onHoverChange?.(null);
            }}>
            <Box
              sx={{
                position: "absolute",
                left: 0,
                right: 0,
                top: "50%",
                height: "1px",
                bgcolor: "grey.700",
                opacity: 0.7,
              }}
            />

            {activeChannelPeaks.map((channel, channelIndex) => {
              const isMono = activeChannelPeaks.length === 1;
              const isBottomLane = !isMono && channelIndex === 1;
              const laneKey = isMono ? "mono-lane" : isBottomLane ? "right-lane" : "left-lane";

              return (
                <Box
                  key={laneKey}
                  sx={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: isBottomLane ? "50%" : 0,
                    height: "50%",
                  }}>
                  {channel.map((peak, index) => {
                    const time = (index / Math.max(1, channel.length - 1)) * duration;
                    if (time < viewStart || time > viewEnd) return null;
                    const leftPercent = ((time - viewStart) / visibleDuration) * 100;
                    const barHeight = Math.max(8, Math.round(peak * 100));
                    const isActive = time <= currentTime;
                    return (
                      <Box
                        key={`${laneKey}-${leftPercent.toFixed(2)}-${peak.toFixed(4)}`}
                        sx={{
                          position: "absolute",
                          left: `${leftPercent}%`,
                          transform: "translateX(-50%)",
                          bottom: isBottomLane ? undefined : 0,
                          top: isBottomLane ? 0 : undefined,
                          width: "2px",
                          height: `${Math.max(4, barHeight / 2)}%`,
                          borderRadius: 99,
                          bgcolor: isActive ? (channelIndex === 1 ? "secondary.main" : "primary.main") : "grey.600",
                          opacity: isMono ? 0.95 : 0.85,
                          transition: "background-color 120ms linear",
                        }}
                      />
                    );
                  })}
                </Box>
              );
            })}

            {sceneMarkers
              .filter((scene) => scene.timestamp >= viewStart && scene.timestamp <= viewEnd)
              .map((scene) => (
                <Box
                  key={`${scene.timestamp}-${scene.score}`}
                  sx={{
                    position: "absolute",
                    left: `${((scene.timestamp - viewStart) / visibleDuration) * 100}%`,
                    top: 0,
                    bottom: 0,
                    width: "2px",
                    bgcolor: "warning.main",
                    opacity: 0.7,
                    transform: "translateX(-50%)",
                  }}
                  title={`Scene at ${scene.timestamp.toFixed(1)}s (${Math.round(scene.score * 100)}%)`}
                />
              ))}

            <Box
              sx={{
                position: "absolute",
                left: `${((currentTime - viewStart) / visibleDuration) * 100}%`,
                top: 0,
                bottom: 0,
                width: "2px",
                bgcolor: "secondary.main",
                boxShadow: "0 0 0 1px rgba(255,255,255,0.15)",
              }}
            />

            <Box
              ref={hoverLineRef}
              sx={{
                display: "none",
                position: "absolute",
                top: "6%",
                bottom: "6%",
                width: "1px",
                bgcolor: "rgba(255,255,255,0.35)",
                transform: "translateX(-50%)",
                pointerEvents: "none",
                zIndex: 3,
              }}
            />
            <Box
              ref={hoverTooltipRef}
              sx={{
                display: "none",
                position: "absolute",
                top: -24,
                transform: "translateX(-50%)",
                pointerEvents: "none",
                zIndex: 6,
                bgcolor: "background.paper",
                color: "text.primary",
                px: 0.5,
                py: 0.25,
                borderRadius: 1,
                boxShadow: 1,
                fontSize: 11,
                minWidth: 56,
                textAlign: "center",
              }}
            />
          </Box>
        ) : (
          <Box sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Typography variant="caption" color="text.secondary">
              No audio track detected
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
});

export default AudioWaveform;

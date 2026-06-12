"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";

export type Region = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "move";

type RegionSelectorProps = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  region: Region | null;
  isActive: boolean;
  onChange: (region: Region | null) => void;
  onDone: () => void;
};

type DragState = {
  handle: Handle;
  startX: number;
  startY: number;
  startRegion: Region;
} | null;

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function getVideoContentRect(video: HTMLVideoElement) {
  const rect = video.getBoundingClientRect();
  const aspect = (video.videoWidth || rect.width) / (video.videoHeight || rect.height);
  let width = rect.width;
  let height = rect.height;

  if (rect.width / rect.height > aspect) {
    width = rect.height * aspect;
  } else {
    height = rect.width / aspect;
  }

  return {
    left: rect.left + (rect.width - width) / 2,
    top: rect.top + (rect.height - height) / 2,
    width,
    height,
  };
}

const handles: Array<{ id: Exclude<Handle, "move">; x: number; y: number; cursor: string }> = [
  { id: "nw", x: 0, y: 0, cursor: "nw-resize" },
  { id: "n", x: 0.5, y: 0, cursor: "n-resize" },
  { id: "ne", x: 1, y: 0, cursor: "ne-resize" },
  { id: "e", x: 1, y: 0.5, cursor: "e-resize" },
  { id: "se", x: 1, y: 1, cursor: "se-resize" },
  { id: "s", x: 0.5, y: 1, cursor: "s-resize" },
  { id: "sw", x: 0, y: 1, cursor: "sw-resize" },
  { id: "w", x: 0, y: 0.5, cursor: "w-resize" },
];

export default function RegionSelector({
  videoRef,
  region,
  isActive,
  onChange,
  onDone,
}: Readonly<RegionSelectorProps>) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState>(null);
  const [drawing, setDrawing] = useState<{ x: number; y: number } | null>(null);
  const [videoRect, setVideoRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  const measureRects = useCallback(() => {
    const videoElement = videoRef.current;
    const overlayElement = overlayRef.current;
    if (!videoElement || !overlayElement) {
      setVideoRect(null);
      return;
    }

    const contentRect = getVideoContentRect(videoElement);
    const overlayRect = overlayElement.getBoundingClientRect();
    setVideoRect({
      left: contentRect.left - overlayRect.left,
      top: contentRect.top - overlayRect.top,
      width: contentRect.width,
      height: contentRect.height,
    });
  }, [videoRef]);

  const regionPx =
    region && videoRect
      ? {
          left: videoRect.left + region.x * videoRect.width,
          top: videoRect.top + region.y * videoRect.height,
          width: region.w * videoRect.width,
          height: region.h * videoRect.height,
        }
      : null;

  const mouseToRegion = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      if (!videoRect) return null;
      const x = clamp((event.clientX - videoRect.left) / videoRect.width);
      const y = clamp((event.clientY - videoRect.top) / videoRect.height);
      return { x, y };
    },
    [videoRect],
  );

  const startDrag = (event: React.MouseEvent, handle: Handle) => {
    if (!region) return;
    event.stopPropagation();
    event.preventDefault();
    dragRef.current = {
      handle,
      startX: event.clientX,
      startY: event.clientY,
      startRegion: { ...region },
    };
  };

  useEffect(() => {
    const frame = globalThis.requestAnimationFrame(() => {
      measureRects();
    });
    const onResize = () => measureRects();
    globalThis.addEventListener("resize", onResize);
    globalThis.addEventListener("scroll", onResize, true);
    return () => {
      globalThis.cancelAnimationFrame(frame);
      globalThis.removeEventListener("resize", onResize);
      globalThis.removeEventListener("scroll", onResize, true);
    };
  }, [measureRects, region, isActive]);

  useEffect(() => {
    if (!drawing) return;

    const onMove = (event: MouseEvent) => {
      const coords = mouseToRegion(event);
      if (!coords) return;

      const x = Math.min(drawing.x, coords.x);
      const y = Math.min(drawing.y, coords.y);
      const w = Math.max(0.02, Math.abs(coords.x - drawing.x));
      const h = Math.max(0.02, Math.abs(coords.y - drawing.y));
      onChange({ x, y, w, h });
    };

    const onUp = () => setDrawing(null);
    globalThis.addEventListener("mousemove", onMove);
    globalThis.addEventListener("mouseup", onUp);
    return () => {
      globalThis.removeEventListener("mousemove", onMove);
      globalThis.removeEventListener("mouseup", onUp);
    };
  }, [drawing, mouseToRegion, onChange]);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!dragRef.current || !videoRect || !region) return;
      const deltaX = (event.clientX - dragRef.current.startX) / videoRect.width;
      const deltaY = (event.clientY - dragRef.current.startY) / videoRect.height;
      const minSize = 0.02;
      const start = dragRef.current.startRegion;

      const next = { ...start };
      const handle = dragRef.current.handle;

      if (handle === "move") {
        next.x = clamp(start.x + deltaX, 0, 1 - start.w);
        next.y = clamp(start.y + deltaY, 0, 1 - start.h);
      } else {
        if (handle.includes("w")) {
          const newX = clamp(start.x + deltaX, 0, start.x + start.w - minSize);
          next.w = start.x + start.w - newX;
          next.x = newX;
        }
        if (handle.includes("e")) {
          next.w = clamp(start.w + deltaX, minSize, 1 - start.x);
        }
        if (handle.includes("n")) {
          const newY = clamp(start.y + deltaY, 0, start.y + start.h - minSize);
          next.h = start.y + start.h - newY;
          next.y = newY;
        }
        if (handle.includes("s")) {
          next.h = clamp(start.h + deltaY, minSize, 1 - start.y);
        }
      }

      onChange(next);
    };

    const onUp = () => {
      dragRef.current = null;
    };

    globalThis.addEventListener("mousemove", onMove);
    globalThis.addEventListener("mouseup", onUp);
    return () => {
      globalThis.removeEventListener("mousemove", onMove);
      globalThis.removeEventListener("mouseup", onUp);
    };
  }, [onChange, region, videoRect]);

  if (!isActive || !region) return null;

  return (
    <Box
      ref={overlayRef}
      sx={{ position: "absolute", inset: 0, zIndex: 5 }}
      onMouseDown={(event) => {
        if (!isActive) return;
        if ((event.target as HTMLElement).closest("[data-region-handle]")) return;
        if ((event.target as HTMLElement).closest("[data-region-toolbar]")) return;
        const coords = mouseToRegion(event);
        if (!coords) return;
        setDrawing(coords);
        onChange(null);
      }}>
      {videoRect && regionPx && <Box sx={{ position: "absolute", inset: 0, bgcolor: "rgba(0,0,0,0.42)" }} />}

      {videoRect && regionPx && (
        <Box
          sx={{
            position: "absolute",
            left: regionPx.left,
            top: regionPx.top,
            width: regionPx.width,
            height: regionPx.height,
            border: "2px solid",
            borderColor: "warning.main",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.08)",
            cursor: "move",
          }}>
          <Box
            sx={{ position: "absolute", inset: 0, cursor: "move" }}
            data-region-handle
            onMouseDown={(event) => startDrag(event, "move")}
          />
          {handles.map((handle) => (
            <Box
              key={handle.id}
              data-region-handle
              onMouseDown={(event) => startDrag(event, handle.id)}
              sx={{
                position: "absolute",
                left: `${handle.x * 100}%`,
                top: `${handle.y * 100}%`,
                width: 10,
                height: 10,
                borderRadius: "2px",
                bgcolor: "warning.main",
                transform: "translate(-50%, -50%)",
                cursor: handle.cursor,
                zIndex: 2,
              }}
            />
          ))}
          <Stack direction="row" spacing={1} sx={{ position: "absolute", top: -34, left: 0 }}>
            <Typography
              variant="caption"
              sx={{
                bgcolor: "background.paper",
                px: 1,
                py: 0.5,
                borderRadius: 1,
                border: "1px solid",
                borderColor: "divider",
              }}>
              {(region.w * 100).toFixed(0)}% × {(region.h * 100).toFixed(0)}%
            </Typography>
          </Stack>
        </Box>
      )}

      {isActive && (
        <Box
          data-region-toolbar
          sx={{
            position: "absolute",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 1,
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 999,
            px: 1.5,
            py: 0.75,
            zIndex: 6,
          }}>
          <Typography variant="caption" color="text.secondary">
            Click and drag the video to select a region
          </Typography>
          {region && (
            <Button size="small" onClick={() => onChange(null)}>
              Clear
            </Button>
          )}
          <Button size="small" variant="contained" onClick={onDone}>
            Done
          </Button>
        </Box>
      )}
    </Box>
  );
}

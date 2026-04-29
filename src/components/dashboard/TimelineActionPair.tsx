"use client";

import { ReactNode } from "react";
import { Box, Button } from "@mui/material";

type TimelineActionPairProps = {
  buttonLabel: string;
  buttonColor: "error" | "info";
  onClickAction: () => void;
  children: ReactNode;
};

export default function TimelineActionPair({
  buttonLabel,
  buttonColor,
  onClickAction,
  children,
}: TimelineActionPairProps) {
  return (
    <Box
      sx={{
        p: 0,
        display: "inline-flex",
        alignItems: "center",
      }}>
      <Button
        color={buttonColor}
        variant="outlined"
        sx={{
          borderRadius: 1,
          borderTopRightRadius: 0,
          borderBottomRightRadius: 0,
          height: "100%",
        }}
        onClick={onClickAction}>
        {buttonLabel}
      </Button>
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 1,
          px: 1.25,
          py: 0.75,
          borderRadius: 1,
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
          bgcolor: "action.hover",
          border: "1px solid",
          borderColor: "divider",
          width: "fit-content",
          maxWidth: "100%",
          height: "100%",
        }}>
        {children}
      </Box>
    </Box>
  );
}

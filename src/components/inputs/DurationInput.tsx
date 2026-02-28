import { Box, Button, Typography } from "@mui/material";
import { formatDuration } from "@/utils";
import { FC } from "react";
import NumberField from "@/components/inputs/NumberField";

export interface DurationInputProps {
  value: number; // Duration in seconds
  onChange: (value: number) => void;
}

const DurationInput: FC<DurationInputProps> = ({ value, onChange }) => {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Duration: {formatDuration(value)}
      </Typography>
      <Box sx={{ display: "flex", gap: 1, mb: 1, flexWrap: "wrap" }}>
        {[
          { label: "5 min", value: 300 },
          { label: "15 min", value: 900 },
          { label: "30 min", value: 1800 },
          { label: "1 hour", value: 3600 },
          { label: "2 hours", value: 7200 },
          { label: "4 hours", value: 14400 },
          { label: "8 hours", value: 28800 },
          { label: "24 hours", value: 86400 },
        ].map((preset) => (
          <Button
            key={preset.label}
            size="small"
            variant={value === preset.value ? "contained" : "outlined"}
            onClick={() => onChange(preset.value)}>
            {preset.label}
          </Button>
        ))}
      </Box>
      <Box sx={{ display: "flex", gap: 1 }}>
        <NumberField
          label="Hours"
          value={Math.floor(value / 3600)}
          onValueChange={(v) => {
            const hours = v ?? 0;
            const remainingSeconds = value % 3600;
            onChange(hours * 3600 + remainingSeconds);
          }}
          sx={{ flex: 1 }}
          min={0}
        />
        <NumberField
          label="Minutes"
          value={Math.floor((value % 3600) / 60)}
          onValueChange={(v) => {
            const minutes = v ?? 0;
            const hours = Math.floor(value / 3600);
            const seconds = value % 60;
            onChange(hours * 3600 + minutes * 60 + seconds);
          }}
          sx={{ flex: 1 }}
          min={0}
          max={59}
        />
        <NumberField
          label="Seconds"
          value={value % 60}
          onValueChange={(v) => {
            const seconds = v ?? 0;
            const hours = Math.floor(value / 3600);
            const minutes = Math.floor((value % 3600) / 60);
            onChange(hours * 3600 + minutes * 60 + seconds);
          }}
          sx={{ flex: 1 }}
          min={0}
          max={59}
        />
      </Box>
    </Box>
  );
};

export default DurationInput;

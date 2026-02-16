import { Box, Button, TextField, Typography } from "@mui/material";
import { formatDuration } from "@/utils";
import { FC } from "react";

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
        <TextField
          label="Hours"
          type="number"
          value={Math.floor(value / 3600)}
          onChange={(e) => {
            const hours = parseInt(e.target.value) || 0;
            const remainingSeconds = value % 3600;
            onChange(hours * 3600 + remainingSeconds);
          }}
          sx={{ flex: 1 }}
          slotProps={{ htmlInput: { min: 0 } }}
        />
        <TextField
          label="Minutes"
          type="number"
          value={Math.floor((value % 3600) / 60)}
          onChange={(e) => {
            const minutes = parseInt(e.target.value) || 0;
            const hours = Math.floor(value / 3600);
            const seconds = value % 60;
            onChange(hours * 3600 + minutes * 60 + seconds);
          }}
          sx={{ flex: 1 }}
          slotProps={{ htmlInput: { min: 0, max: 59 } }}
        />
        <TextField
          label="Seconds"
          type="number"
          value={value % 60}
          onChange={(e) => {
            const seconds = parseInt(e.target.value) || 0;
            const hours = Math.floor(value / 3600);
            const minutes = Math.floor((value % 3600) / 60);
            onChange(hours * 3600 + minutes * 60 + seconds);
          }}
          sx={{ flex: 1 }}
          slotProps={{ htmlInput: { min: 0, max: 59 } }}
        />
      </Box>
    </Box>
  );
};

export default DurationInput;

import { Chip, ChipProps } from "@mui/material";

export type CustomChipProps = Omit<ChipProps, "color"> & {
  color?: string;
};

export default function CustomChip({ color, ...props }: CustomChipProps) {
  return (
    <Chip
      {...props}
      sx={{
        backgroundColor: color || "default",
        "&, & .MuiChip-icon": {
          color: (theme) => theme.palette.getContrastText(color || theme.palette.background.default),
        },
        ...props.sx,
      }}
    />
  );
}

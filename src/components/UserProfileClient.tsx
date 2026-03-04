"use client";

import { signOut } from "next-auth/react";
import { Avatar, Box, Divider, ListItemIcon, Menu, MenuItem, Typography } from "@mui/material";
import LogoutIcon from "@mui/icons-material/Logout";
import PersonIcon from "@mui/icons-material/Person";
import BugReportIcon from "@mui/icons-material/BugReport";
import { useState, useTransition } from "react";
import type { Session } from "next-auth";

type Props = {
  session: Session | null;
};

export default function UserProfileClient({ session }: Props) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [isPending, startTransition] = useTransition();
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSignOut = () => {
    handleClose();
    startTransition(() => {
      signOut({ callbackUrl: "/login" });
    });
  };

  if (!session?.user) {
    return <Box sx={{ p: 2 }}>Not signed in</Box>;
  }

  const initials = session.user.name
    ? session.user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : session.user.email?.[0]?.toUpperCase() || "U";

  return (
    <Box sx={{ p: 2 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          cursor: "pointer",
          borderRadius: 1,
          p: 1,
          "&:hover": {
            bgcolor: "action.hover",
          },
        }}
        onClick={handleClick}>
        <Avatar src={session.user.image || undefined} sx={{ width: 36, height: 36, bgcolor: "primary.main" }}>
          {initials}
        </Avatar>
        <Box sx={{ flexGrow: 1, overflow: "hidden" }}>
          <Typography variant="body2" noWrap fontWeight="medium">
            {session.user.name || "User"}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            sx={{
              display: "block",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
            {session.user.email}
          </Typography>
        </Box>
      </Box>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        transformOrigin={{ horizontal: "left", vertical: "bottom" }}
        anchorOrigin={{ horizontal: "left", vertical: "top" }}>
        <MenuItem disabled sx={{ "&.Mui-disabled": { opacity: 1 } }}>
          <ListItemIcon>
            <PersonIcon fontSize="small" />
          </ListItemIcon>
          <Box>
            <Typography variant="body2">{session.user.name}</Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: "block",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
              {session.user.email}
            </Typography>
          </Box>
        </MenuItem>
        <Divider />
        <MenuItem component="a" href="/auth-debug" onClick={handleClose}>
          <ListItemIcon>
            <BugReportIcon fontSize="small" />
          </ListItemIcon>
          Auth Debug
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleSignOut} disabled={isPending}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          {isPending ? "Signing out..." : "Sign out"}
        </MenuItem>
      </Menu>
    </Box>
  );
}

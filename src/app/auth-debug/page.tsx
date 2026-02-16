"use client";

import { useSession } from "next-auth/react";
import { Alert, Box, Paper, Typography } from "@mui/material";
import { useEffect, useState } from "react";

export default function AuthDebugPage() {
  const { data: session, status } = useSession();
  const [origin, setOrigin] = useState("");
  const [userAgent, setUserAgent] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
    setUserAgent(navigator.userAgent);
  }, []);

  return (
    <Box sx={{ p: 3, maxWidth: 800, mx: "auto" }}>
      <Typography variant="h4" gutterBottom>
        Authentication Debug
      </Typography>

      <Paper sx={{ p: 3, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          Session Status
        </Typography>
        <Typography variant="body1">
          <strong>Status:</strong> {status}
        </Typography>
      </Paper>

      <Paper sx={{ p: 3, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          Session Data
        </Typography>
        {session ? (
          <pre style={{ overflow: "auto" }}>
            {JSON.stringify(session, null, 2)}
          </pre>
        ) : (
          <Alert severity="warning">No session data found</Alert>
        )}
      </Paper>

      <Paper sx={{ p: 3, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          Environment Info
        </Typography>
        <Typography variant="body2">
          <strong>Origin:</strong> {origin || "Loading..."}
        </Typography>
        <Typography variant="body2">
          <strong>User Agent:</strong>{" "}
          {userAgent ? userAgent.substring(0, 80) + "..." : "Loading..."}
        </Typography>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Troubleshooting Steps
        </Typography>
        <ol>
          <li>Check if NEXTAUTH_URL matches the current origin</li>
          <li>Verify cookies are present (DevTools → Application → Cookies)</li>
          <li>Check /api/auth/session returns user data</li>
          <li>Verify reverse proxy forwards X-Forwarded-* headers</li>
          <li>Check browser console for [UserProfile] debug logs</li>
        </ol>
      </Paper>
    </Box>
  );
}

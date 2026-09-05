"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  Snackbar,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import SyncIcon from "@mui/icons-material/Sync";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import { InstanceIdentity, PublicSyncPeer } from "@/types/sync";
import { formatDate } from "@/utils";

interface InstanceIdentityResponse extends InstanceIdentity {
  envVars: { INSTANCE_NAME: string | null };
}

export default function SyncSection() {
  const [identity, setIdentity] = useState<InstanceIdentityResponse | null>(null);
  const [peers, setPeers] = useState<PublicSyncPeer[]>([]);
  const [syncingPeerId, setSyncingPeerId] = useState<string | null>(null);
  const [instanceName, setInstanceName] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingExpiresIn, setPairingExpiresIn] = useState<number>(0);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [codeToLink, setCodeToLink] = useState("");
  const [linking, setLinking] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [manualPeer, setManualPeer] = useState({ name: "", baseUrl: "", instanceId: "", remoteApiKey: "" });
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false,
    message: "",
    severity: "success",
  });

  const notify = (message: string, severity: "success" | "error" = "success") =>
    setSnackbar({ open: true, message, severity });

  const fetchIdentity = useCallback(async () => {
    const response = await fetch("/api/sync/instance");
    const data: InstanceIdentityResponse = await response.json();
    setIdentity(data);
    setInstanceName(data.name);
    setPublicUrl(data.publicUrl || "");
  }, []);

  const fetchPeers = useCallback(async () => {
    const response = await fetch("/api/sync/peers");
    const data: PublicSyncPeer[] = await response.json();
    setPeers(data);
  }, []);

  useEffect(() => {
    fetchIdentity().catch((error) => console.error("Failed to load instance identity:", error));
    fetchPeers().catch((error) => console.error("Failed to load sync peers:", error));
  }, [fetchIdentity, fetchPeers]);

  useEffect(() => {
    if (!pairingCode) return;
    const interval = setInterval(() => {
      setPairingExpiresIn((prev) => {
        if (prev <= 1) {
          setPairingCode(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [pairingCode]);

  const handleSaveIdentity = async () => {
    setSavingIdentity(true);
    try {
      const response = await fetch("/api/sync/instance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: instanceName, publicUrl }),
      });
      if (!response.ok) throw new Error("Failed to save instance details");
      setIdentity(await response.json());
      notify("Instance details saved");
    } catch (error) {
      notify((error as Error).message, "error");
    } finally {
      setSavingIdentity(false);
    }
  };

  const handleGenerateCode = async () => {
    setGeneratingCode(true);
    try {
      const response = await fetch("/api/sync/pairing/initiate", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to generate pairing code");
      setPairingCode(data.code);
      setPairingExpiresIn(Math.max(0, Math.round((data.expiresAt - Date.now()) / 1000)));
    } catch (error) {
      notify((error as Error).message, "error");
    } finally {
      setGeneratingCode(false);
    }
  };

  const handleLinkInstance = async () => {
    setLinking(true);
    try {
      const response = await fetch("/api/sync/pairing/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeToLink.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to link instance");
      setCodeToLink("");
      await fetchPeers();
      notify(`Linked to ${data.name || "instance"} successfully!`);
    } catch (error) {
      notify((error as Error).message, "error");
    } finally {
      setLinking(false);
    }
  };

  const handleAddManualPeer = async () => {
    try {
      const response = await fetch("/api/sync/peers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(manualPeer),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to add peer");
      setManualPeer({ name: "", baseUrl: "", instanceId: "", remoteApiKey: "" });
      await fetchPeers();
      notify("Peer added");
    } catch (error) {
      notify((error as Error).message, "error");
    }
  };

  const handleTogglePeer = async (peer: PublicSyncPeer) => {
    await fetch(`/api/sync/peers/${peer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !peer.enabled }),
    });
    await fetchPeers();
  };

  const handleSyncPeer = async (peer: PublicSyncPeer) => {
    setSyncingPeerId(peer.id);
    try {
      const response = await fetch(`/api/sync/peers/${peer.id}/sync`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Sync failed");
      notify(`Synced with ${peer.name}`);
    } catch (error) {
      notify((error as Error).message, "error");
    } finally {
      setSyncingPeerId(null);
      await fetchPeers();
    }
  };

  const handleDeletePeer = async (peer: PublicSyncPeer) => {
    if (!confirm(`Remove linked instance "${peer.name}"?`)) return;
    await fetch(`/api/sync/peers/${peer.id}`, { method: "DELETE" });
    await fetchPeers();
  };

  const handleCopyCode = () => {
    if (!pairingCode) return;
    navigator.clipboard.writeText(pairingCode);
    notify("Pairing code copied to clipboard");
  };

  if (!identity) {
    return (
      <Box sx={{ breakInside: "avoid", mb: 3, display: "inline-block", width: "100%" }}>
        <Card>
          <CardContent sx={{ textAlign: "center" }}>
            <CircularProgress size={24} />
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box sx={{ breakInside: "avoid", mb: 3, display: "inline-block", width: "100%" }}>
      <Card>
        <CardHeader
          avatar={<SyncIcon color="primary" />}
          title="Sync Between Instances"
          subheader="Share scheduled recordings, saved streams and history with other linked instances"
        />
        <CardContent>
          <Stack spacing={2} sx={{ mb: 3 }}>
            <TextField
              fullWidth
              label="This instance's name"
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value)}
              disabled={!!identity.envVars.INSTANCE_NAME}
              helperText={
                identity.envVars.INSTANCE_NAME
                  ? `Using environment variable: ${identity.envVars.INSTANCE_NAME}`
                  : "Shown to other instances during pairing. Defaults to this machine's hostname."
              }
            />
            <TextField
              fullWidth
              label="This instance's public URL"
              value={publicUrl}
              onChange={(e) => setPublicUrl(e.target.value)}
              placeholder="https://home.example.com or http://192.168.1.50:3000"
              helperText="Must be reachable by any instance you link — required before pairing"
            />
            <Button
              variant="outlined"
              onClick={handleSaveIdentity}
              disabled={savingIdentity}
              sx={{ alignSelf: "flex-start" }}>
              {savingIdentity ? "Saving..." : "Save"}
            </Button>
          </Stack>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 3 }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2" gutterBottom>
                Generate a pairing code
              </Typography>
              <Button variant="contained" onClick={handleGenerateCode} disabled={generatingCode}>
                Generate pairing code
              </Button>
              {pairingCode && (
                <>
                  <Box sx={{ mt: 1, display: "flex", gap: 1, alignItems: "center" }}>
                    <TextField size="small" value={pairingCode} slotProps={{ input: { readOnly: true } }} fullWidth />
                    <Tooltip title="Copy">
                      <IconButton onClick={handleCopyCode} size="small">
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    expires in {pairingExpiresIn}s
                  </Typography>
                </>
              )}
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2" gutterBottom>
                Link an instance
              </Typography>
              <Box sx={{ display: "flex", gap: 1 }}>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Paste pairing code here"
                  value={codeToLink}
                  onChange={(e) => setCodeToLink(e.target.value)}
                />
                <Button variant="contained" onClick={handleLinkInstance} disabled={linking || !codeToLink.trim()}>
                  Connect
                </Button>
              </Box>
            </Box>
          </Stack>

          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Linked instances
          </Typography>
          {peers.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              No instances linked yet.
            </Typography>
          ) : (
            <TableContainer sx={{ mb: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>URL</TableCell>
                    <TableCell>Last Sync</TableCell>
                    <TableCell>Enabled</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {peers.map((peer) => (
                    <TableRow key={peer.id}>
                      <TableCell>{peer.name}</TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ fontFamily: "monospace" }}>
                          {peer.baseUrl}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {peer.lastSyncAt ? (
                          <Tooltip title={peer.lastSyncError || ""}>
                            <Chip
                              size="small"
                              label={formatDate(peer.lastSyncAt)}
                              color={peer.lastSyncStatus === "error" ? "error" : "success"}
                              variant="outlined"
                            />
                          </Tooltip>
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            Never
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch checked={peer.enabled} onChange={() => handleTogglePeer(peer)} size="small" />
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Sync now">
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => handleSyncPeer(peer)}
                              disabled={syncingPeerId === peer.id}>
                              {syncingPeerId === peer.id ? (
                                <CircularProgress size={16} />
                              ) : (
                                <SyncIcon fontSize="small" />
                              )}
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Remove">
                          <IconButton size="small" color="error" onClick={() => handleDeletePeer(peer)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          <Button
            size="small"
            onClick={() => setAdvancedOpen((prev) => !prev)}
            endIcon={advancedOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}>
            Advanced: add peer manually
          </Button>
          <Collapse in={advancedOpen}>
            <Stack spacing={2} sx={{ mt: 2 }}>
              <TextField
                size="small"
                label="Name"
                value={manualPeer.name}
                onChange={(e) => setManualPeer({ ...manualPeer, name: e.target.value })}
              />
              <TextField
                size="small"
                label="Base URL"
                value={manualPeer.baseUrl}
                onChange={(e) => setManualPeer({ ...manualPeer, baseUrl: e.target.value })}
              />
              <TextField
                size="small"
                label="Their instance ID"
                value={manualPeer.instanceId}
                onChange={(e) => setManualPeer({ ...manualPeer, instanceId: e.target.value })}
              />
              <TextField
                size="small"
                label="Their sync API key"
                value={manualPeer.remoteApiKey}
                onChange={(e) => setManualPeer({ ...manualPeer, remoteApiKey: e.target.value })}
              />
              <Button
                variant="outlined"
                onClick={handleAddManualPeer}
                disabled={!manualPeer.name || !manualPeer.baseUrl || !manualPeer.instanceId || !manualPeer.remoteApiKey}
                sx={{ alignSelf: "flex-start" }}>
                Add peer
              </Button>
              <Typography variant="caption" color="text.secondary">
                This instance&apos;s ID: {identity.instanceId}
                <br />
                This instance&apos;s sync API key: {identity.syncApiKey}
              </Typography>
            </Stack>
          </Collapse>
        </CardContent>
      </Card>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Typography,
} from "@mui/material";
import LoginIcon from "@mui/icons-material/Login";

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  const handleLogin = () => {
    signIn("authentik", { callbackUrl });
  };

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
        <Card sx={{ width: "100%", maxWidth: 400 }}>
          <CardContent sx={{ p: 4, textAlign: "center" }}>
            <Typography variant="h4" component="h1" gutterBottom>
              StreamRec
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
              Sign in to access your stream recording dashboard
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mb: 3 }}>
                {error === "OAuthSignin"
                  ? "Error occurred during sign in. Please try again."
                  : error === "OAuthCallback"
                    ? "Error during authentication callback."
                    : error === "OAuthAccountNotLinked"
                      ? "Account is already linked to another user."
                      : error === "AccessDenied"
                        ? "Access denied. You may not have permission."
                        : "An authentication error occurred."}
              </Alert>
            )}

            <Button
              variant="contained"
              size="large"
              fullWidth
              startIcon={<LoginIcon />}
              onClick={handleLogin}
              sx={{ py: 1.5 }}>
              Sign in with Authentik
            </Button>
          </CardContent>
        </Card>
      </Box>
    </Container>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <Container maxWidth="sm">
          <Box
            sx={{
              minHeight: "100vh",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
            <Typography>Loading...</Typography>
          </Box>
        </Container>
      }>
      <LoginContent />
    </Suspense>
  );
}

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useState } from "react";
import "../global.css";
import { useServiceWorker } from "../hooks/useServiceWorker";
import { ThemeProvider } from "../theme/ThemeProvider";

export default function RootLayout() {
  useServiceWorker();

  // One client for the app's lifetime. Created in state rather than at module
  // scope so a fast refresh doesn't strand the old cache.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // A verdict degrades rather than expires — an analysis from ten
            // minutes ago still answers "is it raining now" via its T+10 frame.
            // So a failed refetch must never throw away what we already hold.
            retry: 1,
            refetchOnReconnect: true,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "var(--color-bg)" },
          }}
        />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

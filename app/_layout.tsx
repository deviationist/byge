import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useState } from "react";
import "../global.css";
import "../i18n";
import { useServiceWorker } from "../hooks/useServiceWorker";
import { ThemeProvider, useResolvedTheme } from "../theme/ThemeProvider";
import { BG } from "../theme/tokens";

/**
 * Inside the provider so it can read the resolved theme.
 *
 * `contentStyle` paints behind a screen during a transition. It is a navigator
 * style object rather than a component, so it takes neither a Uniwind class nor
 * a `var()` — it needs a real value, which is why BG exists.
 */
function Navigator() {
  const theme = useResolvedTheme();
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: BG[theme] } }}
    />
  );
}

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
        <Navigator />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

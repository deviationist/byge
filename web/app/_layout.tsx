import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import "../global.css";
import "../i18n";
import { CrashBoundary } from "../components/CrashBoundary";
import { ToastHost } from "../components/ToastHost";
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
    // The host sits OUTSIDE the Stack and as its sibling, so a route change
    // does not unmount it — which is the entire reason a receipt emitted by the
    // screen you are leaving can be read on the screen you arrive at.
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: BG[theme] } }}
      />
      <ToastHost />
    </View>
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
    // The boundary is OUTSIDE the navigator and inside the providers: it must
    // survive whatever the routed tree does, but it renders a screen that needs
    // the theme and the string table to say anything at all.
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <CrashBoundary>
          <Navigator />
        </CrashBoundary>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "./global.css";

export default function RootLayout() {
  return (
    <SafeAreaProvider style={{ backgroundColor: '#1C1C1E' }}>
      <StatusBar style="light" backgroundColor="#1C1C1E" />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ title: "Onboarding" }} />
      </Stack>
    </SafeAreaProvider>
  );
}

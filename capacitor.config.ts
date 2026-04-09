import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ohmsbasket.app',
  appName: 'Ohms Basket',
  webDir: 'out',
  android: {
    // Allow WebView to access camera via getUserMedia
    allowMixedContent: true,
  },
  plugins: {
    // No plugins needed — camera accessed via browser getUserMedia API
  },
  server: {
    // Allow camera permission passthrough from WebView to Android
    androidScheme: 'https',
  },
};

export default config;

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rutea.app',
  appName: 'Rutea',
  // In production, point to your deployed Django server URL.
  // For dev, use your local network IP so the mobile device can reach it.
  server: {
    url: 'http://10.0.2.2:8000',  // Android emulator -> host machine
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#191919',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#191919',
    },
  },
};

export default config;

import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.go-game-app.pro',
  appName: '围棋Pro',
  webDir: './',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0f1720',
      showSpinner: false
    }
  }
};

export default config;

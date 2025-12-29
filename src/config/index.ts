// Environment configuration for the mobile app
// Update these values for production deployment

export const config = {
  // API Base URL
  // Development: Your local machine IP (find with ipconfig/ifconfig)
  // Production: Your Render.com URL
  apiUrl: __DEV__
    ? 'http://192.168.0.225:3000/api'  // Change to your local IP
    : 'https://demurrage-tracker-api.onrender.com/api', // Update after Render deploy
  
  // App Settings
  appName: 'Demurrage Tracker',
  version: '1.0.0',
  
  // Feature Flags
  enableBiometrics: true,
  enablePhotos: true,
  enableOfflineMode: false, // Future feature
};

export default config;

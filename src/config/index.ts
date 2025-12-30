// Environment configuration for the mobile app
// Update these values for production deployment

export const config = {
  // API Base URL
  // Development: Your local machine IP (find with ipconfig/ifconfig)
  // Production: Your Render.com URL
  // Using production API for testing
  apiUrl: 'https://demurrage-tracker-api.onrender.com/api',
  
  // App Settings
  appName: 'Demurrage Tracker',
  version: '1.0.0',
  
  // Feature Flags
  enableBiometrics: true,
  enablePhotos: true,
  enableOfflineMode: false, // Future feature
};

export default config;

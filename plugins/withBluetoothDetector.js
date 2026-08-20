const { withAndroidManifest, withInfoPlist } = require('@expo/config-plugins');

function withBluetoothDetector(config) {
  // Add Android permissions and queries
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // Ensure uses-permission array exists
    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }

    const permissions = [
      'android.permission.BLUETOOTH',
      'android.permission.BLUETOOTH_ADMIN',
      'android.permission.BLUETOOTH_CONNECT',
      'android.permission.BLUETOOTH_SCAN',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE',
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.POST_NOTIFICATIONS',
    ];

    permissions.forEach((permission) => {
      const exists = manifest['uses-permission'].some(
        (p) => p.$?.['android:name'] === permission
      );
      if (!exists) {
        manifest['uses-permission'].push({
          $: { 'android:name': permission },
        });
      }
    });

    // Add queries for Spotify app
    if (!manifest.queries) {
      manifest.queries = [];
    }
    manifest.queries.push({
      package: [{ $: { 'android:name': 'com.spotify.music' } }],
    });

    return config;
  });

  return config;
}

module.exports = withBluetoothDetector;

/**
 * BackgroundService — Manages the Android Foreground Service notification.
 *
 * Uses expo-notifications + expo-task-manager for persistent background
 * execution with a notification that keeps the app alive.
 */

import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { NOTIFICATION_CHANNEL_ID, NOTIFICATION_CHANNEL_NAME } from '../config/constants';

// Configure notification handler — don't show alert for our own service notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowInForeground: false,
  }),
});

class BackgroundServiceClass {
  private notificationId: string | null = null;

  /**
   * Initialize the notification channel (must be called once on Android).
   */
  async initialize(): Promise<void> {
    await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
      name: NOTIFICATION_CHANNEL_NAME,
      importance: Notifications.AndroidImportance.LOW,
      description: 'Utrzymuje usługę aktywną w tle do wykrywania połączenia z samochodem',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableVibrate: false,
      showBadge: false,
    });
  }

  /**
   * Show a persistent notification indicating the service is active.
   */
  async startForegroundService(): Promise<void> {
    try {
      // Request notification permissions
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        console.warn('[BackgroundService] Notification permission not granted');
        return;
      }

      this.notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: '🚗 MyMusicLauncher',
          body: 'Oczekuję na połączenie z samochodem...',
          sticky: true,
          priority: Notifications.AndroidNotificationPriority.LOW,
          autoDismiss: false,
        },
        trigger: null, // show immediately
      });
    } catch (error) {
      console.error('[BackgroundService] Failed to start foreground notification:', error);
    }
  }

  /**
   * Update the notification text.
   */
  async updateNotification(body: string): Promise<void> {
    // Dismiss old and show new
    if (this.notificationId) {
      await Notifications.dismissNotificationAsync(this.notificationId);
    }

    try {
      this.notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: '🚗 MyMusicLauncher',
          body,
          sticky: true,
          priority: Notifications.AndroidNotificationPriority.LOW,
          autoDismiss: false,
        },
        trigger: null,
      });
    } catch (error) {
      console.error('[BackgroundService] Failed to update notification:', error);
    }
  }

  /**
   * Stop the foreground notification.
   */
  async stopForegroundService(): Promise<void> {
    try {
      if (this.notificationId) {
        await Notifications.dismissNotificationAsync(this.notificationId);
        this.notificationId = null;
      }
      await Notifications.dismissAllNotificationsAsync();
    } catch (error) {
      console.error('[BackgroundService] Failed to stop:', error);
    }
  }
}

export const BackgroundService = new BackgroundServiceClass();

import { api } from './api';

/**
 * Check if push notifications are supported in this browser.
 */
export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/**
 * Get the current Notification permission state.
 * @returns {'granted' | 'denied' | 'default'}
 */
export function getPermissionState() {
  if (!('Notification' in window)) return 'denied';
  return Notification.permission;
}

/**
 * Subscribe the user to push notifications.
 * Requests permission if needed, registers the SW subscription, and sends it to the server.
 * @returns {{ success: boolean, reason?: string }}
 */
export async function subscribeToPush() {
  if (!isPushSupported()) {
    return { success: false, reason: 'Push notifications are not supported in this browser.' };
  }

  // Request permission if not yet granted
  if (Notification.permission === 'default') {
    const result = await Notification.requestPermission();
    if (result !== 'granted') {
      return {
        success: false,
        reason: 'Notification permission was denied. To enable push notifications, allow notifications for this site in your browser settings.',
      };
    }
  } else if (Notification.permission === 'denied') {
    return {
      success: false,
      reason: 'Notification permission was previously denied. Please enable notifications for this site in your browser settings, then try again.',
    };
  }

  try {
    // Get VAPID public key from server
    const { publicKey } = await api('/api/notifications/push/vapid-key');
    if (!publicKey) {
      return { success: false, reason: 'Push notifications are not configured on the server. Ask your administrator to set up VAPID keys.' };
    }

    // Get SW registration
    const registration = await navigator.serviceWorker.ready;

    // Subscribe
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    // Send subscription to server
    await api('/api/notifications/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });

    return { success: true };
  } catch (err) {
    return { success: false, reason: err.message || 'Failed to subscribe to push notifications.' };
  }
}

/**
 * Unsubscribe from push notifications.
 */
export async function unsubscribeFromPush() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await api('/api/notifications/push/unsubscribe', {
        method: 'POST',
        body: JSON.stringify({ endpoint }),
      });
    } else {
      // No local subscription, just tell server to clean up
      await api('/api/notifications/push/unsubscribe', {
        method: 'POST',
        body: JSON.stringify({}),
      });
    }
    return { success: true };
  } catch (err) {
    return { success: false, reason: err.message };
  }
}

/**
 * Convert a URL-safe base64 string to a Uint8Array (for applicationServerKey).
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

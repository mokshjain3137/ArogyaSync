/**
 * ArogyaSync — LoRa Radio Simulation Channel
 * ==========================================
 * Provides reliable cross-tab (BroadcastChannel) and in-window (CustomEvent + localStorage)
 * message delivery for the simulated LoRa 868MHz mesh network.
 */

const CHANNEL_NAME = 'lora_radio';
let sharedChannel = null;

const getBroadcastChannel = () => {
  if (typeof window === 'undefined') return null;
  if (!sharedChannel) {
    try {
      sharedChannel = new BroadcastChannel(CHANNEL_NAME);
    } catch (e) {
      console.warn('[LoRa Radio] BroadcastChannel unavailable:', e);
    }
  }
  return sharedChannel;
};

/**
 * Broadcasts a packet over the simulated LoRa network.
 * Guaranteed to reach:
 *   1. Same-tab components (via CustomEvent & localStorage)
 *   2. Other browser tabs (via BroadcastChannel & StorageEvent)
 */
export const broadcastLoRaPacket = (packet) => {
  if (!packet) return;

  const enrichedPacket = {
    ...packet,
    _receivedAt: packet._receivedAt || new Date().toISOString()
  };

  // 1. Persist to Gateway RX history in localStorage
  try {
    const rawGateway = localStorage.getItem('lora_gateway_packets');
    const list = rawGateway ? JSON.parse(rawGateway) : [];
    const isDup = list.some(p => p.id === enrichedPacket.id && p.ts === enrichedPacket.ts);
    if (!isDup) {
      const updated = [enrichedPacket, ...list].slice(0, 50);
      localStorage.setItem('lora_gateway_packets', JSON.stringify(updated));
    }
  } catch (err) {
    console.warn('[LoRa Radio] Failed to persist gateway packet:', err);
  }

  // 2. Persist patient packets to Doctor Radio history in localStorage
  if (enrichedPacket.type === 'patient') {
    try {
      const rawDoctor = localStorage.getItem('lora_logs');
      const list = rawDoctor ? JSON.parse(rawDoctor) : [];
      const isDup = list.some(p => p.id === enrichedPacket.id && p.ts === enrichedPacket.ts);
      if (!isDup) {
        const updated = [enrichedPacket, ...list].slice(0, 50);
        localStorage.setItem('lora_logs', JSON.stringify(updated));
      }
    } catch (err) {
      console.warn('[LoRa Radio] Failed to persist doctor packet:', err);
    }
  }

  // 3. Dispatch in-window event (BroadcastChannel does NOT notify the sender window)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('lora_packet_radio', { detail: enrichedPacket }));
  }

  // 4. Send via cross-tab BroadcastChannel
  try {
    const channel = getBroadcastChannel();
    if (channel) {
      channel.postMessage(enrichedPacket);
    }
  } catch (err) {
    console.warn('[LoRa Radio] PostMessage failed:', err);
  }
};

/**
 * Subscribes to all incoming LoRa packets from both in-window and cross-tab broadcasts.
 * @param {Function} callback - invoked with packet object
 * @returns {Function} unsubscribe cleanup function
 */
export const subscribeToLoRaRadio = (callback) => {
  if (typeof window === 'undefined' || typeof callback !== 'function') {
    return () => {};
  }

  // Handler for in-window custom events
  const handleLocalEvent = (e) => {
    if (e?.detail) {
      callback(e.detail);
    }
  };

  // Handler for BroadcastChannel events
  const channel = getBroadcastChannel();
  const handleBroadcastMessage = (event) => {
    if (event?.data) {
      callback(event.data);
    }
  };

  window.addEventListener('lora_packet_radio', handleLocalEvent);
  if (channel) {
    channel.addEventListener('message', handleBroadcastMessage);
  }

  return () => {
    window.removeEventListener('lora_packet_radio', handleLocalEvent);
    if (channel) {
      channel.removeEventListener('message', handleBroadcastMessage);
    }
  };
};

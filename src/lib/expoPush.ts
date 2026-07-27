import { Expo, ExpoPushMessage } from "expo-server-sdk";

const expo = new Expo();

export interface PushMessageInput {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Sends a batch of Expo push messages, chunked per SDK limits. Returns a
 * boolean per input message (same order/length as `messages`) indicating
 * whether that message was accepted for delivery. Tokens that aren't
 * valid Expo push tokens are treated as failed without ever being sent.
 */
export async function sendPushNotifications(messages: PushMessageInput[]): Promise<boolean[]> {
  const results: boolean[] = new Array(messages.length).fill(false);

  const sendable: { index: number; message: ExpoPushMessage }[] = [];
  messages.forEach((m, index) => {
    if (Expo.isExpoPushToken(m.to)) {
      sendable.push({ index, message: { to: m.to, title: m.title, body: m.body, data: m.data } });
    }
  });

  const chunks = expo.chunkPushNotifications(sendable.map((s) => s.message));

  let cursor = 0;
  for (const chunk of chunks) {
    const tickets = await expo.sendPushNotificationsAsync(chunk);
    for (const ticket of tickets) {
      results[sendable[cursor].index] = ticket.status === "ok";
      cursor++;
    }
  }

  return results;
}

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

admin.initializeApp();

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const chunkArray = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

exports.sendAlfredPush = functions.firestore
  .document('houses/{houseId}/notifications/{notificationId}')
  .onCreate(async (snapshot, context) => {
    const notification = snapshot.data();
    const houseId = context.params.houseId;

    if (!notification || !houseId) {
      return null;
    }

    const houseDoc = await admin.firestore().doc(`houses/${houseId}`).get();
    if (!houseDoc.exists) {
      return null;
    }

    const members = houseDoc.data().members || [];
    if (!Array.isArray(members) || members.length === 0) {
      return null;
    }

    const triggeredBy = notification.triggeredBy;
    const message = notification.message || 'New Alfred update';

    const userDocs = await admin.firestore().getAll(
      ...members.map((userId) => admin.firestore().doc(`users/${userId}`))
    );

    const tokens = userDocs
      .map((doc) => doc.data())
      .filter(Boolean)
      .filter((user) => user.uid !== triggeredBy)
      .map((user) => user.expoPushToken)
      .filter((token) => typeof token === 'string' && token.startsWith('ExponentPushToken'));

    if (!tokens.length) {
      return null;
    }

    const messages = tokens.map((token) => ({
      to: token,
      sound: 'default',
      title: 'Alfred',
      body: message,
      data: {
        houseId,
        notificationId: snapshot.id,
      },
    }));

    const chunks = chunkArray(messages, 100);
    for (const chunk of chunks) {
      try {
        await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(chunk),
        });
      } catch (error) {
        console.error('Failed to send Expo push notifications:', error);
      }
    }

    return null;
  });

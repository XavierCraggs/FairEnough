const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

admin.initializeApp();

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const HOUSE_PASS_PRODUCT_ID =
  process.env.REVENUECAT_HOUSE_PASS_PRODUCT_ID ||
  (functions.config().revenuecat && functions.config().revenuecat.house_pass_product_id) ||
  'house_pass_monthly';

const getRevenueCatSecret = () =>
  process.env.REVENUECAT_WEBHOOK_SECRET ||
  (functions.config().revenuecat && functions.config().revenuecat.webhook_secret);

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

exports.revenueCatWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  const secret = getRevenueCatSecret();
  if (secret) {
    const authHeader = req.get('Authorization');
    const allowed =
      authHeader === secret || authHeader === `Bearer ${secret}`;
    if (!allowed) {
      return res.status(401).send('Unauthorized');
    }
  }

  const event = (req.body && req.body.event) ? req.body.event : req.body;
  if (!event || !event.type) {
    return res.status(400).send('Missing event payload');
  }

  const productId = event.product_id || event.productId;
  if (productId && productId !== HOUSE_PASS_PRODUCT_ID) {
    return res.status(200).send('Ignored product');
  }

  const attributes = event.subscriber_attributes || {};
  const houseId =
    (attributes.houseId && attributes.houseId.value) || event.app_user_id;

  if (!houseId) {
    return res.status(400).send('Missing houseId');
  }

  const expirationMs = Number(event.expiration_at_ms || event.expires_at_ms || 0);
  const expiresAt = expirationMs
    ? admin.firestore.Timestamp.fromMillis(expirationMs)
    : null;
  const isPremium = expirationMs ? expirationMs > Date.now() : true;

  await admin.firestore().doc(`houses/${houseId}`).set(
    {
      isPremium,
      premium: {
        status: isPremium ? 'active' : 'inactive',
        expiresAt,
        productId: productId || HOUSE_PASS_PRODUCT_ID,
        platform: event.store || null,
        eventType: event.type,
        purchaserUid:
          (attributes.purchaserUid && attributes.purchaserUid.value) || null,
        purchaserName:
          (attributes.purchaserName && attributes.purchaserName.value) || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return res.status(200).send('ok');
});

"use strict";

const admin = require("firebase-admin");
const firebase_tools = require('firebase-tools');
const functions = require("firebase-functions");
admin.initializeApp();

const stripe = require("stripe")(functions.config().stripe.secret_test_key);

exports.createStripeCustomer = functions.firestore
  .document("/users/{userId}")
  .onCreate(async (snap, context) => {
    try {
      const data = snap.data();
      const customer = await stripe.customers.create({ email: data.email });
      await admin.firestore().collection("users").doc(data.uid).update({
        stripeId: customer.id,
      });
    } catch (err) {
      console.log(err);
      return;
    }
    return;
  });

exports.createEphemeralKey = functions.https.onCall(async (data, context) => {
  const customerId = data.customer_id;
  const stripeVersion = data.stripe_version;
  const uid = context.auth.uid;

  if (uid === null) {
    console.log("Illegal attempt due to unauthorized user");
    throw new functions.https.HttpsError(
      "permission-denied",
      "Illegal attempt due to unauthorized user"
    );
  }
  try {
    const key = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { stripe_version: stripeVersion }
    );
    return key;
  } catch (err) {
    console.log(err);
    throw new functions.https.HttpsError(
      "internal",
      "Unable to create Ephemeral Key"
    );
  }
});

exports.makeCharge = functions.https.onCall(async (data, context) => {
  const customerId = data.customer_id;
  const totalAmount = data.total_amount;
  const idempotency = data.idempotency;
  const paymentMethodId = data.payment_method_id;
  const uid = context.auth.uid;

  if (uid === null) {
    console.log("Illegal attempt due to unauthorized user");
    throw new functions.https.HttpsError(
      "permission-denied",
      "Illegal attempt due to unauthorized user"
    );
  }

  return stripe.paymentIntents.create({
      payment_method: paymentMethodId,
      customer: customerId,
      amount: totalAmount,
      currency: 'usd',
      confirm: true,
      payment_method_types: ['card']
  }, {
      idempotency_key: idempotency
  }).then(intent => {
      console.log('Charge Success: ', intent);
      return;
  }).catch(err => {
      console.log(err);
      throw new functions.https.HttpsError('internal', ' Unable to create charge: ' + err);
  });    

});

exports.userDeleted = functions.auth.user().onDelete(async (user) => {
  try {
    const userDoc = admin.firestore().collection("users").doc(user.uid);
    const stripeCustomerDoc = admin
      .firestore()
      .collection("stripe_customers")
      .doc(user.uid);

    await userDoc.delete();
    await stripeCustomerDoc.delete();
  } catch (err) {
    console.log(err);
    return;
  }
  return;
});

exports.recursiveDelete = functions
  .runWith({
    timeoutSeconds: 540,
    memory: '2GB'
  })
  .https.onCall(async (data, context) => {
    const path = `/bag/${context.auth.uid}/items`
    console.log(
      `User ${context.auth.uid} has requested to delete path ${path}`
    );

    await firebase_tools.firestore
      .delete(path, {
        project: process.env.GCLOUD_PROJECT,
        recursive: true,
        yes: true,
        token: functions.config().fb.token
      });

    return {
      path: path 
    };
  });

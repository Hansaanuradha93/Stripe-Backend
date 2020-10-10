// "use strict";

const functions = require("firebase-functions");
const admin = require("firebase-admin");
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
  const customerId = data.customerId;
  const amount = data.amount;
  const idempotency = data.idempotency;
  const uid = context.auth.uid;

  if (uid === null) {
    console.log("Illegal attempt due to unauthorized user");
    throw new functions.https.HttpsError(
      "permission-denied",
      "Illegal attempt due to unauthorized user"
    );
  }

  return stripe.charges.create({ 
    amount: amount,
    currency: "usd",
    source: "tok_mastercard",
  }, {
    idempotencyKey: idempotency
  }).then( _ => {
    return;
  }).catch( err => {
    console.log(err);
    throw new functions.https.HttpsError("internal", "Unable to create charge");
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

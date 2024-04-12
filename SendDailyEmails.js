const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const {Client} = require("@googlemaps/google-maps-services-js");
const googleMapsClient = new Client();

admin.initializeApp();
const firestore = admin.firestore();

// Google Cloud Function to send emails periodically
exports.sendEmails = functions
    .pubsub
    .schedule("*/15 8-11 * * 1-5")
    .timeZone("America/Los_Angeles")
    .onRun(async (context) => {
      try {
        // Check if today is a weekday (Monday to Friday)
        const date = new Date();
        // Specify your timezone
        const options = {timeZone: "America/Los_Angeles", hour12: false};
        // Get date and time
        const today = new Date(date.toLocaleString("en-US", options));

        console.log("got date and time");
        // Fetch users from Firestore
        const users = await firestore.collection("users").get();
        const userDocs = users.docs;
        // Iterate through users
        await Promise.all(userDocs.map(async (userDoc) => {
          const userData = userDoc.data();
          console.log("got user data");

          // Check if user has email, home, work, and departureTime
          if (
            userData.email &&
            userData.home &&
            userData.work &&
            userData.departureTime
          ) {
            const departure = new Date(userData.departureTime);
            console.log("got departure time");

            console.log(today.getHours()+":"+today.getMinutes());
            console.log(departure.getHours()+":"+departure.getMinutes());

            // Check if the current hour matches the stored departure hour
            if (today.getHours() === departure.getHours() &&
            today.getMinutes() === departure.getMinutes()) {
              console.log("checked departure time");
              // Calculate best route and time estimate using Google Maps API
              const routeInfo = await calculateRouteInfo(
                  userData.home,
                  userData.work,
              );

              // Prepare email content
              let mailContent;
              console.log("created mail content");

              if (userData.displayName) {
                mailContent = {
                  to: userData.email,
                  from: "jpnewman167@gmail.com",
                  subject: "Your Daily Commute Information",
                  html: `<p>Hi ${userData.displayName},</p>
                        <p>This is your daily commute information:</p>
                        <p>&emsp;Work Address: ${userData.work}</p>
                        <p>&emsp;Best route: ${routeInfo.summary}</p>
                        <p>&emsp;Time Estimate: ${routeInfo.duration.text}</p>
                        <a href="${getGoogleMapsDirectionsUrl(userData.home, userData.work)}" target="_blank">
                          <img src="${routeInfo.mapImageUrl}" alt="Map Image" width="800" height="600"/>
                        </a>
                        <p>Thanks from your commuting team!</p>`
                };
              } else {
                mailContent = {
                  to: userData.email,
                  from: "jpnewman167@gmail.com",
                  subject: "Your Daily Commute Information",
                  html: `<p>This is your daily commute information:</p>
                        <p>&emsp;Work Address: ${userData.work}</p>
                        <p>&emsp;Best route: ${routeInfo.summary}</p>
                        <p>&emsp;Time Estimate: ${routeInfo.duration.text}</p>
                        <a href="${getGoogleMapsDirectionsUrl(userData.home, userData.work)}" target="_blank">
                          <img src="${routeInfo.mapImageUrl}" alt="Map Image" width="800" height="600"/>
                        </a>
                        <p>Thanks from your commuting team!</p>`
                };
              }
              console.log("set mail content");
              console.log("sending email");
              // Send email using SendGrid
              await sendEmailWithAppPassword(mailContent);
              console.log(`Email sent to ${userData.email}`);
            }
          }
        }));

        return null;
      } catch (error) {
        console.error("Error sending emails:", error);
        return null;
      }
    });

/**
 * Calculates route information using the Google Maps API.
 *
 * @param {string} homeAddress - The starting address.
 * @param {string} workAddress - The destination address.
 * @return {Promise<Object>}
 * @throws {Error} Throws an error if there is an issue calculating the route.
 */
async function calculateRouteInfo(homeAddress, workAddress) {
  console.log("getting route directions");
  const response = await googleMapsClient.directions({
    params: {
      origin: homeAddress,
      destination: workAddress,
      key: "GOOGLE_MAPS_API_KEY",
      routingPreference: "TRAFFIC_AWARE_OPTIMAL",
    },
  });
  console.log("got route directions");

  if (response.data.status === "OK" && response.data.routes.length > 0) {
    console.log("returning route directions");
    const route = response.data.routes[0];
    // Create a static map URL
    const staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${homeAddress}&zoom=10&size=800x600&maptype=roadmap&markers=color:blue%7Clabel:S%7C${homeAddress}&markers=color:red%7Clabel:C%7C${workAddress}&key=GOOGLE_MAPS_API_KEY`;
    return {
      summary: route.summary,
      distance: route.legs[0].distance,
      duration: route.legs[0].duration,
      mapImageUrl: staticMapUrl
    };
  } else {
    throw new Error("Error calculating route information");
  }
}

/**
 * Send email using Nodemailer with Google App Password.
 *
 * @param {Object} mailContent - The email content.
 * @throws {Error} Throws an error if there is an issue sending the email.
 */
async function sendEmailWithAppPassword(mailContent) {
  console.log("sending email with app password");

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "EMAIL", // Replace with your Gmail email
      pass: "PASS", // Replace with your Google App Password
    },
  });

  try {
    await transporter.sendMail(mailContent);
    console.log("Email sent successfully");
  } catch (error) {
    console.error("Error sending email:", error);
    throw new Error("Error sending email");
  }
}

function getGoogleMapsDirectionsUrl(origin, destination) {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`;
}

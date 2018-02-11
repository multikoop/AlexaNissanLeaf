"use strict";

// Require the leaf.js file with specific vehicle functions.
let car = require("./leaf");

// Build a response to send back to Alexa.
function buildResponse(output, card, shouldEndSession) {
	return {
		version: "1.0",
		response: {
			outputSpeech: {
				type: "PlainText",
				text: output,
			},
			card,
			shouldEndSession
		}
	};
}

// Helper to build the text response for range/battery status.
function buildBatteryStatus(battery) {

	let response = `Du hast noch ${Math.floor((battery.BatteryStatusRecords.BatteryStatus.BatteryRemainingAmount / battery.BatteryStatusRecords.BatteryStatus.BatteryCapacity) * 100)}% Batterieladung. Damit kommst Du ungefähr ${Math.floor(battery.BatteryStatusRecords.CruisingRangeAcOn/1000)} Kilometer weit. `;

	if (battery.BatteryStatusRecords.PluginState == "CONNECTED") {
		response += "Das Auto ist an einer Ladestation angeschlossen";
	} else {
		response += "Das Auto ist aktuell an keiner Ladestation angeschlossen";
	}

	if (battery.BatteryStatusRecords.BatteryStatus.BatteryChargingStatus != "NOT_CHARGING") {
		response += " und lädt";
	}

	return response + ".";
}

// Helper to build the text response for charging status.
function buildChargingStatus(charging) {
	let response = "";
	if(charging.BatteryStatusRecords.BatteryStatus.BatteryChargingStatus == "NOT_CHARGING") {
		response += "Your car is not on charge.";
	} else {
		response += "Your car is on charge.";
	}

	return response;
}

// Helper to build the text response for connected to power status.
function buildConnectedStatus(connected) {
	let response = "";
	if(connected.BatteryStatusRecords.PluginState == "NOT_CONNECTED") {
		response += "Your car is not connected to a charger.";
	} else {
		response += "Your car is connected to a charger.";
	}

	return response;
}

// Handling incoming requests
exports.handler = (event, context) => {

	// Helper to return a response with a card.
	const sendResponse = (title, text) => {
		context.succeed(buildResponse(text, {
			"type": "Simple",
			"title": title,
			"content": text
		}));
	};

	try {
		// Check if this is a CloudWatch scheduled event.
		if (event.source == "aws.events" && event["detail-type"] == "Scheduled Event") {
			console.log(event);
			// The environmnet variable scheduledEventArn should have a value as shown in the trigger configuration for this lambda function,
			// e.g. "arn:aws:events:us-east-1:123123123:rule/scheduledNissanLeafUpdate",
			if (event.resources && event.resources[0] == process.env.scheduledEventArn) {
				// Scheduled data update
				console.log("Beginning scheduled update");
				car.getBatteryStatus(
					() => console.log("Scheduled update requested"),
					() => console.log("Scheduled update failed")
				);
				return;
			}
			sendResponse("Invalid Scheduled Event", "This service is not configured to allow the source of this scheduled event.");
			return;
		}
		// Verify the person calling the script. Get your Alexa Application ID here: https://developer.amazon.com/edw/home.html#/skills/list
		// Click on the skill and look for the "Application ID" field.
		// Set the applicationId as an environment variable or hard code it here.
		if(event.session.application.applicationId !== process.env.applicationId) {
			sendResponse("Invalid Application ID", "You are not allowed to use this service.");
			return;
		}

		// Shared callbacks.
		const exitCallback = () => context.succeed(buildResponse("Goodbye!"));
		const helpCallback = () => context.succeed(buildResponse("What would you like to do? You can preheat the car or ask for battery status.", null, false));
		const loginFailureCallback = () => sendResponse("Authorisation Failure", "Unable to login to Nissan Services, please check your login credentials.");

		// Handle launches without intents by just asking what to do.
		if (event.request.type === "LaunchRequest") {
			helpCallback();
		} else if (event.request.type === "IntentRequest") {
			// Handle different intents by sending commands to the API and providing callbacks.
			switch (event.request.intent.name) {
				case "PreheatIntent":
					car.sendPreheatCommand(
						response => sendResponse("Auto vorheizen", "Alles klar. Deine Karre wird nun vorgeheizt."),
						() => sendResponse("Auto vorheizen", "I can't communicate with the car at the moment.")
					);
					break;
				case "CoolingIntent":
					car.sendCoolingCommand(
						response => sendResponse("Auto Cooling", "Dein Auto wird jetzt gekühlt."),
						() => sendResponse("Auto Cooling", "I can't communicate with the car at the moment.")
					);
					break;
				case "ClimateControlOffIntent":
					car.sendClimateControlOffCommand(
						response => sendResponse("Auto Klimaanlage aus", "Die Klimaanlage wurde ausgeschaltet."),
						() => sendResponse("Auto Klimaanlage aus", "I can't communicate with the car at the moment.")
					);
					break;
				case "StartChargingIntent":
					car.sendStartChargingCommand(
						response => sendResponse("Ladevorgang starten", "Das Auto lädt nun."),
						() => sendResponse("Ladevorgang starten", "I can't communicate with the car at the moment.")
					);
					break;
				case "UpdateIntent":
					car.sendUpdateCommand(
						response => sendResponse("Daten aktualisieren", "Autodaten werden jetzt aktualisiert."),
						() => sendResponse("Daten aktualisieren", "I can't communicate with the car at the moment.")
					);
					break;
				case "RangeIntent":
					car.getBatteryStatus(
						response => sendResponse("Reichweiten Status", buildBatteryStatus(response)),
						() => sendResponse("Reichweiten Status", "Unable to get car battery status.")
					);
					break;
				case "ChargeIntent":
					car.getBatteryStatus(
						response => sendResponse("Batteriestatus", buildBatteryStatus(response)),
						() => sendResponse("Batteriestatus", "Unable to get car battery status.")
					);
					break;
				case "ChargingIntent":
					car.getBatteryStatus(
						response => sendResponse("Auto Ladevorgang", buildChargingStatus(response)),
						() => sendResponse("Auto Ladevorgang", "Unable to get car battery status.")
					);
					break;
				case "ConnectedIntent":
					car.getBatteryStatus(
						response => sendResponse("Auto Verbindungsstatus", buildConnectedStatus(response)),
						() => sendResponse("Auto Verbindungsstatus", "Unable to get car battery status.")
					);
					break;
				case "AMAZON.HelpIntent":
					helpCallback();
					break;
				case "AMAZON.StopIntent":
				case "AMAZON.CancelIntent":
					exitCallback();
					break;
			}
		} else if (event.request.type === "SessionEndedRequest") {
			exitCallback();
		}
	} catch (err) {
		console.error(err.message);
		console.log(event);
		sendResponse("Error Occurred", "An error occurred. Fire the programmer! " + err.message);
	}
};

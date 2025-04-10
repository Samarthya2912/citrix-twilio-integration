﻿import * as _CitrixBootstrap from "@citrix/ucsdk/CitrixBootstrap";
import * as _CitrixWebRTC from "@citrix/ucsdk/CitrixWebRTC";
import * as Twilio from "@twilio/voice-sdk";

$(async function () {
  const CitrixBootstrap = window.CitrixBootstrap;

  CitrixBootstrap.initBootstrap("Vendor");

  const envDetector = document.getElementById("environment-detector");
  envDetector.innerText = "Detecting environment...";

  const citrixWebRtcRedir = await window.getCitrixWebrtcRedir();

  switch (citrixWebRtcRedir) {
    case 1: {
      envDetector.innerText =
        "Citrix virtual environment is active, and Webrtc redirection is supported.";

      window.CitrixWebRTC.initUCSDK("Vendor");
      break;
    }

    case 0: {
      envDetector.innerText =
        "Citrix virtual environment is active, however, Webrtc redirection is not supported";
      break;
    }

    case -1: {
      envDetector.innerText =
        "Registry not found or Citrix virtual environment is not active";
      break;
    }
  }

  let remoteAudio,
    remoteIncomingAudio,
    outputDevice = "default";
  const setupOnAudioElementForCitrix = (call) => {
    // Listen for audio event. Triggers when the audio element
    // used for remote audio stream has been created.
    call.on("audio", (audioElement) => {
      // Remove any previous mapping
      if (remoteAudio) {
        CitrixWebRTC.disposeAudioElement(remoteAudio);
        remoteAudio = null;
      }
      // Map the audio element that was created for
      // remote audio stream as soon as it's available
      CitrixWebRTC.mapAudioElement(audioElement);

      audioElement.setSinkId("default");

      window.remoteAudioElement = remoteAudio = audioElement;
    });
  };

  const speakerDevices = document.getElementById("speaker-devices");
  const ringtoneDevices = document.getElementById("ringtone-devices");
  const outputVolumeBar = document.getElementById("output-volume");
  const setDefaultInputDeviceButton =
    document.getElementById("set-input-device");
  const inputVolumeBar = document.getElementById("input-volume");
  const volumeIndicators = document.getElementById("volume-indicators");
  const callButton = document.getElementById("button-call");
  const outgoingCallHangupButton = document.getElementById(
    "button-hangup-outgoing"
  );
  const callControlsDiv = document.getElementById("call-controls");
  const audioSelectionDiv = document.getElementById("output-selection");
  const getAudioDevicesButton = document.getElementById("get-devices");
  const logDiv = document.getElementById("log");
  const incomingCallDiv = document.getElementById("incoming-call");
  const incomingCallHangupButton = document.getElementById(
    "button-hangup-incoming"
  );
  const incomingCallAcceptButton = document.getElementById(
    "button-accept-incoming"
  );
  const incomingCallRejectButton = document.getElementById(
    "button-reject-incoming"
  );
  const phoneNumberInput = document.getElementById("phone-number");
  const incomingPhoneNumberEl = document.getElementById("incoming-number");
  const startupButton = document.getElementById("startup-button");

  let device;
  let token;

  // Event Listeners

  setDefaultInputDeviceButton.onclick = (e) => {
    e.preventDefault();
    if (device) {
      device.audio.setInputDevice("default", (err) => {
        log("Error setting input device: " + err.message);
      });
    } else {
      log("Device not initialized");
    }
  };

  callButton.onclick = (e) => {
    e.preventDefault();
    makeOutgoingCall();
  };
  getAudioDevicesButton.onclick = getAudioDevices;
  speakerDevices.addEventListener("change", updateOutputDevice);
  ringtoneDevices.addEventListener("change", updateRingtoneDevice);

  // SETUP STEP 1:
  // Browser client should be started after a user gesture
  // to avoid errors in the browser console re: AudioContext
  startupButton.addEventListener("click", startupClient);

  // SETUP STEP 2: Request an Access Token
  async function startupClient() {
    log("Requesting Access Token...");

    try {
      const data = await $.getJSON("/token");
      log("Got a token.");
      token = data.token;
      setClientNameUI(data.identity);
      intitializeDevice();
    } catch (err) {
      console.log(err);
      log("An error occurred. See your browser console for more information.");
    }
  }

  // SETUP STEP 3:
  // Instantiate a new Twilio.Device
  function intitializeDevice() {
    logDiv.classList.remove("hide");
    log("Initializing device");

    const deviceOptions = {
      logLevel: 1,
      // Set Opus as our preferred codec. Opus generally performs better, requiring less bandwidth and
      // providing better audio quality in restrained network conditions.
      codecPreferences: ["opus", "pcmu"],
    };

    if (citrixWebRtcRedir === 1) {
      const CitrixWebRTC = window.CitrixWebRTC;

      deviceOptions.enumerateDevices =
        CitrixWebRTC.enumerateDevices.bind(CitrixWebRTC);
      deviceOptions.getUserMedia = (...args) =>
        CitrixWebRTC.getUserMedia(...args);
      deviceOptions.RTCPeerConnection =
        CitrixWebRTC.CitrixPeerConnection.bind(CitrixWebRTC);
    }

    device = new Twilio.Device(token, deviceOptions);

    addDeviceListeners(device);

    // Device must be registered in order to receive incoming calls
    device.register();
  }

  // SETUP STEP 4:
  // Listen for Twilio.Device states
  function addDeviceListeners(device) {
    device.on("registered", function () {
      log("Twilio.Device Ready to make and receive calls!");
      callControlsDiv.classList.remove("hide");
    });

    device.on("error", function (error) {
      log("Twilio.Device Error: " + error.message);
    });

    device.on("incoming", handleIncomingCall);

    device.audio.on("deviceChange", updateAllAudioDevices.bind(device));

    // Show audio selection UI if it is supported by the browser.
    if (device.audio.isOutputSelectionSupported) {
      audioSelectionDiv.classList.remove("hide");
    }
  }

  // MAKE AN OUTGOING CALL

  async function makeOutgoingCall() {
    var params = {
      // get the phone number to call from the DOM
      To: phoneNumberInput.value,
    };

    if (device) {
      log(`Attempting to call ${params.To} ...`);

      // Twilio.Device.connect() returns a Call object
      const call = (window.call = await device.connect({
        params,
        rtcConfiguration: {
          // Needs explicit sdpSemantics and enableDtlsSrtp
          sdpSemantics: "unified",
          enableDtlsSrtp: true,
        },
      }));

      // Setup audio element for remote audio
      if (citrixWebRtcRedir === 1) setupOnAudioElementForCitrix(call);

      // add listeners to the Call
      // "accepted" means the call has finished connecting and the state is now "open"
      call.on("accept", updateUIAcceptedOutgoingCall);
      call.on("disconnect", updateUIDisconnectedOutgoingCall);
      call.on("cancel", updateUIDisconnectedOutgoingCall);

      outgoingCallHangupButton.onclick = () => {
        log("Hanging up ...");
        call.disconnect();
      };
    } else {
      log("Unable to make call.");
    }
  }

  function updateUIAcceptedOutgoingCall(call) {
    log("Call in progress ...");
    callButton.disabled = true;
    outgoingCallHangupButton.classList.remove("hide");
    volumeIndicators.classList.remove("hide");
    bindVolumeIndicators(call);
  }

  function updateUIDisconnectedOutgoingCall() {
    log("Call disconnected.");
    callButton.disabled = false;
    outgoingCallHangupButton.classList.add("hide");
    volumeIndicators.classList.add("hide");
  }

  // HANDLE INCOMING CALL

  function handleIncomingCall(call) {
    log(`Incoming call from ${call.parameters.From}`);

    // if (citrixWebRtcRedir === 1) {
    //   remoteIncomingAudio = new Audio(
    //     "https://sdk.twilio.com/js/client/sounds/releases/1.0.0/incoming.mp3"
    //   );

    //   window.CitrixWebRTC.mapAudioElement(remoteIncomingAudio);

    //   remoteIncomingAudio.setSinkId(remoteIncomingAudio);

    //   remoteIncomingAudio.setSinkId(outputDevice);

    //   remoteIncomingAudio.play();
    // }

    //show incoming call div and incoming phone number
    incomingCallDiv.classList.remove("hide");
    incomingPhoneNumberEl.innerHTML = call.parameters.From;

    //add event listeners for Accept, Reject, and Hangup buttons
    incomingCallAcceptButton.onclick = () => {
      acceptIncomingCall(call);
    };

    incomingCallRejectButton.onclick = () => {
      rejectIncomingCall(call);
    };

    incomingCallHangupButton.onclick = () => {
      hangupIncomingCall(call);
    };

    // add event listener to call object
    call.on("cancel", handleDisconnectedIncomingCall);
    call.on("disconnect", handleDisconnectedIncomingCall);
    call.on("reject", handleDisconnectedIncomingCall);
  }

  // ACCEPT INCOMING CALL

  function acceptIncomingCall(call) {
    if (citrixWebRtcRedir === 1) {
      setupOnAudioElementForCitrix(call);
      call.accept({
        rtcConfiguration: {
          // Needs explicit sdpSemantics and enableDtlsSrtp
          sdpSemantics: "unified",
          enableDtlsSrtp: true,
        },
      });
    } else {
      call.accept();
    }

    //update UI
    log("Accepted incoming call.");
    incomingCallAcceptButton.classList.add("hide");
    incomingCallRejectButton.classList.add("hide");
    incomingCallHangupButton.classList.remove("hide");
  }

  // REJECT INCOMING CALL

  function rejectIncomingCall(call) {
    call.reject();
    log("Rejected incoming call");
    resetIncomingCallUI();
  }

  // HANG UP INCOMING CALL

  function hangupIncomingCall(call) {
    call.disconnect();
    log("Hanging up incoming call");
    resetIncomingCallUI();
  }

  // HANDLE CANCELLED INCOMING CALL

  function handleDisconnectedIncomingCall() {
    log("Incoming call ended.");
    resetIncomingCallUI();
  }

  // MISC USER INTERFACE

  // Activity log
  function log(message) {
    logDiv.innerHTML += `<p class="log-entry">&gt;&nbsp; ${message} </p>`;
    logDiv.scrollTop = logDiv.scrollHeight;
  }

  function setClientNameUI(clientName) {
    var div = document.getElementById("client-name");
    div.innerHTML = `Your client name: <strong>${clientName}</strong>`;
  }

  function resetIncomingCallUI() {
    incomingPhoneNumberEl.innerHTML = "";
    incomingCallAcceptButton.classList.remove("hide");
    incomingCallRejectButton.classList.remove("hide");
    incomingCallHangupButton.classList.add("hide");
    incomingCallDiv.classList.add("hide");
  }

  // AUDIO CONTROLS

  async function getAudioDevices() {
    await (citrixWebRtcRedir === 1
      ? CitrixWebRTC.getUserMedia
      : navigator.mediaDevices.getUserMedia)({ audio: true });
    updateAllAudioDevices.bind(device);
  }

  function updateAllAudioDevices() {
    if (device) {
      updateDevices(speakerDevices, device.audio.speakerDevices.get());
      updateDevices(ringtoneDevices, device.audio.ringtoneDevices.get());
    }
  }

  function updateOutputDevice() {
    const selectedDevices = Array.from(speakerDevices.children)
      .filter((node) => node.selected)
      .map((node) => node.getAttribute("data-id"));

    outputDevice = selectedDevices[0];
    if (remoteAudio) remoteAudio.setSinkId(outputDevice);
  }

  function updateRingtoneDevice() {
    const selectedDevices = Array.from(ringtoneDevices.children)
      .filter((node) => node.selected)
      .map((node) => node.getAttribute("data-id"));

    device.audio.ringtoneDevices.set(selectedDevices);
  }

  function bindVolumeIndicators(call) {
    call.on("volume", function (inputVolume, outputVolume) {
      var inputColor = "red";
      if (inputVolume < 0.5) {
        inputColor = "green";
      } else if (inputVolume < 0.75) {
        inputColor = "yellow";
      }

      inputVolumeBar.style.width = Math.floor(inputVolume * 300) + "px";
      inputVolumeBar.style.background = inputColor;

      var outputColor = "red";
      if (outputVolume < 0.5) {
        outputColor = "green";
      } else if (outputVolume < 0.75) {
        outputColor = "yellow";
      }

      outputVolumeBar.style.width = Math.floor(outputVolume * 300) + "px";
      outputVolumeBar.style.background = outputColor;
    });
  }

  // Update the available ringtone and speaker devices
  function updateDevices(selectEl, selectedDevices) {
    selectEl.innerHTML = "";

    device.audio.availableOutputDevices.forEach(function (device, id) {
      var isActive = selectedDevices.size === 0 && id === "default";
      selectedDevices.forEach(function (device) {
        if (device.deviceId === id) {
          isActive = true;
        }
      });

      var option = document.createElement("option");
      option.label = device.label;
      option.setAttribute("data-id", id);
      if (isActive) {
        option.setAttribute("selected", "selected");
      }
      selectEl.appendChild(option);
    });
  }
});

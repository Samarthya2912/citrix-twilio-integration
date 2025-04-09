<img width="1840" alt="image" src="https://github.com/user-attachments/assets/55fb780a-ac48-4958-aa67-b729ae17e34e" /># Pre-requisites
1. Browser Citrix Environment
2. Neecessary setup to enable WebRTC redirection as per UCSDK docs

# Setup
1.  Clone repo
2.  `yarn` to install package
3.  `yarn start` to launch application on localhost:3000.
4.  If you're starting this app on localhost, you can use any reverse proxy like `ngrok` to expose to a global URL and access inside a Citrix environment.
5.  If everything is setup correctly, you'll see this under 'Your Device Info'
   <img width="1840" alt="image" src="https://github.com/user-attachments/assets/847fdc23-fdca-4a03-b75c-4bc1c010ae25" />


# Scenario #1: 
1. Start up the device > Enter a phone number or client name > Make a call. This scenario works as expected.

# Scenario #2:
1.  Start up the device > Click on 'Set input device' > Enter a phone number or client name > Make a call. Clicking on 'Set input device' button sets 'default' as the input device id on TW device instance.

Logs: 
On setting input device: 

<img width="633" alt="image" src="https://github.com/user-attachments/assets/61452f67-4d06-4aed-8e9e-fe6eee3275e4" />

On making a call: 

<img width="805" alt="image" src="https://github.com/user-attachments/assets/753d5441-9c41-4d93-9574-238a2ce44e0c" />

# Issue
After calling device.audio.setInputDevice(inputDeviceId) on a Twilio Device, we’re getting this error in the above screenshot and hence unable to accept WebRTC invite.

# Possible reason

lib/twilio/call.ts:701: 
```
    const inputStream = typeof this._options.getInputStream === 'function' && this._options.getInputStream();
    const promise = inputStream
      ? this._mediaHandler.setInputTracksFromStream(inputStream)
      : this._mediaHandler.openDefaultDeviceWithConstraints(audioConstraints);
 ```
     
Seems when we set an input device, we acquire stream from that device and pass a getInputStream util to acquire the it. Now, since we don’t want to mutate the stream in anyway, we clone to a new stream object, as described below.

At lib/twilio/rtc/peerconnection.ts:130: 
`this._setInputTracksFromStream(true, stream)` -> true indicates that stream has to be cloned
This calls this._setInputTracksForUnifiedPlan(shouldClone, newStream) at line 273, as we are using unified SDP semantics for Citrix

This calls the cloneStream util, now this util seems to instantiate a new MediaStream object and add tracks to it, but possibly when we do getAudioTracks on a Citrix RemoteStream object, the tracks returned are instances of a class that Citrix internally uses to represent tracks and not the native MediaStreamTrack class.

```
function cloneStream(oldStream) {
  const newStream = typeof MediaStream !== 'undefined'
    ? new MediaStream()
    : new webkitMediaStream();
  oldStream.getAudioTracks().forEach(newStream.addTrack, newStream);
  return newStream;
}
```

# Possible solution
Citrix provides a `createMediaStream([track])` that maybe used to create a remote media stream. But we'll also have to dispose this stream when no longer in use.

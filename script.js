import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

const demosSection = document.getElementById("demos");

let handLandmarker = undefined;
let runningMode = "IMAGE";
let enableWebcamButton;
let webcamRunning = false;

// --------------------------------------------------
// Tone.js Setup
// --------------------------------------------------
let audioStarted = false; 
let synth; // PolySynth to allow multiple notes together

// A scale array with 15 notes; we'll give each finger 5 of these
// (Adjust to any notes/scale you like)
const bigScale = [
    "C4", "D4", "E4", "F4", "G4",
    "A4", "B4", "C5", "D5", "E5",
    "F5", "G5", "A5", "B5", "C6"
];

// Only track these three fingertips: thumb (4), index (8), middle (12)
const fingerTipIndices = [4, 8, 12];

// Track last trigger time and last note index for each fingertip
let fingerLastTriggerTime = { 4: 0, 8: 0, 12: 0 };
let fingerLastNoteIndex   = { 4: -1, 8: -1, 12: -1 };
const minNoteInterval = 0.25; // 250ms minimum gap per finger

/**
 * Create the HandLandmarker instance
 */
const createHandLandmarker = async () => {
    const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );

    handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
        delegate: "GPU"
    },
    runningMode: runningMode,
    numHands: 1
    });

    demosSection.classList.remove("invisible");
};
createHandLandmarker();

/**
 * DOM elements for webcam & canvas
 */
const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");

// Check if webcam is supported.
const hasGetUserMedia = () => !!(navigator.mediaDevices?.getUserMedia);

// If webcam is supported, set up button.
if (hasGetUserMedia()) {
    enableWebcamButton = document.getElementById("webcamButton");
    enableWebcamButton.addEventListener("click", enableCam);
} else {
    console.warn("getUserMedia() is not supported by your browser");
}

/**
 * Enable/disable the live webcam and start detection
 */
// async function enableCam() {
//   if (!handLandmarker) {
//     console.log("Wait! HandLandmarker not loaded yet.");
//     return;
//   }

//   webcamRunning = !webcamRunning;
//   enableWebcamButton.innerText = webcamRunning
//     ? "DISABLE PREDICTIONS"
//     : "ENABLE PREDICTIONS";

//   // When turning predictions on, start the audio context + create the synth
//   if (webcamRunning && !audioStarted) {
//     await Tone.start(); // must be called in a user gesture
//     audioStarted = true;

//     // Create a polyphonic synth so multiple notes can overlap
//     synth = new Tone.PolySynth(Tone.Synth, {
//       oscillator: { type: "triangle" },
//       envelope: { attack: 0.05, decay: 0.2, sustain: 0.4, release: 0.8 }
//     }).toDestination();
//   }

//   // If turning predictions off, stop the video stream
//   if (!webcamRunning && video.srcObject) {
//     video.srcObject.getTracks().forEach(track => track.stop());
//     video.srcObject = null;
//   }

//   // getUsermedia parameters
//   const constraints = { video: true };

//   // Activate the webcam stream if enabling
//   if (webcamRunning) {
//     navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
//       video.srcObject = stream;
//       video.addEventListener("loadeddata", predictWebcam);
//     });
//   }
// }

async function enableCam() {
    if (!handLandmarker) {
        console.log("Wait! HandLandmarker not loaded yet.");
        return;
    }
    
    webcamRunning = !webcamRunning;
    
    // When turning predictions on, start the audio context + create the synth
    if (webcamRunning && !audioStarted) {
        await Tone.start(); // must be called in a user gesture
        audioStarted = true;
    
        // Create a polyphonic synth so multiple notes can overlap
        synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.05, decay: 0.2, sustain: 0.4, release: 0.8 }
        }).toDestination();
    }
    
    // If turning predictions off, stop the video stream
    if (!webcamRunning && video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    
    // getUsermedia parameters
    const constraints = { video: true };
    
    // Activate the webcam stream if enabling
    if (webcamRunning) {
        navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
        video.srcObject = stream;
        video.addEventListener("loadeddata", predictWebcam);
    
        // Hide the enable webcam button after enabling the webcam
        enableWebcamButton.style.display = "none";
        });
    }
}

let lastVideoTime = -1;
let results = undefined;

/**
 * Main detection loop for the webcam
 */
async function predictWebcam() {
    canvasElement.style.width = video.videoWidth + "px";
    canvasElement.style.height = video.videoHeight + "px";
    canvasElement.width = video.videoWidth;
    canvasElement.height = video.videoHeight;

    if (runningMode === "IMAGE") {
    runningMode = "VIDEO";
    await handLandmarker.setOptions({ runningMode: "VIDEO" });
    }

    const startTimeMs = performance.now();
    if (lastVideoTime !== video.currentTime) {
    lastVideoTime = video.currentTime;
    // Perform hand landmark detection
    results = handLandmarker.detectForVideo(video, startTimeMs);
    }

    // Draw the webcam feed first
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);

    // If landmarks detected, process them
    if (results.landmarks) {
    for (const landmarks of results.landmarks) {
        // Draw ONLY the three fingertips we care about
        drawSelectedFingertips(landmarks);

        // Music logic for each of the three fingertips
        for (let i = 0; i < fingerTipIndices.length; i++) {
        const tipIndex = fingerTipIndices[i];
        const fingertip = landmarks[tipIndex];
        if (fingertip && synth) {
            handleFingertipMusic(fingertip, tipIndex, i);
        }
        }
    }
    }

    canvasCtx.restore();

    // Continue predictions if webcam is still running
    if (webcamRunning) {
    window.requestAnimationFrame(predictWebcam);
    }
}

/**
 * Convert fingertip.x -> a note in `bigScale`, subdivided among 3 fingers.
 */
function handleFingertipMusic(fingertip, tipIndex, fingerArrayIndex) {
    const now = Tone.now();

    // Each finger gets a subrange of bigScale. 
    // If we have 15 notes total and 3 fingers, each can have 5 notes.
    const notesPerFinger = 5;
    const startIndex = fingerArrayIndex * notesPerFinger;
    let endIndex = startIndex + notesPerFinger - 1;
    
    if (endIndex >= bigScale.length) {
        endIndex = bigScale.length - 1;
    }
    const fingerScale = bigScale.slice(startIndex, endIndex + 1);

    // Map fingertip.x [0..1] -> index in fingerScale
    let noteIdx = Math.floor(fingertip.x * fingerScale.length);
    if (noteIdx < 0) noteIdx = 0;
    if (noteIdx >= fingerScale.length) noteIdx = fingerScale.length - 1;

    // Play a new note only if it's changed and enough time has passed
    if (
    noteIdx !== fingerLastNoteIndex[tipIndex] &&
    (now - fingerLastTriggerTime[tipIndex]) > minNoteInterval
    ) {
        const note = fingerScale[noteIdx];
        synth.triggerAttackRelease(note, "8n", now);
        fingerLastNoteIndex[tipIndex] = noteIdx;
        fingerLastTriggerTime[tipIndex] = now;
    }
}

/**
 * Only draw the three fingertip landmarks [4, 8, 12].
 */
function drawSelectedFingertips(landmarks) {
    for (const tipIndex of fingerTipIndices) {
        const point = landmarks[tipIndex];
        if (point) {
            canvasCtx.beginPath();
            canvasCtx.arc(
            point.x * canvasElement.width,
            point.y * canvasElement.height,
            5, 0, 2 * Math.PI
            );
            canvasCtx.fillStyle = "#FF0000";
            canvasCtx.fill();
        }
    }
}
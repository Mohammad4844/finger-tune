import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

const demosSection = document.getElementById("demos");
const musicStyle = document.getElementById("music-style");
const soundDensity = document.getElementById("soundDensity")

let handLandmarker = undefined;
let runningMode = "IMAGE";
let enableWebcamButton;
let webcamRunning = false;

// --------------------------------------------------
// Tone.js Setup
// --------------------------------------------------
let audioStarted = false; 
let synth; // PolySynth to allow multiple notes together

// Default to PolySynth
synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.05, decay: 0.2, sustain: 0.4, release: 0.8 }
}).toDestination();

// Event listener for music style changes
musicStyle.addEventListener("change", (event) => {
    const selectedStyle = event.target.value;
    switch (selectedStyle) {
        case "polySynth":
            synth = new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: "triangle" },
                envelope: { attack: 0.05, decay: 0.2, sustain: 0.4, release: 0.8 }
            }).toDestination();
            break;
        case "synth":
            synth = new Tone.Synth({
                oscillator: { type: "square" },
                envelope: { attack: 0.1, decay: 0.2, sustain: 0.3, release: 1.0 }
            }).toDestination();
            break;
        case "duoSynth":
            synth = new Tone.DuoSynth().toDestination();
            break;
        case "membraneSynth":
            synth = new Tone.MembraneSynth().toDestination();
            break;
        default:
            synth = new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: "triangle" },
                envelope: { attack: 0.05, decay: 0.2, sustain: 0.4, release: 0.8 }
            }).toDestination();
    }
});

const bigScale = [
    "C4", "D4", "E4", "F4", "G4",
    "A4", "B4", "C5", "D5", "E5",
    "F5", "G5", "A5", "B5", "C6",
    "D6", "E6", "F6", "G6", "A6", 
    "B6", "C7", "D7", "E7", "F7",
    "G7", "A7", "B7", "C8", "D8"
];

let currentDensity = 3;
soundDensity.addEventListener('change', updateSoundDensity);
function updateSoundDensity() {
    currentDensity = parseInt(soundDensity.value, 10);
}

// Only track these three fingertips: thumb (4), index (8), middle (12)
const fingerTipIndices = [4, 8, 12, 16, 20];

// Track last trigger time and last note index for each fingertip
let fingerLastTriggerTime = { 4: 0, 8: 0, 12: 0, 16: 0, 20: 0 };
let fingerLastNoteIndex   = { 4: -1, 8: -1, 12: -1, 16: -1, 20: 0 };
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
// function handleFingertipMusic(fingertip, tipIndex, fingerArrayIndex) {
//     const now = Tone.now();

//     // Each finger gets a subrange of bigScale. 
//     // If we have 15 notes total and 3 fingers, each can have 5 notes.
//     // const notesPerFinger = 5;
//     const notesPerFinger = currentDensity; // Dynamically adjust based on sound density
//     const startIndex = fingerArrayIndex * notesPerFinger;
//     let endIndex = startIndex + notesPerFinger - 1;
    
//     if (endIndex >= bigScale.length) {
//         endIndex = bigScale.length - 1;
//     }
//     const fingerScale = bigScale.slice(startIndex, endIndex + 1);

//     // Map fingertip.x [0..1] -> index in fingerScale
//     let noteIdx = Math.floor(fingertip.x * fingerScale.length);
//     if (noteIdx < 0) noteIdx = 0;
//     if (noteIdx >= fingerScale.length) noteIdx = fingerScale.length - 1;

//     // Play a new note only if it's changed and enough time has passed
//     if (
//     noteIdx !== fingerLastNoteIndex[tipIndex] &&
//     (now - fingerLastTriggerTime[tipIndex]) > minNoteInterval
//     ) {
//         const note = fingerScale[noteIdx];
//         synth.triggerAttackRelease(note, "8n", now);
//         fingerLastNoteIndex[tipIndex] = noteIdx;
//         fingerLastTriggerTime[tipIndex] = now;
//     }
// }

// function handleFingertipMusic(fingertip, tipIndex, fingerArrayIndex) {
//     const now = Tone.now();

//     // Each finger gets a subrange of bigScale. 
//     const notesPerFinger = currentDensity; // Dynamically adjust based on sound density
//     const startIndex = fingerArrayIndex * notesPerFinger;
//     let endIndex = startIndex + notesPerFinger - 1;
    
//     if (endIndex >= bigScale.length) {
//         endIndex = bigScale.length - 1;
//     }
//     const fingerScale = bigScale.slice(startIndex, endIndex + 1);

//     // Map fingertip.x [0..1] -> index in fingerScale
//     let noteIdx = Math.floor(fingertip.x * fingerScale.length);
//     if (noteIdx < 0) noteIdx = 0;
//     if (noteIdx >= fingerScale.length) noteIdx = fingerScale.length - 1;

//     // Play a new note only if it's changed and enough time has passed
//     if (
//     noteIdx !== fingerLastNoteIndex[tipIndex] &&
//     (now - fingerLastTriggerTime[tipIndex]) > minNoteInterval
//     ) {
//         const note = fingerScale[noteIdx];

//         // Add a small offset to the start time to ensure it is strictly greater
//         const adjustedStartTime = now + 0.1;  // Add a small offset

//         synth.triggerAttackRelease(note, "8n", adjustedStartTime);
//         fingerLastNoteIndex[tipIndex] = noteIdx;
//         fingerLastTriggerTime[tipIndex] = adjustedStartTime;
//     }
// }

async function handleFingertipMusic(fingertip, tipIndex, fingerArrayIndex) {
    const now = Tone.now();

    // Each finger gets a subrange of bigScale. 
    const notesPerFinger = currentDensity; // Dynamically adjust based on sound density
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

    // Only play if the note has changed and enough time has passed
    if (
    noteIdx !== fingerLastNoteIndex[tipIndex] &&
    (now - fingerLastTriggerTime[tipIndex]) > minNoteInterval
    ) {
        const note = fingerScale[noteIdx];

        // Wait for a short delay to ensure the timing is strictly greater
        await waitForNextNote(tipIndex, now);

        // Play the note
        synth.triggerAttackRelease(note, "8n", Tone.now());  // Trigger at the current time (with a small offset)
        
        fingerLastNoteIndex[tipIndex] = noteIdx;
        fingerLastTriggerTime[tipIndex] = Tone.now();
    }
}

// Helper async function to introduce a slight delay
async function waitForNextNote(tipIndex, lastTriggerTime) {
    const now = Tone.now();
    const timeDifference = now - lastTriggerTime;
    
    // If the last note was triggered too recently, wait a little while
    if (timeDifference < minNoteInterval) {
        const delayTime = minNoteInterval - timeDifference;
        // Use a delay to ensure the next note is played at the right time
        await new Promise(resolve => setTimeout(resolve, delayTime * 1000));  // Delay is in seconds, convert to ms
    }
}


/*
 * Only draw the fingertips based on the current soundDensity.
 */
function drawSelectedFingertips(landmarks) {
    // Loop through the number of fingertips to draw, based on the current sound density
    for (let i = 0; i < Math.min(currentDensity, fingerTipIndices.length); i++) {
        const tipIndex = fingerTipIndices[i];
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
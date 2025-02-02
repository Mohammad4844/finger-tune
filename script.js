import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

const demosSection = document.getElementById("demos");
const musicStyle = document.getElementById("music-style");
const soundDensity = document.getElementById("soundDensity");

let handLandmarker = undefined;
let runningMode = "IMAGE";
let enableWebcamButton;
let webcamRunning = false;

// --------------------------------------------------
// Tone.js and Visualization Setup
// --------------------------------------------------
let audioStarted = false; 
let synth; // PolySynth to allow multiple notes together

// Visualization variables
const fingerVelocities = { 4: 0, 8: 0, 12: 0, 16: 0, 20: 0 };
const lastFingerPositions = { 4: null, 8: null, 12: null, 16: null, 20: null };
const velocityHistory = [];
const HISTORY_SIZE = 5;
const WAVE_SPEED = 500;
const WAVE_SPACING = 0.1;
const MAX_VELOCITY = 0.001;    // Reduced from 0.1 to make it less sensitive
const VELOCITY_DECAY = 0.01;   // Increased decay to reduce lingering effects
const WAVE_AMPLITUDE = 0.3;   // New constant to control wave height (reduced from 0.5)
const MIN_HEIGHT = 1;         // Minimum bar height in percent
const MAX_HEIGHT = 40;        // Maximum bar height in percent (reduced from 100)
let analyser;

// Default to PolySynth with max polyphony
synth = new Tone.PolySynth({
    maxPolyphony: 32,
    voice: Tone.Synth,
    options: {
        oscillator: { type: "triangle" },
        envelope: {
            attack: 0.05,
            decay: 0.2,
            sustain: 0.2,
            release: 0.2
        }
    }
}).toDestination();

// Event listener for music style changes
musicStyle.addEventListener("change", (event) => {
    const selectedStyle = event.target.value;
    
    // Disconnect old synth and release all notes
    if (synth) {
        synth.releaseAll();
        synth.disconnect();
    }
    
    switch (selectedStyle) {
        case "polySynth":
            synth = new Tone.PolySynth({
                maxPolyphony: 32,
                voice: Tone.Synth,
                options: {
                    oscillator: { type: "triangle" },
                    envelope: {
                        attack: 0.05,
                        decay: 0.2,
                        sustain: 0.2,
                        release: 0.2
                    }
                }
            });
            break;
        case "synth":
            synth = new Tone.Synth({
                oscillator: { type: "square" },
                envelope: {
                    attack: 0.05,
                    decay: 0.2,
                    sustain: 0.2,
                    release: 0.2
                }
            });
            break;
        case "duoSynth":
            synth = new Tone.DuoSynth({
                vibratoAmount: 0.5,
                vibratoRate: 5,
                harmonicity: 1.5,
                voice0: {
                    envelope: {
                        attack: 0.05,
                        decay: 0.2,
                        sustain: 0.2,
                        release: 0.2
                    }
                },
                voice1: {
                    envelope: {
                        attack: 0.05,
                        decay: 0.2,
                        sustain: 0.2,
                        release: 0.2
                    }
                }
            });
            break;
        case "membraneSynth":
            synth = new Tone.MembraneSynth({
                envelope: {
                    attack: 0.05,
                    decay: 0.2,
                    sustain: 0.2,
                    release: 0.2
                }
            });
            break;
        default:
            synth = new Tone.PolySynth({
                maxPolyphony: 32,
                voice: Tone.Synth,
                options: {
                    oscillator: { type: "triangle" },
                    envelope: {
                        attack: 0.05,
                        decay: 0.2,
                        sustain: 0.2,
                        release: 0.2
                    }
                }
            });
    }
    
    // After creating new synth, connect to both analyzer and destination
    if (analyser) {
        synth.connect(analyser);
        synth.toDestination();
    } else {
        synth.toDestination();
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

// Fingertip tracking
const fingerTipIndices = [4, 8, 12, 16, 20];
let fingerLastTriggerTime = { 4: 0, 8: 0, 12: 0, 16: 0, 20: 0 };
let fingerLastNoteIndex = { 4: -1, 8: -1, 12: -1, 16: -1, 20: -1 };
const minNoteInterval = 0.15;
const NOTE_DURATION = "32n";
const NOTE_RELEASE_DELAY = 10;

// Visualization functions
function updateFingerVelocity(fingertip, tipIndex) {
    if (lastFingerPositions[tipIndex]) {
        const dx = fingertip.x - lastFingerPositions[tipIndex].x;
        const dy = fingertip.y - lastFingerPositions[tipIndex].y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        fingerVelocities[tipIndex] = (fingerVelocities[tipIndex] * 0.8) + (distance * 0.2);
    }
    lastFingerPositions[tipIndex] = { x: fingertip.x, y: fingertip.y };
}

function updateVisualizer() {
    let totalVelocity = 0;
    let activeFingers = 0;
    
    for (let i = 0; i < Math.min(currentDensity, fingerTipIndices.length); i++) {
        const tipIndex = fingerTipIndices[i];
        if (fingerVelocities[tipIndex] > 0.001) {  // Only count if velocity is significant
            totalVelocity += fingerVelocities[tipIndex];
            activeFingers++;
        }
    }

    velocityHistory.push(totalVelocity);
    if (velocityHistory.length > HISTORY_SIZE) {
        velocityHistory.shift();
    }

    // More aggressive decay of velocity history when no active fingers
    if (activeFingers === 0) {
        velocityHistory.forEach((_, index) => {
            velocityHistory[index] *= VELOCITY_DECAY;
        });
    }

    const avgVelocity = velocityHistory.reduce((a, b) => a + b, 0) / velocityHistory.length;
    
    const bars = document.getElementsByClassName('visualizer-bar');
    for (let i = 0; i < bars.length; i++) {
        const wave = Math.sin(Date.now() / WAVE_SPEED + i * WAVE_SPACING) * WAVE_AMPLITUDE + WAVE_AMPLITUDE;
        
        // More controlled scaling
        let height = wave * (avgVelocity / MAX_VELOCITY) * Math.min(1.5, activeFingers);
        
        // Ensure bars go to minimum when no movement
        if (activeFingers === 0 && avgVelocity < 0.001) {
            height = MIN_HEIGHT / 100;  // Convert to decimal for multiplication
        }
        
        height = Math.max(height * MAX_HEIGHT, MIN_HEIGHT);
        height = Math.min(height, MAX_HEIGHT);
        
        bars[i].style.height = `${height}%`;
        
        // Adjust color based on activity
        const hue = 200 + (avgVelocity / MAX_VELOCITY) * 60;
        const saturation = 60 + activeFingers * 5;
        bars[i].style.backgroundColor = `hsl(${hue}, ${saturation}%, 50%)`;
    }
    
    requestAnimationFrame(updateVisualizer);
}
// HandLandmarker setup
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

// Webcam setup
const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");

const hasGetUserMedia = () => !!(navigator.mediaDevices?.getUserMedia);

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
    
    if (webcamRunning && !audioStarted) {
        await Tone.start();
        audioStarted = true;
        
        // Create the analyzer first
        analyser = new Tone.Analyser('waveform', 32);
        
        // Create and connect the synth
        synth = new Tone.PolySynth({
            maxPolyphony: 32,
            voice: Tone.Synth,
            options: {
                oscillator: { type: "triangle" },
                envelope: {
                    attack: 0.05,
                    decay: 0.2,
                    sustain: 0.2,
                    release: 0.2
                }
            }
        });
        
        // Connect synth to both analyzer and destination
        synth.connect(analyser);
        synth.toDestination();
        
        // Start visualization
        requestAnimationFrame(updateVisualizer);
    }
    
    if (!webcamRunning && video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    
    const constraints = { video: true };
    
    if (webcamRunning) {
        navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
            video.srcObject = stream;
            video.addEventListener("loadeddata", predictWebcam);
            enableWebcamButton.style.display = "none";
        });
    }
}

let lastVideoTime = -1;
let results = undefined;

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
        results = handLandmarker.detectForVideo(video, startTimeMs);
    }

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);

    if (results.landmarks) {
        for (const landmarks of results.landmarks) {
            drawSelectedFingertips(landmarks);

            for (let i = 0; i < fingerTipIndices.length; i++) {
                const tipIndex = fingerTipIndices[i];
                const fingertip = landmarks[tipIndex];
                if (fingertip && synth) {
                    handleFingertipMusic(fingertip, tipIndex, i);
                }
            }
        }
    }

    // Decay velocities for inactive fingers
    for (const tipIndex of fingerTipIndices) {
        if (!lastFingerPositions[tipIndex]) {
            fingerVelocities[tipIndex] *= VELOCITY_DECAY;
        }
    }

    canvasCtx.restore();

    if (webcamRunning) {
        window.requestAnimationFrame(predictWebcam);
    }
}

async function handleFingertipMusic(fingertip, tipIndex, fingerArrayIndex) {
    updateFingerVelocity(fingertip, tipIndex);
    
    const now = Tone.now();
    const notesPerFinger = currentDensity;
    const startIndex = fingerArrayIndex * notesPerFinger;
    let endIndex = startIndex + notesPerFinger - 1;
    
    if (endIndex >= bigScale.length) {
        endIndex = bigScale.length - 1;
    }
    const fingerScale = bigScale.slice(startIndex, endIndex + 1);

    let noteIdx = Math.floor(fingertip.x * fingerScale.length);
    noteIdx = Math.max(0, Math.min(noteIdx, fingerScale.length - 1));

    if (
        noteIdx !== fingerLastNoteIndex[tipIndex] &&
        (now - fingerLastTriggerTime[tipIndex]) > minNoteInterval
    ) {
        const note = fingerScale[noteIdx];
        
        try {
            if (fingerLastNoteIndex[tipIndex] >= 0) {
                const prevNote = fingerScale[fingerLastNoteIndex[tipIndex]];
                synth.triggerRelease(prevNote);
            }
            
            await new Promise(resolve => setTimeout(resolve, NOTE_RELEASE_DELAY));
            
            synth.triggerAttackRelease(note, NOTE_DURATION);
            
            fingerLastNoteIndex[tipIndex] = noteIdx;
            fingerLastTriggerTime[tipIndex] = now;
        } catch (error) {
            console.warn('Note playback error:', error);
        }
    }
}

function drawSelectedFingertips(landmarks) {
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
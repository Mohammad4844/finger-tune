import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

// Debug logging function
function debugLog(context, message, data = null) {
    const log = `[${context}] ${message}`;
    if (data) {
        console.log(log, data);
    } else {
        console.log(log);
    }
}

debugLog('Init', 'Starting script initialization');

// Game state variables
let gameActive = false;
let squares = [];
let squareSpawnInterval = null;
let score = 0;

const SQUARE_LIFETIME = 3000; // 3 seconds
const SPAWN_FREQUENCY = 1500; // New square every 1.5 seconds

const demosSection = document.getElementById("demos");
debugLog('DOM', 'Demo section element:', demosSection);

let handLandmarker = undefined;
let runningMode = "IMAGE";
let enableWebcamButton;
let webcamRunning = false;

// Add these variables at the top with your other globals
let countdownActive = false;
let countdownValue = 3;

// --------------------------------------------------
// Tone.js Setup
// --------------------------------------------------
let audioStarted = false;
let synth;

const bigScale = [
    "C4", "D4", "E4", "F4", "G4",
    "A4", "B4", "C5", "D5", "E5",
    "F5", "G5", "A5", "B5", "C6"
];

const fingerTipIndices = [4, 8, 12,16,20];
let fingerLastTriggerTime = { 4: 0, 8: 0, 12: 0 };
let fingerLastNoteIndex = { 4: -1, 8: -1, 12: -1 };
const minNoteInterval = 0.25;

// Add difficulty settings
const DIFFICULTY_SETTINGS = {
    easy: {
      spawnFrequency: 2000,
      squareSize: { min: 50, max: 80 },
      squareLifetime: 4000,
      music: {
        file: "music/dance_off/Senorita.mp3" // or a valid URL/path to your audio file
      }
    },
    medium: {
      spawnFrequency: 1500,
      squareSize: { min: 40, max: 60 },
      squareLifetime: 3000,
      music: {
        file: "music/dance_off/CountingStars.mp3"
      }
    },
    hard: {
      spawnFrequency: 1000,
      squareSize: { min: 30, max: 40 },
      squareLifetime: 2000,
      music: {
        file: "music/dance_off/Greedy.mp3"
      }
    }
  };
  

// Difficulty
let currentDifficulty = 'medium';
let bgMusic = null;
// Initialize difficulty buttons
const easyButton = document.getElementById('easyButton');
const mediumButton = document.getElementById('mediumButton');
const hardButton = document.getElementById('hardButton');

// Add event listeners for difficulty buttons
if (easyButton && mediumButton && hardButton) {
    easyButton.addEventListener('click', () => setDifficulty('easy'));
    mediumButton.addEventListener('click', () => setDifficulty('medium'));
    hardButton.addEventListener('click', () => setDifficulty('hard'));
}


// Create the HandLandmarker instance
const createHandLandmarker = async () => {
    debugLog('MediaPipe', 'Initializing HandLandmarker');
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

    debugLog('MediaPipe', 'HandLandmarker initialized successfully');
    demosSection.classList.remove("invisible");
};

createHandLandmarker().catch(error => {
    debugLog('Error', 'Failed to initialize HandLandmarker:', error);
});

// Initialize game button
debugLog('Game', 'Setting up game button');
const startGameButton = document.getElementById("startGameButton");
if (startGameButton) {
    debugLog('Game', 'Found start game button, adding click listener');
    startGameButton.addEventListener("click", () => {
        debugLog('Game', 'Game button clicked');
        handleGameStart();
    });
} else {
    debugLog('Error', 'Could not find start game button!');
}

// A reference to the toggle button
const handToggleButton = document.getElementById('handToggleButton');

// We'll store a flag to indicate if we are in "double hands" mode
let isDoubleHands = false;

// Listen for click
handToggleButton.addEventListener('click', async () => {
    isDoubleHands = !isDoubleHands;
    
    // Update the text on the button
    if (isDoubleHands) {
      handToggleButton.innerText = 'Single Hand';
      await handLandmarker.setOptions({ numHands: 2 }); 
    } else {
      handToggleButton.innerText = 'Double Hands';
      await handLandmarker.setOptions({ numHands: 1 });
    }
  });

// DOM elements setup
const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");

// Combo Variables
let comboCount = 0;         // current combo streak
let showCombo = false;      // whether we are currently showing combo text
let comboMessage = "";      // the string to display (e.g., "3 COMBO!")
let comboStartTime = 0;     // when we started showing the combo
const COMBO_DISPLAY_TIME = 2000;  // how long to display combo text (ms)

debugLog('DOM', 'Video and canvas elements initialized', {
    video: !!video,
    canvas: !!canvasElement,
    context: !!canvasCtx
});

// Check if webcam is supported
const hasGetUserMedia = () => !!(navigator.mediaDevices?.getUserMedia);

if (hasGetUserMedia()) {
    enableWebcamButton = document.getElementById("webcamButton");
    if (enableWebcamButton) {
        debugLog('Webcam', 'Adding webcam button listener');
        enableWebcamButton.addEventListener("click", enableCam);
    }
} else {
    debugLog('Error', 'getUserMedia() is not supported by your browser');
}

function handleGameStart() {
  debugLog('Game', 'handleGameStart called');
  gameActive = !gameActive;
  debugLog('Game', `Game state changed to: ${gameActive ? 'active' : 'inactive'}`);
  
  // Add this line to explicitly check the game state
  console.log('Game state:', gameActive);
  
  if (gameActive) {
      debugLog('Game', 'Calling startGame function');
      startGame();
  } else {
      debugLog('Game', 'Calling stopGame function');
      stopGame();
  }
}

// Background music handling
function startBackgroundMusic(musicSettings) {
    // If there's already a song playing, stop it
    if (bgMusic) {
      bgMusic.pause();
      bgMusic.currentTime = 0;
    }
  
    // Create a new audio element for the chosen difficulty
    if (musicSettings && musicSettings.file) {
      bgMusic = new Audio(musicSettings.file);
      bgMusic.loop = true;        // Loop the music
      bgMusic.volume = 1.0;       // Adjust volume if you like
      bgMusic.play().catch(err => {
        console.warn("Cannot auto-play music:", err);
      });
    }
  }

// Array of colors for squares
const SQUARE_COLORS = [
    { fill: 'rgba(255, 0, 0, 0.4)', stroke: 'rgba(255, 0, 0, 1)' },    // Red
    { fill: 'rgba(0, 255, 0, 0.4)', stroke: 'rgba(0, 255, 0, 1)' },    // Green
    { fill: 'rgba(0, 0, 255, 0.4)', stroke: 'rgba(0, 0, 255, 1)' },    // Blue
    { fill: 'rgba(255, 255, 0, 0.4)', stroke: 'rgba(255, 255, 0, 1)' }, // Yellow
    { fill: 'rgba(255, 0, 255, 0.4)', stroke: 'rgba(255, 0, 255, 1)' }, // Magenta
    { fill: 'rgba(0, 255, 255, 0.4)', stroke: 'rgba(0, 255, 255, 1)' }  // Cyan
];

// Function to set difficulty
function setDifficulty(difficulty) {
    currentDifficulty = difficulty;
    console.log(`Difficulty set to: ${difficulty}`);
    
    // Update button appearances
    [easyButton, mediumButton, hardButton].forEach(button => {
        button.style.opacity = '0.7';
    });
    
    // Highlight selected difficulty
    const selectedButton = {
        'easy': easyButton,
        'medium': mediumButton,
        'hard': hardButton
    }[difficulty];
    
    if (selectedButton) {
        selectedButton.style.opacity = '1';
    }
}
setDifficulty('medium');

// Update startGame function to handle settings properly
function startGame() {
    debugLog('Game', 'Starting game sequence');
    const settings = DIFFICULTY_SETTINGS[currentDifficulty];
    
    if (!settings) {
        console.error('Invalid difficulty settings');
        return;
    }

    countdownActive = true;
    countdownValue = 2;
    startGameButton.disabled = true;

    debugLog('Game', `Starting countdown with ${currentDifficulty} difficulty`);

    // Start the countdown
    const countdownInterval = setInterval(() => {
        debugLog('Game', `Countdown: ${countdownValue}`);
        
        if (countdownValue <= 0) {
            clearInterval(countdownInterval);
            countdownActive = false;
            startGameButton.disabled = false;
            initializeGame(settings);
        }
        countdownValue--;
    }, 1000);
}

// Fixed initializeGame function
function initializeGame(settings) {
    debugLog('Game', 'Initializing game with settings:', settings);
    
    // Clear any existing state
    if (squareSpawnInterval) {
        clearInterval(squareSpawnInterval);
    }
    if (bgMusic) {
        bgMusic.stop();
        Tone.Transport.stop();
    }

    gameActive = true;
    score = 0;
    squares = [];
    startGameButton.innerText = "Stop Game";

    // Initialize audio context if needed
    if (!audioStarted) {
        try {
            Tone.start();
            audioStarted = true;
            debugLog('Audio', 'Audio context initialized');
        } catch (error) {
            debugLog('Error', 'Failed to initialize audio:', error);
        }
    }

    // Start background music
    try {
        startBackgroundMusic(settings.music);
        debugLog('Audio', 'Background music started');
    } catch (error) {
        debugLog('Error', 'Failed to start background music:', error);
    }

    // Start background music
    try {
        startBackgroundMusic(settings.music);
        debugLog('Audio', 'Background music started');
    } catch (error) {
        debugLog('Error', 'Failed to start background music:', error);
    }

    // Start spawning squares with proper settings
    squareSpawnInterval = setInterval(() => {
        if (gameActive) {
            spawnSquare(settings.squareSize);
        }
    }, settings.spawnFrequency);

    debugLog('Game', 'Game initialization complete');
}

// Update spawnSquare to use settings properly
function spawnSquare(sizeSettings) {
    if (!canvasElement) {
        debugLog('Error', 'Canvas not found during square spawn');
        return;
    }

    const { min, max } = sizeSettings;
    const size = Math.floor(Math.random() * (max - min + 1)) + min;
    const x = Math.floor(Math.random() * (canvasElement.width - size));
    const y = Math.floor(Math.random() * (canvasElement.height - size));
    const colorIndex = Math.floor(Math.random() * SQUARE_COLORS.length);

    const newSquare = {
        x,
        y,
        size,
        spawnTime: performance.now(),
        color: SQUARE_COLORS[colorIndex],
        velocityX: 0, // default 0
        velocityY: 0  // default 0
    };
    // If we're on hard difficulty, give a random velocity
  if (currentDifficulty === 'hard') {
    // For example, random velocity in range [-2, 2]
    const randomVelX = (Math.random() * 4) - 2; 
    const randomVelY = (Math.random() * 4) - 2; 
    newSquare.velocityX = randomVelX;
    newSquare.velocityY = randomVelY;
  }

    squares.push(newSquare);
    debugLog('Game', 'Spawned square:', newSquare);
}

// StopGame Function
function stopGame() {
    console.log("Stopping game");
    gameActive = false;
    countdownActive = false;
    startGameButton.innerText = "Start Game";
    startGameButton.disabled = false;
    squares = [];
  
    // Stop background music
    if (bgMusic) {
      bgMusic.pause();
      bgMusic.currentTime = 0;
    }
    
    if (squareSpawnInterval) {
        clearInterval(squareSpawnInterval);
        squareSpawnInterval = null;
    }
}

async function enableCam() {
    if (!handLandmarker) {
        debugLog('Error', 'HandLandmarker not loaded yet');
        return;
    }

    webcamRunning = !webcamRunning;
    debugLog('Webcam', `Webcam state changed to: ${webcamRunning ? 'running' : 'stopped'}`);

    if (webcamRunning) {
        try {
            await Tone.start();
            audioStarted = true;
            synth = new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: "triangle" },
                envelope: { attack: 0.05, decay: 0.2, sustain: 0.4, release: 0.8 }
            }).toDestination();
            debugLog('Audio', 'Audio system initialized');

            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            video.srcObject = stream;
            video.addEventListener("loadeddata", predictWebcam);
            enableWebcamButton.style.display = "none";
            debugLog('Webcam', 'Webcam stream started successfully');
        } catch (error) {
            debugLog('Error', 'Failed to start webcam:', error);
        }
    } else {
        if (video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
            video.srcObject = null;
            debugLog('Webcam', 'Webcam stream stopped');
        }
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

    // Clear the canvas
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    // Draw the video with flip
    canvasCtx.save();
    canvasCtx.scale(-1, 1);
    canvasCtx.translate(-canvasElement.width, 0);
    canvasCtx.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore();

    if (results.landmarks) {
        for (const landmarks of results.landmarks) {
            drawSelectedFingertips(landmarks);

            if (gameActive) {
                const fingertips = fingerTipIndices.map(index => landmarks[index]);
                updateSquares(fingertips);
            }
        }
    }

    if (gameActive) {
        drawSquares();
    }

    if (webcamRunning) {
        window.requestAnimationFrame(predictWebcam);
    }
}

function updateSquares(fingertips) {
    const now = performance.now();
    const remainingSquares = [];
  
    for (const square of squares) {
      // Move squares if in hard mode, check lifetime, etc.
      // (existing code)...
  
      let touched = false;
      for (const tip of fingertips) {
        if (isFingerTouchingSquare(tip, square)) {
          touched = true;
          break;
        }
      }
  
      if (touched) {
        // INCREMENT COMBO
        comboCount++;
  
        // If combo hits 3 exactly or is a multiple of 5 after 3
        // e.g. 3, 5, 10, 15...
        if (comboCount === 3 || (comboCount >= 5 && comboCount % 5 === 0)) {
          comboMessage = comboCount + " COMBO!";
          showCombo = true;
          comboStartTime = now;
        }
        score++;
        debugLog('Game', `Square touched! Score: ${score}`);
      } else {
        // Square not touched -> check if it expired => that counts as a "miss"
        const age = now - square.spawnTime;
        const settings = DIFFICULTY_SETTINGS[currentDifficulty];
        const lifetime = settings ? settings.squareLifetime : SQUARE_LIFETIME;
        if (age > lifetime) {
          // A MISS occurs
          comboCount = 0;
          showCombo = false; // hide any combo if we miss
          debugLog('Game', 'Square expired (miss)');
        } else {
          remainingSquares.push(square);
        }
      }
    }
  
    squares = remainingSquares;
  }
  

function isFingerTouchingSquare(fingertip, square) {
    const tipX = fingertip.x * canvasElement.width;
    const tipY = fingertip.y * canvasElement.height;
    
    return (
        tipX >= square.x &&
        tipX <= square.x + square.size &&
        tipY >= square.y &&
        tipY <= square.y + square.size
    );
}

function drawSquares() {
    canvasCtx.save();  // Save the current state
    canvasCtx.scale(-1, 1);  // Flip the context
    canvasCtx.translate(-canvasElement.width, 0);  // Translate back

    // Draw squares with flipped context
    squares.forEach(square => {
        const age = performance.now() - square.spawnTime;
        const settings = DIFFICULTY_SETTINGS[currentDifficulty];
        const lifetime = settings ? settings.squareLifetime : SQUARE_LIFETIME;
        const opacity = 1 - (age / lifetime);
        
        if (opacity <= 0) return;

        canvasCtx.fillStyle = square.color.fill.replace('0.4', opacity * 0.4);
        canvasCtx.strokeStyle = square.color.stroke.replace('1)', `${opacity})`);
        canvasCtx.lineWidth = 2;
        
        canvasCtx.fillRect(square.x, square.y, square.size, square.size);
        canvasCtx.strokeRect(square.x, square.y, square.size, square.size);
    });

    canvasCtx.restore();  // Restore to unflipped state for text

    // Draw countdown if active (with normal orientation)
    if (countdownActive && countdownValue >= 0) {
        canvasCtx.fillStyle = "#ffffff";
        canvasCtx.font = "bold 120px Arial";
        canvasCtx.textAlign = "center";
        const centerX = canvasElement.width / 2;
        const centerY = canvasElement.height / 2;
        canvasCtx.fillText(countdownValue + 1, centerX, centerY);
        canvasCtx.textAlign = "left";
    }

    // Draw score (with normal orientation)
    canvasCtx.fillStyle = "#ffffff";
    canvasCtx.font = "bold 24px Arial";
    canvasCtx.fillText(`Score: ${score}`, 10, 30);

    drawComboMessage();
}

function drawComboMessage() {
    const now = performance.now();
    if (showCombo) {
      if (now - comboStartTime < COMBO_DISPLAY_TIME) {
        // Still within the display time
        canvasCtx.save();
        canvasCtx.fillStyle = "#FF00FF";
        canvasCtx.textAlign = "center";
        canvasCtx.font = "60px MyComboFont";  // Use your custom font name & size
  
        const centerX = canvasElement.width / 2;
        const centerY = canvasElement.height / 2;
        canvasCtx.fillText(comboMessage, centerX, centerY);
        canvasCtx.restore();
      } else {
        // Hide the combo text after the display time
        showCombo = false;
      }
    }
  }

function handleFingertipMusic(fingertip, tipIndex, fingerArrayIndex) {
    const now = Tone.now();
    const notesPerFinger = 5;
    const startIndex = fingerArrayIndex * notesPerFinger;
    let endIndex = startIndex + notesPerFinger - 1;
    if (endIndex >= bigScale.length) {
        endIndex = bigScale.length - 1;
    }
    const fingerScale = bigScale.slice(startIndex, endIndex + 1);

    let noteIdx = Math.floor(fingertip.x * fingerScale.length);
    if (noteIdx < 0) noteIdx = 0;
    if (noteIdx >= fingerScale.length) noteIdx = fingerScale.length - 1;

    if (noteIdx !== fingerLastNoteIndex[tipIndex] &&
        (now - fingerLastTriggerTime[tipIndex]) > minNoteInterval) {
        const note = fingerScale[noteIdx];
        synth.triggerAttackRelease(note, "8n", now);
        fingerLastNoteIndex[tipIndex] = noteIdx;
        fingerLastTriggerTime[tipIndex] = now;
    }
}

function drawSelectedFingertips(landmarks) {
    canvasCtx.save();  // Save current state
    canvasCtx.scale(-1, 1);  // Flip the context
    canvasCtx.translate(-canvasElement.width, 0);  // Translate back

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

    canvasCtx.restore();  // Restore unflipped state
}
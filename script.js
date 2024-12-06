let audioContext;
let sourceNode;
let analyser;
let frequencyAnalyser;
let dataArrayTime;
let dataArrayFreq;
let bufferLengthTime;
let bufferLengthFreq;
let animationId;
let audioBuffer;
let isPlaying = false;
let gainNode;

// UI elements
const fileInput = document.getElementById('audioFileInput');
const playButton = document.getElementById('playButton');
const stopButton = document.getElementById('stopButton');
const volumeControl = document.getElementById('volumeControl');
const canvas = document.getElementById('visualizer');
const ctx = canvas.getContext('2d');

// Canvas size
canvas.width = 800;
canvas.height = 400;

// Variables for visualization and beat detection
let hue = 0;         
let lastVolume = 0;  
let beatHoldFrames = 0;
let beatDecayRate = 0.97;
let beatMinThreshold = 0.15; 
let beatHoldThreshold = 30; 

// Visualization styles
const styles = ['circles', 'bars', 'waveforms'];
let visualizationStyle = styles[0];

// Interactivity variables
let offsetX = 0; // how much we've dragged horizontally
let offsetY = 0; // how much we've dragged vertically
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let movedDuringDrag = false;

fileInput.addEventListener('change', handleFileSelect);
playButton.addEventListener('click', playAudio);
stopButton.addEventListener('click', stopAudio);
volumeControl.addEventListener('input', updateVolume);

// Mouse event listeners for interactivity
canvas.addEventListener('mousedown', onMouseDown);
canvas.addEventListener('mousemove', onMouseMove);
canvas.addEventListener('mouseup', onMouseUp);
canvas.addEventListener('mouseleave', onMouseUp); // stop drag if mouse leaves canvas

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Create new AudioContext if not already created
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        let arrayBuffer = e.target.result;
        audioContext.decodeAudioData(arrayBuffer).then(decodedData => {
            audioBuffer = decodedData;
            playButton.disabled = false;

            // Pick a visualization style at random for this track
            visualizationStyle = styles[Math.floor(Math.random()*styles.length)];
        }).catch(err => {
            console.error('Error decoding audio data:', err);
        });
    };
    reader.readAsArrayBuffer(file);
}

function createAudioNodes() {
    if (!audioContext) return;

    // If a source already exists, disconnect it
    if (sourceNode) {
        sourceNode.disconnect();
    }

    sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = audioBuffer;

    // Create a gain node for volume control
    gainNode = audioContext.createGain();
    gainNode.gain.value = volumeControl.value;

    // Time-domain analyser
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256; 
    bufferLengthTime = analyser.frequencyBinCount;
    dataArrayTime = new Uint8Array(bufferLengthTime);

    // Frequency analyser
    frequencyAnalyser = audioContext.createAnalyser();
    frequencyAnalyser.fftSize = 256;
    bufferLengthFreq = frequencyAnalyser.frequencyBinCount;
    dataArrayFreq = new Uint8Array(bufferLengthFreq);

    // Connect nodes
    sourceNode.connect(gainNode);
    gainNode.connect(analyser);
    analyser.connect(frequencyAnalyser);
    frequencyAnalyser.connect(audioContext.destination);
}

function playAudio() {
    if (!audioBuffer) return;
    if (!audioContext) return;

    createAudioNodes();
    sourceNode.start(0);
    isPlaying = true;
    playButton.disabled = true;
    stopButton.disabled = false;

    animate();
}

function stopAudio() {
    if (sourceNode && isPlaying) {
        sourceNode.stop();
        sourceNode.disconnect();
        isPlaying = false;
        playButton.disabled = false;
        stopButton.disabled = true;
    }

    if (animationId) {
        cancelAnimationFrame(animationId);
    }
}

function updateVolume() {
    if (gainNode) {
        gainNode.gain.value = volumeControl.value;
    }
}

function animate() {
    if (!analyser || !frequencyAnalyser) return;

    analyser.getByteTimeDomainData(dataArrayTime);
    frequencyAnalyser.getByteFrequencyData(dataArrayFreq);

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Compute RMS volume for beat detection
    let sum = 0;
    for (let i = 0; i < bufferLengthTime; i++) {
        let val = (dataArrayTime[i] - 128) / 128.0; 
        sum += val * val;
    }
    let rms = Math.sqrt(sum / bufferLengthTime);

    // Beat detection
    let isBeat = false;
    if (rms > beatMinThreshold && rms > lastVolume) {
        if (beatHoldFrames == 0) {
            isBeat = true;
            beatHoldFrames = beatHoldThreshold;
        }
    }
    if (beatHoldFrames > 0) {
        beatHoldFrames--;
    }
    lastVolume = rms * 0.9 + lastVolume * 0.1; 

    // Hue changes with volume
    hue = (hue + rms * 20) % 360;

    // Center with offsets due to dragging
    let centerX = canvas.width / 2 + offsetX;
    let centerY = canvas.height / 2 + offsetY;

    // Draw different styles based on chosen style
    if (visualizationStyle === 'circles') {
        drawCirclesStyle(rms, isBeat, centerX, centerY);
    } else if (visualizationStyle === 'bars') {
        drawBarsStyle(rms, isBeat, centerX, centerY);
    } else if (visualizationStyle === 'waveforms') {
        drawWaveformStyle(rms, isBeat, centerX, centerY);
    }

    animationId = requestAnimationFrame(animate);
}

function drawCirclesStyle(rms, isBeat, centerX, centerY) {
    // Concentric circles
    let baseRadius = 50 + rms * 200;
    if (isBeat) {
        baseRadius *= 1.5; // jump on beat
    }

    for (let i = 0; i < 5; i++) {
        let radius = baseRadius + i * 30;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `hsl(${(hue + i * 20) % 360}, 100%, 50%)`;
        ctx.lineWidth = 3;
        ctx.stroke();
    }

    // Rotating rectangle
    let angle = Date.now() * 0.001;
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angle * (isBeat ? 2 : 1));
    let rectSize = 50 + rms * 100;
    ctx.fillStyle = `hsl(${(hue + 180) % 360}, 100%, 50%)`;
    ctx.fillRect(-rectSize / 2, -rectSize / 2, rectSize, rectSize);
    ctx.restore();
}

function drawBarsStyle(rms, isBeat, centerX, centerY) {
    // Frequency bars
    let barWidth = (canvas.width / bufferLengthFreq);
    let maxBarHeight = canvas.height / 2;
    for (let i = 0; i < bufferLengthFreq; i++) {
        let barHeight = (dataArrayFreq[i] / 255) * maxBarHeight;
        ctx.fillStyle = `hsl(${(hue + i * 5) % 360}, 100%, 50%)`;
        let x = i * barWidth;
        let y = canvas.height - barHeight;
        ctx.fillRect(x, y, barWidth, barHeight);
    }

    // Pulsing circle in the center based on rms
    let radius = 50 + rms * 200;
    if (isBeat) {
        radius *= 1.3;
    }
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
    ctx.fill();
}

function drawWaveformStyle(rms, isBeat, centerX, centerY) {
    // Draw the waveform line
    ctx.beginPath();
    let sliceWidth = canvas.width * 1.0 / bufferLengthTime;
    let x = 0;
    for (let i = 0; i < bufferLengthTime; i++) {
        let v = dataArrayTime[i] / 128.0;
        let y = v * canvas.height / 2;
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
        x += sliceWidth;
    }
    ctx.strokeStyle = `hsl(${hue}, 100%, 50%)`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Random polygon in the background depending on volume
    let polygonSides = 5 + Math.floor(rms * 10);
    if (isBeat) polygonSides += 3; // Add more sides on beat
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.beginPath();
    for (let i = 0; i < polygonSides; i++) {
        let angle = (Math.PI * 2 / polygonSides) * i;
        let radius = 100 + rms * 100;
        if (isBeat) radius *= 1.2;
        let px = Math.cos(angle) * radius;
        let py = Math.sin(angle) * radius;
        if (i === 0) {
            ctx.moveTo(px, py);
        } else {
            ctx.lineTo(px, py);
        }
    }
    ctx.closePath();
    ctx.strokeStyle = `hsl(${(hue + 180) % 360}, 100%, 50%)`;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
}

// Mouse handlers for interactivity
function onMouseDown(e) {
    isDragging = true;
    dragStartX = e.offsetX;
    dragStartY = e.offsetY;
    movedDuringDrag = false;
}

function onMouseMove(e) {
    if (isDragging) {
        let dx = e.offsetX - dragStartX;
        let dy = e.offsetY - dragStartY;

        offsetX += dx;
        offsetY += dy;

        dragStartX = e.offsetX;
        dragStartY = e.offsetY;
        movedDuringDrag = true;
    }
}

function onMouseUp(e) {
    if (!isDragging) return;
    isDragging = false;

    // If the user did not move during drag, consider it a click
    if (!movedDuringDrag) {
        // Cycle to the next visualization style on click
        let currentIndex = styles.indexOf(visualizationStyle);
        visualizationStyle = styles[(currentIndex + 1) % styles.length];
    }
}

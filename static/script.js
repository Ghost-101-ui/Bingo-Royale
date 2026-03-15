const socket = io();

// DOM Elements
const screens = {
    landing: document.getElementById('landing-screen'),
    lobby: document.getElementById('lobby-screen'),
    setup: document.getElementById('setup-screen'),
    game: document.getElementById('game-screen')
};

// Landing UI
const createRoomBtn = document.getElementById('create-room-btn');

// Lobby UI
const loginPanel = document.getElementById('login-panel');
const lobbyPanel = document.getElementById('lobby-panel');
const nameInput = document.getElementById('player-name-input');
const joinBtn = document.getElementById('join-btn');
const playerList = document.getElementById('player-list');
const playerCount = document.getElementById('player-count');
const startGameBtn = document.getElementById('start-game-btn');
const setupBoardBtn = document.getElementById('setup-board-btn');
const waitingMsg = document.getElementById('waiting-msg');
const inviteLink = document.getElementById('invite-link');
const copyLinkBtn = document.getElementById('copy-link-btn');
const qrcodeContainer = document.getElementById('qrcode-container');

// Setup UI
const numberPalette = document.getElementById('number-palette');
const setupBoard = document.getElementById('setup-board');
const autoFillBtn = document.getElementById('auto-fill-btn');
const submitBoardBtn = document.getElementById('submit-board-btn');
const gameModeSection = document.getElementById('game-mode-section');
const modeBtns = document.querySelectorAll('.mode-btn');

// Game UI
const gameBoard = document.getElementById('game-board');
const turnBanner = document.getElementById('turn-banner');
const turnText = document.getElementById('turn-text');
const bingoLetters = document.querySelectorAll('#bingo-letters span');
const lastNumberDisplay = document.getElementById('last-number-display');
const gamePlayerList = document.getElementById('game-player-list');
const calledHistory = document.getElementById('called-numbers-history');
const winOverlay = document.getElementById('win-overlay');
const winnerNameEl = document.getElementById('winner-name');
const playAgainBtn = document.getElementById('play-again-btn');

// State
let myId = null;
let isHost = false;
let gridSize = 5;
let maxNumber = 25;
let myBoard = Array(maxNumber).fill(null);
let selectedPaletteNumber = null;
let boardReady = false;
let calledNumbers = [];
let bingoLines = 0;
let currentTurnSid = null;

// URL params
const urlParams = new URLSearchParams(window.location.search);
let roomCode = urlParams.get('room');

// ==========================================
// Initialization & UTILS
// ==========================================

function showScreen(screenName) {
    Object.values(screens).forEach(s => {
        if(s) {
            s.classList.add('hidden');
            s.classList.remove('view-active');
        }
    });
    if(screens[screenName]) {
        screens[screenName].classList.remove('hidden');
        screens[screenName].classList.add('view-active');
    }
}

function showNotification(msg) {
    const container = document.getElementById('notifications');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Initial Screen Routing
if (roomCode) {
    roomCode = roomCode.toUpperCase();
    document.getElementById('room-code-display').textContent = `#${roomCode}`;
    showScreen('lobby');
} else {
    showScreen('landing');
}

// ==========================================
// LANDING LOGIC
// ==========================================

createRoomBtn.addEventListener('click', () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let newRoom = '';
    for(let i=0; i<5; i++) newRoom += chars.charAt(Math.floor(Math.random() * chars.length));
    window.location.href = `/?room=${newRoom}`;
});

modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        if (isHost) {
            socket.emit('select_grid_size', { size: btn.dataset.size, room: roomCode });
        } else {
            showNotification("Only the host can change the game mode.");
        }
    });
});

// ==========================================
// LOBBY LOGIC
// ==========================================

joinBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (name && roomCode) {
        socket.emit('join_game', { name: name, room: roomCode });
        loginPanel.classList.add('hidden');
        lobbyPanel.classList.remove('hidden');
        inviteLink.textContent = window.location.href;
        
        // Generate QR Code
        qrcodeContainer.innerHTML = '';
        new QRCode(qrcodeContainer, {
            text: window.location.href,
            width: 156,
            height: 156,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.L
        });
    } else {
        showNotification('Please enter a name!');
    }
});

nameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinBtn.click();
});

copyLinkBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
        showNotification('Invite link copied!');
        copyLinkBtn.textContent = 'Copied!';
        setTimeout(() => copyLinkBtn.textContent = 'Copy', 2000);
    }).catch(() => {
        showNotification('Failed to copy link');
    });
});

socket.on('connect', () => {
    myId = socket.id;
});

socket.on('player_list', (data) => {
    const players = data.players;
    const gameStarted = data.game_started;
    
    playerList.innerHTML = '';
    gamePlayerList.innerHTML = '';
    
    playerCount.textContent = `${players.length} Player${players.length !== 1 ? 's' : ''}`;
    
    let allReady = true;
    
    players.forEach(p => {
        if (p.id === myId) {
            isHost = p.is_host;
        }
        if (!p.board_ready) allReady = false;
        
        const li = document.createElement('li');
        li.className = `player-item ${p.is_host ? 'host' : ''} ${p.board_ready ? 'ready' : ''}`;
        
        let statusText = p.board_ready ? 'Ready' : 'Arranging...';
        if (p.is_host) statusText += ' (Host)';
        
        li.innerHTML = `
            <span>${p.name} ${p.id === myId ? '(You)' : ''}</span>
            <span class="status-indicator ${p.board_ready ? 'ready' : ''}">${statusText}</span>
        `;
        playerList.appendChild(li);
        
        const miniLi = document.createElement('li');
        
        // Hide lines for other players to create suspense
        let linesDisplay = p.id === myId ? `${p.bingo_lines} Lines` : `? Lines`;
        
        miniLi.innerHTML = `
            <span>${p.name} ${p.id === myId ? '(You)' : ''}</span>
            <span class="accent">${linesDisplay}</span>
        `;
        gamePlayerList.appendChild(miniLi);
    });
    
    if (!gameStarted) {
        if(gameModeSection) gameModeSection.classList.remove('hidden');
        if (modeBtns) {
            modeBtns.forEach(btn => {
                btn.disabled = !isHost;
            });
        }
    } else {
        if(gameModeSection) gameModeSection.classList.add('hidden');
    }
    
    if (isHost && !gameStarted) {
        waitingMsg.classList.add('hidden');
        startGameBtn.classList.remove('hidden');
        startGameBtn.disabled = !allReady || players.length === 0;
        if (!startGameBtn.disabled) {
            startGameBtn.textContent = 'Start Game';
        } else {
            startGameBtn.textContent = 'Waiting for players...';
        }
    } else if (!isHost && !gameStarted) {
        waitingMsg.classList.remove('hidden');
        startGameBtn.classList.add('hidden');
    }
});

socket.on('game_state', (data) => {
    if (data.game_started) {
        showNotification('Game has already started in this room!');
    }
    if (data.grid_size && data.max_number) {
        gridSize = data.grid_size;
        maxNumber = data.max_number;
        myBoard = Array(maxNumber).fill(null);
        document.documentElement.style.setProperty('--grid-size', gridSize);
        modeBtns.forEach(btn => {
            if (parseInt(btn.dataset.size) === gridSize) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
});

socket.on('grid_size_selected', (data) => {
    gridSize = data.grid_size;
    maxNumber = data.max_number;
    myBoard = Array(maxNumber).fill(null);
    boardReady = false;
    
    document.documentElement.style.setProperty('--grid-size', gridSize);
    
    modeBtns.forEach(btn => {
        if (parseInt(btn.dataset.size) === gridSize) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    setupBoardBtn.textContent = 'Setup My Board';
    submitBoardBtn.disabled = true;
});

// ==========================================
// BOARD SETUP LOGIC
// ==========================================

setupBoardBtn.addEventListener('click', () => {
    showScreen('setup');
    initSetupBoard();
});

function initSetupBoard() {
    numberPalette.innerHTML = '';
    for (let i = 1; i <= maxNumber; i++) {
        const numEl = document.createElement('div');
        numEl.className = 'palette-num';
        numEl.textContent = i;
        numEl.dataset.num = i;
        
        if (myBoard.includes(i)) numEl.classList.add('used');
        
        numEl.addEventListener('click', () => {
            if (!numEl.classList.contains('used')) {
                document.querySelectorAll('.palette-num').forEach(el => el.classList.remove('selected'));
                numEl.classList.add('selected');
                selectedPaletteNumber = i;
            }
        });
        
        numberPalette.appendChild(numEl);
    }
    renderSetupBoardUI();
}

function renderSetupBoardUI() {
    setupBoard.innerHTML = '';
    for (let i = 0; i < maxNumber; i++) {
        const cell = document.createElement('div');
        cell.className = 'board-cell';
        cell.dataset.index = i;
        
        const val = myBoard[i];
        if (val) {
            cell.textContent = val;
        } else {
            cell.classList.add('empty');
            cell.textContent = '-';
        }
        
        cell.addEventListener('click', () => {
            if (selectedPaletteNumber && !myBoard[i]) {
                myBoard[i] = selectedPaletteNumber;
                const pEl = document.querySelector(`.palette-num[data-num="${selectedPaletteNumber}"]`);
                if(pEl) {
                    pEl.classList.remove('selected');
                    pEl.classList.add('used');
                }
                selectedPaletteNumber = null;
                renderSetupBoardUI();
                checkBoardComplete();
            } else if (val) {
                myBoard[i] = null;
                const pEl = document.querySelector(`.palette-num[data-num="${val}"]`);
                if(pEl) pEl.classList.remove('used');
                renderSetupBoardUI();
                checkBoardComplete();
            }
        });
        
        setupBoard.appendChild(cell);
    }
}

function checkBoardComplete() {
    const isComplete = myBoard.every(n => n !== null);
    submitBoardBtn.disabled = !isComplete;
}

autoFillBtn.addEventListener('click', () => {
    const nums = Array.from({length: maxNumber}, (_, i) => i + 1);
    for (let i = nums.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [nums[i], nums[j]] = [nums[j], nums[i]];
    }
    myBoard = nums;
    selectedPaletteNumber = null;
    document.querySelectorAll('.palette-num').forEach(el => {
        el.classList.remove('selected');
        el.classList.add('used');
    });
    renderSetupBoardUI();
    checkBoardComplete();
});

submitBoardBtn.addEventListener('click', () => {
    boardReady = true;
    socket.emit('set_board', { room: roomCode });
    showScreen('lobby');
    setupBoardBtn.textContent = 'Edit Board';
    showNotification('Board ready!');
});

// ==========================================
// GAME PLAY LOGIC
// ==========================================

startGameBtn.addEventListener('click', () => {
    socket.emit('start_game', { room: roomCode });
});

socket.on('start_game', () => {
    showScreen('game');
    
    if (!myBoard.every(n => n !== null)) {
        autoFillBtn.click();
    }
    
    gameBoard.innerHTML = '';
    myBoard.forEach((num, i) => {
        const cell = document.createElement('div');
        cell.className = 'board-cell interactive text-center';
        cell.textContent = num;
        cell.id = `cell-${num}`;
        
        // Add click listener for calling
        cell.addEventListener('click', () => {
            if (currentTurnSid === myId && !calledNumbers.includes(num)) {
                socket.emit('call_number', { number: num, room: roomCode });
            } else if (currentTurnSid !== myId) {
                showNotification("It's not your turn!");
            }
        });
        
        gameBoard.appendChild(cell);
    });
    
    turnBanner.classList.remove('hidden');
});

socket.on('turn_changed', (data) => {
    currentTurnSid = data.turn_sid;
    if (currentTurnSid === myId) {
        turnText.textContent = "It's YOUR Turn! (Pick a number)";
        turnText.className = 'accent animated-glow';
        gameBoard.classList.add('my-turn');
    } else {
        turnText.textContent = `It's ${data.turn_name}'s Turn`;
        turnText.className = '';
        gameBoard.classList.remove('my-turn');
    }
});

socket.on('number_called', (data) => {
    const num = data.number;
    calledNumbers = data.called_numbers;
    
    document.querySelectorAll('.board-cell').forEach(c => c.classList.remove('recent-call'));
    
    const cell = document.getElementById(`cell-${num}`);
    if (cell) {
        cell.classList.add('crossed', 'recent-call');
        checkBingo();
    }
    
    lastNumberDisplay.textContent = num;
    lastNumberDisplay.classList.add('pop-anim');
    setTimeout(() => lastNumberDisplay.classList.remove('pop-anim'), 300);
    
    const historyItem = document.createElement('div');
    historyItem.className = 'history-num fade-in';
    historyItem.textContent = num;
    calledHistory.appendChild(historyItem);
});

// ==========================================
// BINGO DETECTION
// ==========================================

function checkBingo() {
    let completedLines = 0;
    
    const isLineCrossed = (indices) => {
        return indices.every(idx => calledNumbers.includes(myBoard[idx]));
    };
    
    for (let r = 0; r < gridSize; r++) {
        const row = [];
        for (let c = 0; c < gridSize; c++) {
            row.push(r * gridSize + c);
        }
        if (isLineCrossed(row)) completedLines++;
    }
    
    for (let c = 0; c < gridSize; c++) {
        const col = [];
        for (let r = 0; r < gridSize; r++) {
            col.push(r * gridSize + c);
        }
        if (isLineCrossed(col)) completedLines++;
    }
    
    const d1 = [];
    const d2 = [];
    for (let i = 0; i < gridSize; i++) {
        d1.push(i * gridSize + i);
        d2.push(i * gridSize + (gridSize - 1 - i));
    }
    if (isLineCrossed(d1)) completedLines++;
    if (isLineCrossed(d2)) completedLines++;
    
    completedLines = Math.min(completedLines, 5);
    
    if (completedLines > bingoLines) {
        bingoLines = completedLines;
        updateBingoUI(bingoLines);
        socket.emit('bingo_update', { lines: bingoLines, room: roomCode });
        
        if (bingoLines < 5) {
            showNotification(`You got a line! (${bingoLines}/5)`);
        }
    }
}

function updateBingoUI(lines) {
    for (let i = 0; i < 5; i++) {
        if (i < lines) {
            bingoLetters[i].classList.add('active');
        } else {
            bingoLetters[i].classList.remove('active');
        }
    }
}

socket.on('winner', (data) => {
    winOverlay.classList.remove('hidden');
    winnerNameEl.textContent = `${data.name} WON!`;
    if (isHost) {
        playAgainBtn.textContent = "Play Again (Reset Game)";
    } else {
        playAgainBtn.textContent = "Waiting for Host...";
    }
});

playAgainBtn.addEventListener('click', () => {
    if (isHost) {
        socket.emit('play_again', { room: roomCode });
    } else {
        showNotification("Waiting for the host to restart the game...");
    }
});

socket.on('game_reset', () => {
    winOverlay.classList.add('hidden');
    
    // Reset local state
    myBoard = Array(maxNumber).fill(null);
    boardReady = false;
    calledNumbers = [];
    bingoLines = 0;
    currentTurnSid = null;
    selectedPaletteNumber = null;
    
    // Reset UI elements
    document.querySelectorAll('.board-cell').forEach(c => c.classList.remove('crossed', 'recent-call'));
    lastNumberDisplay.textContent = '-';
    calledHistory.innerHTML = '';
    bingoLetters.forEach(l => l.classList.remove('active'));
    
    // Return to lobby
    showScreen('lobby');
    setupBoardBtn.textContent = 'Setup My Board';
    submitBoardBtn.disabled = true;
});

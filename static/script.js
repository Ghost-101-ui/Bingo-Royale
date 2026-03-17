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
const musicToggleBtn = document.getElementById('music-toggle-btn');

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

// Intro Transition UI
const introContainer = document.getElementById('intro-container');
const introBingoLogo = document.getElementById('intro-bingo-logo');
// Note: lobbyHeaderLogo is now an alias for the persistent animated logo
const lobbyHeaderLogo = introBingoLogo;

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
const gameLeaderboardList = document.getElementById('game-leaderboard-list');
const calledHistory = document.getElementById('called-numbers-history');
const winOverlay = document.getElementById('win-overlay');
const winnerNameEl = document.getElementById('winner-name');
const hostControls = document.getElementById('host-controls');
const nextRoundBtn = document.getElementById('next-round-btn');
const endSessionBtn = document.getElementById('end-session-btn');
const participantWaitMsg = document.getElementById('participant-wait-msg');
const turnTimerEl = document.getElementById('turn-timer');

// Audio Settings Elements
const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const bgmToggle = document.getElementById('bgm-toggle');
const mode18Toggle = document.getElementById('mode-18-toggle');
const bgmVolumeSlider = document.getElementById('bgm-volume');
const sfxVolumeSlider = document.getElementById('sfx-volume');

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
let turnTimerInterval = null;
let timeLeft = 20;

// Utility: Show Toast Notification
function showNotification(message, duration = 3000) {
    let notifyEl = document.getElementById('custom-notification');
    if (!notifyEl) {
        notifyEl = document.createElement('div');
        notifyEl.id = 'custom-notification';
        notifyEl.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(247, 166, 0, 0.9);
            color: black;
            padding: 12px 24px;
            border-radius: 8px;
            font-family: 'Outfit', sans-serif;
            font-weight: 600;
            z-index: 99999;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            transition: opacity 0.3s ease;
        `;
        document.body.appendChild(notifyEl);
    }
    notifyEl.textContent = message;
    notifyEl.style.opacity = '1';
    
    setTimeout(() => {
        notifyEl.style.opacity = '0';
    }, duration);
}

// Sound Manager
const SoundManager = {
    bgMusic: new Audio('/static/sounds/Elevator-music.mp3'),
    joinRoom: new Audio('/static/sounds/join-room.mp3'),
    startGame: new Audio('/static/sounds/chalo.mp3'),
    btnClick: new Audio('/static/sounds/btnclick.mp3'),
    yourTurn: new Audio('/static/sounds/your-turn.mp3'),
    win: new Audio('/static/sounds/win.mp3'),
    loss: new Audio('/static/sounds/loss.mp3'),
    notYourTurn: new Audio('/static/sounds/fahhh.mp3'),
    intro: new Audio('/static/sounds/intro.mp3'),
    
    // These will be linked in init() to ensure DOM readiness
    boom1: null,
    boom2: null,
    boom3: null,

    // 18+ Mode sounds
    win18: new Audio('/static/sounds/bete-win.mp3'),
    loss18: new Audio('/static/sounds/bsdk-loss.mp3'),
    btnClick18: new Audio('/static/sounds/ahh-btn.mp3'),

    isMuted: false,
    is18Plus: false,
    bgmVolume: 0.2,
    sfxVolume: 0.5,

    init() {
        console.log("Initializing SoundManager...");
        
        // Link DOM audio elements
        this.boom1 = document.getElementById('audio-boom1') || new Audio('/static/sounds/boom1.mp3');
        this.boom2 = document.getElementById('audio-boom2') || new Audio('/static/sounds/boom2.mp3');
        this.boom3 = document.getElementById('audio-boom3') || new Audio('/static/sounds/boom3.mp3');

        // Load settings from localStorage
        const savedBgmVol = localStorage.getItem('bgmVolume');
        const savedSfxVol = localStorage.getItem('sfxVolume');
        const savedIsMuted = localStorage.getItem('bgmMuted');
        const savedIs18Plus = localStorage.getItem('is18Plus');

        this.bgmVolume = savedBgmVol !== null ? parseFloat(savedBgmVol) : 0.2;
        this.sfxVolume = savedSfxVol !== null ? parseFloat(savedSfxVol) : 0.5;
        if (savedIsMuted !== null) this.isMuted = savedIsMuted === 'true';
        if (savedIs18Plus !== null) this.is18Plus = savedIs18Plus === 'true';

        // Update UI
        if (bgmVolumeSlider) bgmVolumeSlider.value = this.bgmVolume * 100;
        if (sfxVolumeSlider) sfxVolumeSlider.value = this.sfxVolume * 100;
        if (bgmToggle) bgmToggle.checked = !this.isMuted;
        if (mode18Toggle) mode18Toggle.checked = this.is18Plus;

        this.bgMusic.loop = true;
        this.loss18.loop = true;
        this.updateVolumes();

        // Start the actual intro sequence automatically on load
        IntroManager.start();
    },

    updateVolumes() {
        this.bgMusic.volume = this.bgmVolume;
        this.joinRoom.volume = this.sfxVolume;
        this.startGame.volume = this.sfxVolume;
        this.btnClick.volume = this.sfxVolume;
        this.yourTurn.volume = this.sfxVolume;
        this.win.volume = this.sfxVolume;
        this.loss.volume = this.sfxVolume;
        this.notYourTurn.volume = this.sfxVolume;

        // 18+ sounds volume
        this.win18.volume = this.sfxVolume;
        this.loss18.volume = this.sfxVolume;
        this.btnClick18.volume = this.sfxVolume;
        this.intro.volume = this.sfxVolume;
        this.boom1.volume = this.sfxVolume;
        this.boom2.volume = this.sfxVolume;
        this.boom3.volume = this.sfxVolume;
    },

    setBgmVolume(val) {
        this.bgmVolume = val / 100;
        this.bgMusic.volume = this.bgmVolume;
        localStorage.setItem('bgmVolume', this.bgmVolume);
    },

    setSfxVolume(val) {
        this.sfxVolume = val / 100;
        this.updateVolumes();
        localStorage.setItem('sfxVolume', this.sfxVolume);
    },

    toggle18Plus(state) {
        this.is18Plus = state;
        localStorage.setItem('is18Plus', this.is18Plus);
    },

    toggleMusic(forceState = null) {
        if (forceState !== null) {
            this.isMuted = !forceState;
        } else {
            this.isMuted = !this.isMuted;
        }

        localStorage.setItem('bgmMuted', this.isMuted);

        if (this.isMuted) {
            this.bgMusic.pause();
            if (musicToggleBtn) {
                musicToggleBtn.innerHTML = '🔇 Music Off';
                musicToggleBtn.classList.remove('playing');
            }
            if (bgmToggle) bgmToggle.checked = false;
        } else {
            this.bgMusic.play().catch(e => console.log(e));
            if (musicToggleBtn) {
                musicToggleBtn.innerHTML = '🔊 Music On';
                musicToggleBtn.classList.add('playing');
            }
            if (bgmToggle) bgmToggle.checked = true;
        }
    },

    playBgMusic(delayMs = 0) {
        if (this.bgMusic.paused && !this.isMuted) {
            if (musicToggleBtn) {
                musicToggleBtn.classList.remove('hidden');
                musicToggleBtn.innerHTML = '🔊 Music On';
                musicToggleBtn.classList.add('playing');
            }
            if (bgmToggle) bgmToggle.checked = true;
            this.isMuted = false;
            localStorage.setItem('bgmMuted', 'false');

            setTimeout(() => {
                this.bgMusic.play().catch(e => {
                    console.log("Audio autoplay prevented by browser.");
                    this.isMuted = true;
                    localStorage.setItem('bgmMuted', 'true');
                    if (musicToggleBtn) {
                        musicToggleBtn.innerHTML = '🔇 Music Off';
                        musicToggleBtn.classList.remove('playing');
                    }
                    if (bgmToggle) bgmToggle.checked = false;
                });
            }, delayMs);
        }
    },

    playJoin() {
        this.joinRoom.currentTime = 0;
        this.joinRoom.play().catch(e => console.log("Audio play prevented."));
    },

    playStartGame() {
        this.startGame.currentTime = 0;
        this.startGame.play().catch(e => console.log("Audio play prevented."));
    },

    playBtnClick() {
        this.btnClick.currentTime = 0;
        this.btnClick18.currentTime = 0;
        if (this.is18Plus) {
            this.btnClick18.play().catch(e => console.log("Audio play prevented."));
        } else {
            this.btnClick.play().catch(e => console.log("Audio play prevented."));
        }
    },

    playYourTurn() {
        this.yourTurn.currentTime = 0;
        this.yourTurn.play().catch(e => console.log("Audio play prevented."));
    },

    playWin() {
        this.win.currentTime = 0;
        this.win18.currentTime = 0;
        if (this.is18Plus) {
            this.win18.play().catch(e => console.log("Audio play prevented."));
        } else {
            this.win.play().catch(e => console.log("Audio play prevented."));
        }
    },

    playLoss() {
        this.loss.currentTime = 0;
        this.loss18.currentTime = 0;
        if (this.is18Plus) {
            this.loss18.play().catch(e => console.log("Audio play prevented."));
        } else {
            this.loss.play().catch(e => console.log("Audio play prevented."));
        }
    },

    stopAllLoopingSounds() {
        this.win.pause();
        this.win.currentTime = 0;
        this.loss.pause();
        this.loss.currentTime = 0;
        this.win18.pause();
        this.win18.currentTime = 0;
        this.loss18.pause();
        this.loss18.currentTime = 0;
    },

    playNotYourTurn() {
        this.notYourTurn.currentTime = 0;
        this.notYourTurn.play().catch(e => console.log("Audio play prevented."));
    }
};

if (musicToggleBtn) {
    musicToggleBtn.addEventListener('click', () => {
        SoundManager.toggleMusic();
    });
}

// Audio Settings Listeners
if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
        SoundManager.playBtnClick();
        settingsPanel.classList.remove('hidden');
    });
}

if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', () => {
        SoundManager.playBtnClick();
        settingsPanel.classList.add('hidden');
    });
}

if (bgmToggle) {
    bgmToggle.addEventListener('change', (e) => {
        SoundManager.toggleMusic(e.target.checked);
    });
}

if (bgmVolumeSlider) {
    bgmVolumeSlider.addEventListener('input', (e) => {
        SoundManager.setBgmVolume(e.target.value);
    });
}

if (sfxVolumeSlider) {
    sfxVolumeSlider.addEventListener('input', (e) => {
        SoundManager.setSfxVolume(e.target.value);
    });
}

if (mode18Toggle) {
    mode18Toggle.addEventListener('change', (e) => {
        SoundManager.toggle18Plus(e.target.checked);
    });
}

// URL params
const urlParams = new URLSearchParams(window.location.search);
let roomCode = urlParams.get('room');

// ==========================================
// Initialization & UTILS
// ==========================================

function showScreen(screenName) {
    Object.values(screens).forEach(s => {
        if (s) {
            s.classList.add('hidden');
            s.classList.remove('view-active');
        }
    });
    if (screens[screenName]) {
        screens[screenName].classList.remove('hidden');
        screens[screenName].classList.add('view-active');
    }
}

// ==========================================
// CINEMATIC INTRO LOGIC
// ==========================================

const IntroManager = {
    steps: {
        phase1: document.getElementById('step-presents'),
        phase2: document.getElementById('step-logo'),
        phase3: document.getElementById('intro-bingo-logo')
    },

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    async start() {
        console.log("Starting Cinematic Intro...");
        
        // Ensure volumes are maxed for the intro
        SoundManager.boom2.volume = 1.0;
        SoundManager.boom3.volume = 1.0;

        // Phase 1: CyberEDT Games presents (3 seconds)
        if (this.steps.phase1) {
            this.steps.phase1.classList.remove('hidden', 'fade-out');
            this.steps.phase1.classList.add('active');
        }

        await this.delay(3000); // 3s matches text animation
        
        if (this.steps.phase1) {
            this.steps.phase1.classList.replace('active', 'fade-out');
        }

        // Phase 2: CyberEDT Logo + Credits (8 seconds - Match Boom 2)
        if (this.steps.phase2) {
            this.steps.phase2.classList.remove('hidden', 'fade-out');
            this.steps.phase2.classList.add('active');
            
            SoundManager.boom2.play().catch(e => console.warn("Boom2 blocked"));
        }

        await this.delay(8000); 
        
        if (this.steps.phase2) {
            this.steps.phase2.classList.replace('active', 'fade-out');
        }

        // Phase 3: BINGO ROYALE Main Reveal (2 seconds - Match Boom 3)
        if (this.steps.phase3) {
            this.steps.phase3.classList.remove('hidden');
            this.steps.phase3.classList.add('active');
            
            SoundManager.boom3.play().catch(e => console.warn("Boom3 blocked"));
        }
        
        await this.delay(2000);

        // Final Transition to Lobby
        this.transitionToLobby();
    },

    transitionToLobby() {
        console.log("Transitioning to Lobby (3s Sync)...");

        introContainer.classList.add('lobby-transition');
        introBingoLogo.classList.add('transitioning');

        // Allow a small beat before starting the move and UI fade
        setTimeout(() => {
            introBingoLogo.classList.add('header-pos');

            // Stagger the fade-in of the main game UI
            const activeScreen = document.querySelector('.screen.view-active');
            if (activeScreen) {
                activeScreen.classList.remove('hidden');
                activeScreen.style.opacity = '0';
                activeScreen.style.transition = 'opacity 2s ease-in-out'; // Smooth fade completing with logo

                // Delay lobby reveal until logo is well into its travel (1000ms)
                setTimeout(() => {
                    activeScreen.style.opacity = '1';
                }, 1000); 
            }

            // Gradually fade out the intro background/system
            setTimeout(() => {
                introContainer.style.opacity = '0';
                setTimeout(() => {
                    introContainer.classList.add('hidden');
                    introContainer.style.opacity = '1';
                }, 3000); // Background dissolve
            }, 500);

            // Final step: Make the logo part of the scroll flow (matched to 3s travel)
            setTimeout(() => {
                introBingoLogo.classList.add('final-pos');
            }, 3050); 

        }, 100);
    }
};

// Initial Screen Routing
if (roomCode) {
    roomCode = roomCode.toUpperCase();
    document.getElementById('room-code-display').textContent = `#${roomCode}`;
    const lobbyRoomCode = document.getElementById('lobby-room-code');
    if (lobbyRoomCode) lobbyRoomCode.textContent = `#${roomCode}`;
    showScreen('lobby');
} else {
    showScreen('landing');
}

// ==========================================
// LANDING LOGIC
// ==========================================

createRoomBtn.addEventListener('click', () => {
    SoundManager.playBgMusic(1500);
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let newRoom = '';
    for (let i = 0; i < 5; i++) newRoom += chars.charAt(Math.floor(Math.random() * chars.length));
    window.location.href = `/?room=${newRoom}`;
});

modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        SoundManager.playBtnClick();
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

joinBtn.addEventListener('pointerdown', () => {
    SoundManager.playJoin();
    SoundManager.playBgMusic(0);
});

joinBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (name && roomCode) {
        socket.emit('join_game', { name: name, room: roomCode });
        loginPanel.classList.add('hidden');
        lobbyPanel.classList.remove('hidden');
        inviteLink.textContent = window.location.href;

        qrcodeContainer.innerHTML = '';
        new QRCode(qrcodeContainer, {
            text: window.location.href,
            width: 156,
            height: 156,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.L
        });
        lobbyHeaderLogo.classList.remove('hidden');
        lobbyHeaderLogo.style.opacity = "1";

    } else {
        showNotification('Please enter a name!');
    }
});

nameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinBtn.click();
});

copyLinkBtn.addEventListener('click', () => {
    SoundManager.playBtnClick();
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
        if (p.id === myId) { isHost = p.is_host; }
        if (!p.board_ready) allReady = false;

        const li = document.createElement('li');
        li.className = `player-item ${p.is_host ? 'host' : ''} ${p.board_ready ? 'ready' : ''}`;
        let statusText = p.board_ready ? 'Ready' : 'Arranging...';
        if (p.is_host) statusText += ' (Host)';
        li.innerHTML = `<span>${p.name} ${p.id === myId ? '(You)' : ''}</span><span class="status-indicator ${p.board_ready ? 'ready' : ''}">${statusText}</span>`;
        playerList.appendChild(li);

        const miniLi = document.createElement('li');
        let linesDisplay = p.id === myId ? `${p.bingo_lines} Lines` : `? Lines`;
        miniLi.innerHTML = `<span>${p.name} ${p.id === myId ? '(You)' : ''}</span><span class="accent">${linesDisplay}</span>`;
        gamePlayerList.appendChild(miniLi);
    });

    if (!gameStarted) {
        if (gameModeSection) gameModeSection.classList.remove('hidden');
        if (modeBtns) modeBtns.forEach(btn => { btn.disabled = !isHost; });
    } else {
        if (gameModeSection) gameModeSection.classList.add('hidden');
    }

    if (isHost && !gameStarted) {
        waitingMsg.classList.add('hidden');
        startGameBtn.classList.remove('hidden');
        startGameBtn.disabled = !allReady || players.length === 0;
        startGameBtn.textContent = !startGameBtn.disabled ? 'Start Game' : 'Waiting for players...';
    } else if (!isHost && !gameStarted) {
        waitingMsg.classList.remove('hidden');
        startGameBtn.classList.add('hidden');
    }
});

socket.on('leaderboard_update', (data) => {
    const leaderboard = data.leaderboard;
    if (gameLeaderboardList) {
        gameLeaderboardList.innerHTML = '';
        leaderboard.forEach((player, index) => {
            const li = document.createElement('li');
            li.className = `leaderboard-item ${index === 0 && player.wins > 0 ? 'leader' : ''}`;
            let nameDisplay = (index === 0 && player.wins > 0) ? `👑 ${player.name}` : player.name;
            li.innerHTML = `<span>${nameDisplay}</span><span class="accent">${player.wins} win${player.wins !== 1 ? 's' : ''}</span>`;
            gameLeaderboardList.appendChild(li);
        });
    }
});

socket.on('game_state', (data) => {
    if (data.game_started) showNotification('Game has already started!');
    if (data.grid_size && data.max_number) {
        gridSize = data.grid_size;
        maxNumber = data.max_number;
        myBoard = Array(maxNumber).fill(null);
        document.documentElement.style.setProperty('--grid-size', gridSize);
        modeBtns.forEach(btn => btn.classList.toggle('active', parseInt(btn.dataset.size) === gridSize));
    }
});

socket.on('grid_size_selected', (data) => {
    gridSize = data.grid_size;
    maxNumber = data.max_number;
    myBoard = Array(maxNumber).fill(null);
    boardReady = false;
    document.documentElement.style.setProperty('--grid-size', gridSize);
    modeBtns.forEach(btn => btn.classList.toggle('active', parseInt(btn.dataset.size) === gridSize));
    setupBoardBtn.textContent = 'Setup My Board';
    submitBoardBtn.disabled = true;
});

// ==========================================
// BOARD SETUP LOGIC
// ==========================================

setupBoardBtn.addEventListener('click', () => {
    SoundManager.playBtnClick();
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
                SoundManager.playBtnClick();
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
                SoundManager.playBtnClick();
                myBoard[i] = selectedPaletteNumber;
                const pEl = document.querySelector(`.palette-num[data-num="${selectedPaletteNumber}"]`);
                if (pEl) { pEl.classList.remove('selected'); pEl.classList.add('used'); }
                selectedPaletteNumber = null;
                renderSetupBoardUI();
                checkBoardComplete();
            } else if (val) {
                myBoard[i] = null;
                const pEl = document.querySelector(`.palette-num[data-num="${val}"]`);
                if (pEl) pEl.classList.remove('used');
                renderSetupBoardUI();
                checkBoardComplete();
            }
        });
        setupBoard.appendChild(cell);
    }
}

function checkBoardComplete() {
    submitBoardBtn.disabled = !myBoard.every(n => n !== null);
}

autoFillBtn.addEventListener('click', () => {
    SoundManager.playBtnClick();
    const nums = Array.from({ length: maxNumber }, (_, i) => i + 1);
    for (let i = nums.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [nums[i], nums[j]] = [nums[j], nums[i]];
    }
    myBoard = nums;
    selectedPaletteNumber = null;
    document.querySelectorAll('.palette-num').forEach(el => { el.classList.remove('selected'); el.classList.add('used'); });
    renderSetupBoardUI();
    checkBoardComplete();
});

submitBoardBtn.addEventListener('click', () => {
    SoundManager.playBtnClick();
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
    SoundManager.playStartGame();
    socket.emit('start_game', { room: roomCode });
});

socket.on('start_game', () => {
    showScreen('game');
    if (!myBoard.every(n => n !== null)) autoFillBtn.click();
    gameBoard.innerHTML = '';
    myBoard.forEach((num, i) => {
        const cell = document.createElement('div');
        cell.className = 'board-cell interactive text-center';
        cell.textContent = num;
        cell.id = `cell-${num}`;
        cell.addEventListener('click', () => {
            if (currentTurnSid === myId && !calledNumbers.includes(num)) {
                SoundManager.playBtnClick();
                socket.emit('call_number', { number: num, room: roomCode });
            } else if (currentTurnSid !== myId) {
                SoundManager.playNotYourTurn();
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
        SoundManager.playYourTurn();
        turnText.textContent = "It's YOUR Turn! (Pick a number)";
        turnText.className = 'accent animated-glow';
        gameBoard.classList.add('my-turn');
    } else {
        turnText.textContent = `It's ${data.turn_name}'s Turn`;
        turnText.className = '';
        gameBoard.classList.remove('my-turn');
    }
    startClientTimer();
});

function startClientTimer() {
    clearInterval(turnTimerInterval);
    timeLeft = 20;
    if (turnTimerEl) {
        turnTimerEl.classList.remove('hidden', 'low-time');
        turnTimerEl.textContent = timeLeft;
    }
    turnTimerInterval = setInterval(() => {
        timeLeft--;
        if (turnTimerEl) {
            turnTimerEl.textContent = timeLeft;
            if (timeLeft <= 5) turnTimerEl.classList.add('low-time');
        }
        if (timeLeft <= 0) clearInterval(turnTimerInterval);
    }, 1000);
}

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
    clearInterval(turnTimerInterval);
    if (turnTimerEl) turnTimerEl.classList.add('hidden');
});

// ==========================================
// BINGO DETECTION
// ==========================================

function checkBingo() {
    let completedLines = 0;
    const isLineCrossed = (indices) => indices.every(idx => calledNumbers.includes(myBoard[idx]));

    for (let r = 0; r < gridSize; r++) {
        const row = [];
        for (let c = 0; c < gridSize; c++) row.push(r * gridSize + c);
        if (isLineCrossed(row)) completedLines++;
    }
    for (let c = 0; c < gridSize; c++) {
        const col = [];
        for (let r = 0; r < gridSize; r++) col.push(r * gridSize + c);
        if (isLineCrossed(col)) completedLines++;
    }

    const d1 = [], d2 = [];
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
        if (bingoLines < 5) showNotification(`You got a line! (${bingoLines}/5)`);
    }
}

function updateBingoUI(lines) {
    for (let i = 0; i < 5; i++) {
        bingoLetters[i].classList.toggle('active', i < lines);
    }
}

socket.on('winner', (data) => {
    winOverlay.classList.remove('hidden');
    winnerNameEl.textContent = `${data.name} WON!`;
    if (data.sid === myId) SoundManager.playWin(); else SoundManager.playLoss();
    if (isHost) {
        hostControls.classList.remove('hidden');
        participantWaitMsg.classList.add('hidden');
    } else {
        hostControls.classList.add('hidden');
        participantWaitMsg.classList.remove('hidden');
    }
});

if (nextRoundBtn) {
    nextRoundBtn.addEventListener('click', () => {
        SoundManager.playBtnClick();
        if (isHost) socket.emit('next_round', { room: roomCode });
    });
}

if (endSessionBtn) {
    endSessionBtn.addEventListener('click', () => {
        SoundManager.playBtnClick();
        if (isHost) {
            if (confirm("Are you sure?")) socket.emit('end_session', { room: roomCode });
        }
    });
}

socket.on('next_round', () => {
    winOverlay.classList.add('hidden');
    myBoard = Array(maxNumber).fill(null);
    boardReady = false;
    calledNumbers = [];
    bingoLines = 0;
    currentTurnSid = null;
    selectedPaletteNumber = null;
    document.querySelectorAll('.board-cell').forEach(c => c.classList.remove('crossed', 'recent-call'));
    lastNumberDisplay.textContent = '-';
    calledHistory.innerHTML = '';
    bingoLetters.forEach(l => l.classList.remove('active'));
    clearInterval(turnTimerInterval);
    if (turnTimerEl) turnTimerEl.classList.add('hidden');
    SoundManager.stopAllLoopingSounds();
    showScreen('lobby');
    setupBoardBtn.textContent = 'Setup My Board';
    submitBoardBtn.disabled = true;
});

socket.on('end_session', () => {
    showNotification("Host ended session.");
    setTimeout(() => { window.location.href = '/'; }, 2000);
});

// Initialize on load
window.addEventListener('load', () => {
    console.log("Window loaded. Starting SoundManager...");
    SoundManager.init();
});

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
/* 
const chatToggleBtn = document.getElementById('chat-toggle-btn');
const chatContainer = document.getElementById('chat-container');
const closeChatBtn = document.getElementById('close-chat-btn');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');
const chatBadge = document.getElementById('chat-badge');
const sidebarMessages = document.getElementById('sidebar-messages');
const sidebarChatInput = document.getElementById('sidebar-chat-input');
const sidebarSendBtn = document.getElementById('sidebar-send-btn');
const topChatBtn = document.getElementById('top-chat-btn');
const topChatBadge = document.getElementById('top-chat-badge');
const floatingChatBtn = document.getElementById('floating-chat-btn');
const floatingChatBadge = document.getElementById('floating-chat-badge');
*/

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
/* 
let chatUnreadCount = 0;
let isChatOpen = false; 
*/

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

    // 18+ Mode sounds
    win18: new Audio('/static/sounds/bete-win.mp3'),
    loss18: new Audio('/static/sounds/bsdk-loss.mp3'),
    btnClick18: new Audio('/static/sounds/ahh-btn.mp3'),

    isMuted: false,
    is18Plus: false,
    bgmVolume: 0.2,
    sfxVolume: 0.5,

    init() {
        // Load settings from localStorage
        const savedBgmVol = localStorage.getItem('bgmVolume');
        const savedSfxVol = localStorage.getItem('sfxVolume');
        const savedIsMuted = localStorage.getItem('bgmMuted');
        const savedIs18Plus = localStorage.getItem('is18Plus');

        if (savedBgmVol !== null) this.bgmVolume = parseFloat(savedBgmVol);
        if (savedSfxVol !== null) this.sfxVolume = parseFloat(savedSfxVol);
        if (savedIsMuted !== null) this.isMuted = savedIsMuted === 'true';
        if (savedIs18Plus !== null) this.is18Plus = savedIs18Plus === 'true';

        // Update UI elements to match state
        if (bgmVolumeSlider) bgmVolumeSlider.value = this.bgmVolume * 100;
        if (sfxVolumeSlider) sfxVolumeSlider.value = this.sfxVolume * 100;
        if (bgmToggle) bgmToggle.checked = !this.isMuted;
        if (mode18Toggle) mode18Toggle.checked = this.is18Plus;

        this.bgMusic.loop = true;
        this.loss18.loop = true; // Loop the 18+ loss sound as requested
        this.updateVolumes();

        // When join-room finishes, wait 0.5s before kicking off BG music
        this.joinRoom.addEventListener('ended', () => {
            this.playBgMusic(500);
        });
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
        // Stop all win and loss sounds
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

// Initialize sounds
SoundManager.init();

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

// ==========================================
// CHAT LOGIC
// ==========================================

/* 
function toggleChat() {
    isChatOpen = !isChatOpen;
    if (isChatOpen) {
        chatContainer.classList.remove('hidden');
        chatUnreadCount = 0;
        updateChatBadge();
        chatInput.focus();
    } else {
        chatContainer.classList.add('hidden');
    }
}
*/

/* 
function updateChatBadge() {
    if (chatUnreadCount > 0 && !isChatOpen) {
        const badges = [chatBadge, topChatBadge, floatingChatBadge];
        badges.forEach(badge => {
            if (badge) {
                badge.textContent = chatUnreadCount;
                badge.classList.remove('hidden');
            }
        });
    } else {
        const badges = [chatBadge, topChatBadge, floatingChatBadge];
        badges.forEach(badge => {
            if (badge) badge.classList.add('hidden');
        });
    }
}
*/

/* 
function sendChatMessage(inputType = 'floating') {
    const input = inputType === 'sidebar' ? sidebarChatInput : chatInput;
    const message = input.value.trim();
    if (message) {
        socket.emit('send_message', { message: message, room: roomCode });
        input.value = '';
    }
}
*/

/* 
function appendMessage(data) {
    const isSelf = data.sid === socket.id;
    
    // Create element for floating chat
    const msgEl = document.createElement('div');
    msgEl.className = `message ${isSelf ? 'message-self' : 'message-user'}`;
    msgEl.innerHTML = `
        ${!isSelf ? `<span class="message-sender">${data.name}</span>` : ''}
        <span class="message-text">${data.message}</span>
    `;
    
    chatMessages.appendChild(msgEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Create a clone for the sidebar chat
    if (sidebarMessages) {
        const sidebarMsgEl = msgEl.cloneNode(true);
        sidebarMessages.appendChild(sidebarMsgEl);
        sidebarMessages.scrollTop = sidebarMessages.scrollHeight;
    }
    
    if (!isChatOpen && !isSelf) {
        chatUnreadCount++;
        updateChatBadge();
    }
}
*/

/* 
if (chatToggleBtn) {
    chatToggleBtn.addEventListener('click', () => {
        SoundManager.playBtnClick();
        toggleChat();
    });
}

if (topChatBtn) {
    topChatBtn.addEventListener('click', () => {
        SoundManager.playBtnClick();
        toggleChat();
    });
}

if (floatingChatBtn) {
    floatingChatBtn.addEventListener('click', () => {
        SoundManager.playBtnClick();
        toggleChat();
    });
}

if (closeChatBtn) {
    closeChatBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        SoundManager.playBtnClick();
        toggleChat();
    });
}

if (sendChatBtn) {
    sendChatBtn.addEventListener('click', () => {
        SoundManager.playBtnClick();
        sendChatMessage();
    });
}

if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            SoundManager.playBtnClick();
            sendChatMessage('floating');
        }
    });
}

// Sidebar Chat Listeners
if (sidebarSendBtn) {
    sidebarSendBtn.addEventListener('click', () => {
        SoundManager.playBtnClick();
        sendChatMessage('sidebar');
    });
}

if (sidebarChatInput) {
    sidebarChatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            SoundManager.playBtnClick();
            sendChatMessage('sidebar');
        }
    });
}

socket.on('receive_message', (data) => {
    appendMessage(data);
});
*/

// ==========================================
// CINEMATIC INTRO LOGIC
// ==========================================

const IntroManager = {
    steps: {
        presents: document.getElementById('step-presents'),
        logo: document.getElementById('step-logo')
    },

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    async start() {
        console.log("Starting Cinematic Intro...");

        // Step 1: Dark Screen (Already handled by CSS initial state)
        await this.delay(500);

        // Step 2: CyberEDT Games presents
        this.steps.presents.classList.remove('hidden');
        this.steps.presents.classList.add('active');
        await this.delay(3000); // Duration matches animation
        this.steps.presents.classList.remove('active');
        await this.delay(1000);

        // Step 3: CyberEDT Logo + Sound
        this.steps.logo.classList.remove('hidden');
        this.steps.logo.classList.add('active');
        SoundManager.intro.play().catch(e => console.log("Intro audio blocked"));

        await this.delay(5000); // Cinematic zoom duration
        
        // Step 4: Fade Out CyberEDT (Transition to next step)
        this.steps.logo.classList.add('fade-out');
        await this.delay(1000); // Brief dark pause for anticipation
        
        // Step 5: BINGO ROYALE Logo Cinematic Reveal
        introBingoLogo.classList.remove('hidden');
        // Add active class immediately; animation handles the rest
        introBingoLogo.classList.add('active');
        
        await this.delay(4000); // Display time for title

        // Step 6 & 7: Transition to Lobby
        this.transitionToLobby();
    },

    transitionToLobby() {
        console.log("Transitioning to Lobby...");

        // Move logo to its header position
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
                activeScreen.style.transition = 'opacity 1s ease-in-out';

                // Delay screen fade-in until logo has started moving
                setTimeout(() => {
                    activeScreen.style.opacity = '1';
                }, 300);
            }

            // Gradually fade out the intro background/system
            setTimeout(() => {
                introContainer.style.opacity = '0';
                setTimeout(() => {
                    introContainer.classList.add('hidden');
                    // Reset opacity for potential future use or just cleanup
                    introContainer.style.opacity = '1';
                }, 1000);
            }, 600);

            // Final step: Make the logo part of the scroll flow instead of fixed
            setTimeout(() => {
                introBingoLogo.classList.add('final-pos');
            }, 1000); 

        }, 50);
    }
};

// Initial Screen Routing
if (roomCode) {
    roomCode = roomCode.toUpperCase();
    document.getElementById('room-code-display').textContent = `#${roomCode}`;
    showScreen('lobby');
} else {
    showScreen('landing');
}

// Start Intro
window.addEventListener('load', () => {
    IntroManager.start();
});

// ==========================================
// LANDING LOGIC
// ==========================================

createRoomBtn.addEventListener('click', () => {
    SoundManager.playBgMusic(1500); // Start background music on user action (creates button click sound, delay is fine)
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

// Trigger audio on pointerdown for instant low-latency feedback instead of waiting for click release
joinBtn.addEventListener('pointerdown', () => {
    SoundManager.playJoin();
});

joinBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (name && roomCode) {
        socket.emit('join_game', { name: name, room: roomCode });

        /* 
        // --- TEMPORARILY DISABLED INTRO ---
        introOverlay.style.background = '#0b1b3b'; 
        introOverlay.classList.remove('hidden');
        introLogo.classList.remove('move-to-lobby-header', 'logo-show');
        
        setTimeout(() => {
            introLogo.classList.add('logo-show');
        }, 100);

        setTimeout(() => {
            introLogo.classList.add('move-to-lobby-header');
            introOverlay.style.background = 'transparent';
            
            loginPanel.classList.add('hidden');
            lobbyPanel.classList.remove('hidden');
            inviteLink.textContent = window.location.href;
            
            qrcodeContainer.innerHTML = '';
            new QRCode(qrcodeContainer, {
                text: window.location.href,
                width: 156,
                height: 156,
                colorDark : "#000000",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.L
            });

            setTimeout(() => {
                introOverlay.classList.add('hidden');
                lobbyHeaderLogo.classList.remove('hidden');
                lobbyHeaderLogo.style.opacity = "1";
            }, 1200);

        }, 4000); 
        */

        // Simple transition for now
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
        if (gameModeSection) gameModeSection.classList.remove('hidden');
        if (modeBtns) {
            modeBtns.forEach(btn => {
                btn.disabled = !isHost;
            });
        }
    } else {
        if (gameModeSection) gameModeSection.classList.add('hidden');
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

socket.on('leaderboard_update', (data) => {
    const leaderboard = data.leaderboard;
    if (gameLeaderboardList) {
        gameLeaderboardList.innerHTML = '';
        leaderboard.forEach((player, index) => {
            const li = document.createElement('li');
            li.className = `leaderboard-item ${index === 0 && player.wins > 0 ? 'leader' : ''}`;

            let nameDisplay = player.name;
            if (index === 0 && player.wins > 0) {
                nameDisplay = `👑 ${player.name}`;
            }

            li.innerHTML = `
                <span>${nameDisplay}</span>
                <span class="accent">${player.wins} win${player.wins !== 1 ? 's' : ''}</span>
            `;
            gameLeaderboardList.appendChild(li);
        });
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
                if (pEl) {
                    pEl.classList.remove('selected');
                    pEl.classList.add('used');
                }
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
    const isComplete = myBoard.every(n => n !== null);
    submitBoardBtn.disabled = !isComplete;
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
    document.querySelectorAll('.palette-num').forEach(el => {
        el.classList.remove('selected');
        el.classList.add('used');
    });
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
            if (timeLeft <= 5) {
                turnTimerEl.classList.add('low-time');
            }
        }

        if (timeLeft <= 0) {
            clearInterval(turnTimerInterval);
        }
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

    // Stop timer when a number is called
    clearInterval(turnTimerInterval);
    if (turnTimerEl) turnTimerEl.classList.add('hidden');
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

    if (data.sid === myId) {
        SoundManager.playWin();
    } else {
        SoundManager.playLoss();
    }

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
        if (isHost) {
            socket.emit('next_round', { room: roomCode });
        }
    });
}

if (endSessionBtn) {
    endSessionBtn.addEventListener('click', () => {
        SoundManager.playBtnClick();
        if (isHost) {
            if (confirm("Are you sure you want to end the session? This will clear all scores and close the room.")) {
                socket.emit('end_session', { room: roomCode });
            }
        }
    });
}

socket.on('next_round', () => {
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
    clearInterval(turnTimerInterval);
    if (turnTimerEl) turnTimerEl.classList.add('hidden');

    // Stop looping sounds from previous round
    SoundManager.stopAllLoopingSounds();

    // Return to lobby
    showScreen('lobby');
    setupBoardBtn.textContent = 'Setup My Board';
    submitBoardBtn.disabled = true;
});

socket.on('end_session', () => {
    showNotification("The host has ended the session.");
    setTimeout(() => {
        window.location.href = '/';
    }, 2000);
});

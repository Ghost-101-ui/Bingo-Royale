const socket = io('/admin');

// Chart Instances
let activityChart, engagementChart, heatmapChart;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    console.log("Admin Analytics Initializing...");
    initCharts();
    setupSocket();
    setupNavigation();
    updateClock();
    setInterval(updateClock, 1000);
});

function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-menu a:not(.logout)');
    const sections = document.querySelectorAll('.content-section');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('data-section');
            if (!targetId) return;

            // Update active link
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            // Show target section
            sections.forEach(sec => {
                if (sec.id === targetId || targetId === 'overview') {
                    sec.style.display = 'grid';
                    if (targetId === 'overview') {
                        // Overview shows everything, but we can refine this if needed
                        // For now, let's make it act like a real SPA
                        // If 'overview' is clicked, show specific overview items
                    }
                } else {
                    sec.style.display = 'none';
                }
            });

            // Special handling for "Overview" vs specific tabs
            if (targetId === 'overview') {
                document.querySelectorAll('.overview-only').forEach(el => el.style.display = 'grid');
                document.getElementById('rooms-section').style.display = 'grid';
                document.getElementById('leaderboard-section').style.display = 'grid';
            } else if (targetId === 'rooms-section') {
                document.querySelectorAll('.overview-only').forEach(el => el.style.display = 'none');
                document.getElementById('leaderboard-section').style.display = 'none';
                document.getElementById('rooms-section').style.display = 'grid';
            } else if (targetId === 'leaderboard-section') {
                document.querySelectorAll('.overview-only').forEach(el => el.style.display = 'none');
                document.getElementById('rooms-section').style.display = 'none';
                document.getElementById('leaderboard-section').style.display = 'grid';
            }
        });
    });
}

function updateClock() {
    const now = new Date();
    document.getElementById('server-time').textContent = now.toLocaleTimeString();
}

function initCharts() {
    const ctxActivity = document.getElementById('activityChart').getContext('2d');
    const ctxEngagement = document.getElementById('engagementChart').getContext('2d');
    const ctxHeatmap = document.getElementById('heatmapChart').getContext('2d');

    const chartConfig = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false }
        },
        scales: {
            y: {
                beginAtZero: true,
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                ticks: { color: '#8892b0' }
            },
            x: {
                grid: { display: false },
                ticks: { color: '#8892b0' }
            }
        }
    };

    activityChart = new Chart(ctxActivity, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Online Players',
                data: [],
                borderColor: '#f7a600',
                backgroundColor: 'rgba(247, 166, 0, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: chartConfig
    });

    engagementChart = new Chart(ctxEngagement, {
        type: 'bar',
        data: {
            labels: ['Games', 'Rounds'],
            datasets: [{
                data: [0, 0],
                backgroundColor: ['#f7a600', '#ffb733'],
                borderRadius: 8
            }]
        },
        options: chartConfig
    });

    heatmapChart = new Chart(ctxHeatmap, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Active Rooms',
                data: [],
                borderColor: '#f7a600',
                borderDash: [5, 5],
                tension: 0.2
            }]
        },
        options: chartConfig
    });
}

function setupSocket() {
    socket.on('connect', () => {
        console.log("Connected to Admin Namespace");
        socket.emit('join_admin');
    });

    socket.on('admin_update', (data) => {
        console.log("Received Admin Update:", data);
        updateStats(data.stats);
        updateRooms(data.rooms);
        updateCharts(data.history, data.stats);
        updateLeaderboard(data.leaderboard);
        updateSpotlight(data.most_active);
    });
}

function updateStats(stats) {
    document.getElementById('stat-total-rooms').textContent = stats.total_rooms_created;
    document.getElementById('stat-active-rooms').textContent = stats.active_rooms;
    document.getElementById('stat-total-players').textContent = stats.total_players_joined;
    document.getElementById('stat-online-players').textContent = stats.current_players_online;
    document.getElementById('stat-peak-players').textContent = stats.peak_players;
    
    const avgRounds = stats.total_games_played > 0 
        ? (stats.total_rounds_played / stats.total_games_played).toFixed(2) 
        : "0.00";
    document.getElementById('stat-avg-rounds').textContent = avgRounds;
}

function updateRooms(rooms) {
    const tbody = document.querySelector('#rooms-table tbody');
    const countBadge = document.getElementById('room-count');
    countBadge.textContent = Object.keys(rooms).length;
    
    tbody.innerHTML = '';
    
    if (Object.keys(rooms).length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">No active rooms</td></tr>';
        return;
    }

    Object.entries(rooms).forEach(([id, room]) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>#${id}</td>
            <td>${room.player_count}</td>
            <td>${room.round}</td>
            <td><span class="status ${room.status}">${room.status}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

function updateLeaderboard(leaders) {
    const tbody = document.querySelector('#leaderboard-table tbody');
    tbody.innerHTML = '';
    
    if (leaders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" class="text-center">No wins recorded yet</td></tr>';
        return;
    }

    leaders.forEach(([name, wins]) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${name}</td>
            <td class="wins">${wins}</td>
        `;
        tbody.appendChild(tr);
    });
}

function updateSpotlight(room) {
    const container = document.getElementById('active-room-spotlight');
    if (!room) {
        container.innerHTML = '<p class="empty-msg" style="text-align:center; padding: 2rem; color: #8892b0;">No active games</p>';
        return;
    }

    container.innerHTML = `
        <div class="spotlight-room">
            <p style="font-size: 0.8rem; color: #8892b0; margin-bottom: 5px;">ROOM ID</p>
            <h1>#${room.id}</h1>
            <div class="spotlight-grid">
                <div class="spotlight-item">
                    <div class="val">${room.players}</div>
                    <div class="lab">Players</div>
                </div>
                <div class="spotlight-item">
                    <div class="val">${room.round}</div>
                    <div class="lab">Round</div>
                </div>
            </div>
            <div style="margin-top: 1.5rem;">
                <span class="status ${room.status}">${room.status}</span>
            </div>
        </div>
    `;
}

function updateCharts(history, stats) {
    if (!history || history.length === 0) return;

    // 1. Activity Chart (Online Players)
    activityChart.data.labels = history.map(h => new Date(h.timestamp * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'}));
    activityChart.data.datasets[0].data = history.map(h => h.players_online);
    activityChart.update('none'); // Update without animation for performance

    // 2. Engagement Chart
    engagementChart.data.datasets[0].data = [stats.total_games_played, stats.total_rounds_played];
    engagementChart.update();

    // 3. Heatmap Chart (Active Rooms History)
    heatmapChart.data.labels = history.map(h => new Date(h.timestamp * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'}));
    heatmapChart.data.datasets[0].data = history.map(h => h.active_rooms);
    heatmapChart.update('none');
}

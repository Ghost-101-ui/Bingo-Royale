from flask import Flask, render_template, request, redirect, session
import time
from flask_socketio import SocketIO, emit, join_room, leave_room
import threading
import random
import os
from flask_sqlalchemy import SQLAlchemy
from typing import Dict, List, Any, Optional, cast, Tuple
from itertools import islice

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'

# Database Configuration
basedir = os.path.abspath(os.path.dirname(__file__))
# Handle Render's 'postgres://' vs SQLAlchemy's required 'postgresql://'
db_url = os.environ.get('DATABASE_URL')
if db_url and db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql+psycopg://", 1)
elif db_url and db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)

app.config['SQLALCHEMY_DATABASE_URI'] = db_url or \
    'sqlite:///' + os.path.join(basedir, 'bingo.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

socketio = SocketIO(app, cors_allowed_origins='*', logger=True, engineio_logger=True, async_mode='eventlet')

# Database Models
class PlatformStat(db.Model):
    key = db.Column(db.String(50), primary_key=True)
    value = db.Column(db.Integer, default=0)
    
    def __init__(self, key: str, value: int = 0):
        self.key = key
        self.value = value

class PlayerWin(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    wins = db.Column(db.Integer, default=0)
    
    def __init__(self, name: str, wins: int = 0):
        self.name = name
        self.wins = wins

with app.app_context():
    db.create_all()
    # Initialize platform stats if they don't exist
    keys = ["total_rooms_created", "active_rooms", "total_players_joined", 
            "current_players_online", "total_games_played", "total_rounds_played", "peak_players"]
    for k in keys:
        if not PlatformStat.query.filter_by(key=k).first():
            db.session.add(PlatformStat(key=k, value=0))
    db.session.commit()

# Admin Security
ADMIN_PASSWORD = "dhruv@admin123"

# Persistent Data Trackers (Syncs with DB automatically)
class StatsTracker:
    def __getitem__(self, key):
        with app.app_context():
            stat = PlatformStat.query.filter_by(key=key).first()
            return stat.value if stat else 0
    
    def __setitem__(self, key, value):
        with app.app_context():
            stat = PlatformStat.query.filter_by(key=key).first()
            if stat:
                stat.value = value
            else:
                stat = PlatformStat(key=key, value=value)
                db.session.add(stat)
            db.session.commit()
    
    def get(self, key, default=0):
        return self[key]

    def to_dict(self):
        return dict(self.items())

    def items(self):
        with app.app_context():
            return [(s.key, s.value) for s in PlatformStat.query.all()]

class LeaderboardTracker:
    def __getitem__(self, key):
        with app.app_context():
            win = PlayerWin.query.filter_by(name=key).first()
            return win.wins if win else 0
    
    def __setitem__(self, key, value):
        with app.app_context():
            win = PlayerWin.query.filter_by(name=key).first()
            if win:
                win.wins = value
            else:
                win = PlayerWin(name=key, wins=value)
                db.session.add(win)
            db.session.commit()
    
    def get(self, key, default=0):
        return self[key]
    
    def items(self):
        with app.app_context():
            return [(w.name, w.wins) for w in PlayerWin.query.all()]

platform_stats = StatsTracker()
global_leaderboard = LeaderboardTracker()

# Current Session Data
rooms: Dict[str, Any] = {}
sid_to_room: Dict[str, str] = {}
stats_history: List[Dict[str, Any]] = [] 

@app.route('/')
def index():
    return render_template('index.html')

# ==========================================
# ADMIN DASHBOARD SYSTEM
# ==========================================

@app.route('/dhruv-only-see-6x10', methods=['GET', 'POST'])
def admin_login():
    error = None
    if request.method == 'POST':
        if request.form.get('password') == ADMIN_PASSWORD:
            session['admin'] = True
            return redirect('/dhruv-only-see-6x10/dashboard')
        else:
            error = "Wrong Password"
    return render_template('admin_login.html', error=error)

@app.route('/dhruv-only-see-6x10/dashboard')
def admin_dashboard():
    if not session.get('admin'):
        return redirect('/dhruv-only-see-6x10')
    
    # Calculate derived stats
    avg_rounds = 0.0
    total_games = platform_stats.get('total_games_played', 0)
    total_rounds = platform_stats.get('total_rounds_played', 0)
    if total_games > 0:
        avg_rounds = round(float(total_rounds) / total_games, 2)
    
    # Sort global leaderboard
    leaderboard_items: List[Tuple[str, int]] = list(global_leaderboard.items())
    sorted_global = sorted(leaderboard_items, key=lambda x: int(x[1]), reverse=True)
    # Use islice to satisfy strict type checkers that don't like list slicing
    top_10 = list(islice(sorted_global, 10))
    
    return render_template('admin_dashboard.html', 
                          stats=platform_stats, 
                          rooms=rooms,
                          avg_rounds=avg_rounds,
                          global_leaderboard=top_10)

def emit_admin_update():
    """Helper to broadcast platform state to admin dashboard listeners"""
    # Create a simple snapshot for history
    snapshot = {
        "timestamp": int(time.time()),
        "players_online": platform_stats["current_players_online"],
        "active_rooms": platform_stats["active_rooms"]
    }
    stats_history.append(snapshot)
    if len(stats_history) > 50: stats_history.pop(0) # Keep last 50 data points

    # Find the most active room
    most_active = None
    stats_dict = platform_stats.to_dict()
    if rooms:
        # Sort by player count first, then round number
        sorted_rooms = sorted(rooms.items(), 
                            key=lambda x: (len(x[1].get('players', {})), x[1].get('round', 0)), 
                            reverse=True)
        id, r_data = sorted_rooms[0]
        most_active = {
            "id": id,
            "players": len(cast(dict, r_data.get('players', {}))),
            "round": r_data.get('round', 1),
            "status": "playing" if r_data.get('game_started') else "waiting"
        }

    socketio.emit('admin_update', {
        'stats': stats_dict,
        'rooms': {rid: {
            'player_count': len(r.get('players', {})),
            'status': 'playing' if r.get('game_started') else 'waiting',
            'round': r.get('round', 1)
        } for rid, r in rooms.items()},
        'leaderboard': list(islice(sorted(list(global_leaderboard.items()), key=lambda x: int(x[1]), reverse=True), 10)),
        'history': stats_history,
        'most_active': most_active
    }, namespace='/admin')

@socketio.on('join_admin', namespace='/admin')
def on_join_admin():
    if session.get('admin'):
        join_room('admin_room')
        emit_admin_update()

@app.route('/dhruv-only-see-6x10/logout')
def admin_logout():
    session.pop('admin', None)
    return redirect('/')

# ==========================================
# SOCKET.IO LOGIC
# ==========================================

@socketio.on('connect')
def handle_connect():
    print(f"Client connected: {request.sid}")

@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    if sid in sid_to_room:
        room_id = sid_to_room[sid]
        print(f"Client {sid} disconnected from room {room_id}")
        
        if room_id in rooms:
            room = rooms[room_id]
            if sid in room['players']:
                name = room['players'][sid]['name']
                del room['players'][sid]
                
                # Analytics: Player Leave
                platform_stats["current_players_online"] = max(0, platform_stats["current_players_online"] - 1)
                emit_admin_update()
                
                # Assign new host if host disconnected
                if sid == room['host_sid']:
                    if room['players']:
                        room['host_sid'] = list(room['players'].keys())[0]
                    else:
                        room['host_sid'] = None
                        # Delete room if empty
                        if room_id in rooms:
                            rooms[room_id]['turn_version'] = rooms[room_id].get('turn_version', 0) + 1
                        
                        # Analytics: Room End
                        platform_stats["active_rooms"] = max(0, platform_stats["active_rooms"] - 1)
                        emit_admin_update()
                        
                    if room_id is not None:
                        rooms.pop(room_id, None)
                        
                # Remove from turn tracking if game is started
                if room_id in rooms and room['game_started'] and sid in room['turn_order']:
                    idx = room['turn_order'].index(sid)
                    room['turn_order'].remove(sid)
                    
                    if not room['turn_order']:
                        # Everyone left but room remains? Edge case
                        pass
                    else:
                        if idx < room['current_turn_index']:
                            room['current_turn_index'] -= 1
                        elif room['current_turn_index'] >= len(room['turn_order']):
                            room['current_turn_index'] = 0
                            
                        # Emit a turn update
                        current_turn_sid = room['turn_order'][room['current_turn_index']]
                        current_turn_name = room['players'][current_turn_sid]['name'] if current_turn_sid in room['players'] else 'Unknown'
                        socketio.emit('turn_changed', {'turn_sid': current_turn_sid, 'turn_name': current_turn_name}, to=room_id)
            
            if room_id in rooms:
                emit_player_list(room_id)
                # If it was the disconnected player's turn, the timer should be reset/handled
                # but start_turn_timer already cancels previous timers.
                if room['game_started'] and room['turn_order']:
                    start_turn_timer(room_id)
                
        sid_to_room.pop(sid, None)

def cancel_room_timer(room_id):
    if room_id in rooms:
        # Incrementing the version effectively cancels any running background tasks
        rooms[room_id]['turn_version'] = rooms[room_id].get('turn_version', 0) + 1

def start_turn_timer(room_id, duration=20):
    if room_id not in rooms or not rooms[room_id]['game_started']:
        return

    # Increment version to "cancel" previous tasks
    version = rooms[room_id].get('turn_version', 0) + 1
    rooms[room_id]['turn_version'] = version
    
    def timer_task(r_id, v):
        socketio.sleep(duration)
        # Check if this task is still the current one for the room
        if r_id in rooms and rooms[r_id].get('turn_version') == v:
            if rooms[r_id]['game_started'] and not rooms[r_id]['round_won']:
                auto_select_number(r_id)

    socketio.start_background_task(timer_task, room_id, version)

def auto_select_number(room_id):
    if room_id not in rooms:
        return
    
    room = rooms[room_id]
    if not room['game_started'] or room['round_won']:
        return

    if not room['turn_order']:
        return

    # Find the current player's SID
    current_sid = room['turn_order'][room['current_turn_index']]
    
    # Pick a random number that hasn't been called
    max_num = room.get('max_number', 25)
    available_numbers = [i for i in range(1, max_num + 1) if i not in room['called_numbers']]
    
    if not available_numbers:
        return

    number = random.choice(available_numbers)
    
    # Process the choice (using the logic from on_call_number but for an internal call)
    room['called_numbers'].append(number)
    
    # Move to next person
    room['current_turn_index'] = (room['current_turn_index'] + 1) % len(room['turn_order'])
    next_turn_sid = room['turn_order'][room['current_turn_index']]
    next_turn_name = room['players'][next_turn_sid]['name']
    
    # Tell everyone
    socketio.emit('number_called', {'number': number, 'called_numbers': room['called_numbers'], 'auto': True}, to=room_id)
    socketio.emit('turn_changed', {'turn_sid': next_turn_sid, 'turn_name': next_turn_name}, to=room_id)
    
    # Start timer for next person
    start_turn_timer(room_id)

def emit_player_list(room_id):
    if room_id not in rooms:
        return
    room = rooms[room_id]
    player_data = []
    for sid, data in room['players'].items():
        player_data.append({
            'id': sid,
            'name': data['name'],
            'is_host': sid == room['host_sid'],
            'board_ready': data['board_ready'],
            'bingo_lines': data['bingo_lines']
        })
    socketio.emit('player_list', {'players': player_data, 'game_started': room['game_started']}, to=room_id)

def emit_leaderboard(room_id):
    if room_id not in rooms:
        return
    room = rooms[room_id]
    sorted_leaderboard = sorted(room['leaderboard'].items(), key=lambda x: x[1], reverse=True)
    leaderboard_data = [{'name': name, 'wins': wins} for name, wins in sorted_leaderboard]
    socketio.emit('leaderboard_update', {'leaderboard': leaderboard_data}, to=room_id)

@socketio.on('join_game')
def on_join_game(data):
    room_id = data.get('room', '').upper()
    name = data.get('name', '').strip()
    
    if not name or not room_id:
        return
        
    sid = request.sid
    join_room(room_id)
    sid_to_room[sid] = room_id
    
    if room_id not in rooms:
        rooms[room_id] = {
            'players': {},
            'game_started': False,
            'called_numbers': [],
            'host_sid': sid,
            'turn_order': [],
            'current_turn_index': 0,
            'grid_size': 5,
            'max_number': 25,
            'leaderboard': {},
            'round_won': False,
            'created_at': int(time.time())
        }
        # Analytics: Room Create
        platform_stats["total_rooms_created"] += 1
        platform_stats["active_rooms"] += 1
        emit_admin_update()
    
    room = rooms[room_id]
    
    # If host disconnected and rejoining as first person (rare, but just in case)
    if room['host_sid'] is None and not room['players']:
        room['host_sid'] = sid
        
    room['players'][sid] = {
        'name': name,
        'board_ready': False,
        'bingo_lines': 0
    }
    
    # Analytics: Player Join
    platform_stats["total_players_joined"] += 1
    platform_stats["current_players_online"] += 1
    if platform_stats["current_players_online"] > platform_stats["peak_players"]:
        platform_stats["peak_players"] = platform_stats["current_players_online"]
    emit_admin_update()
    
    if name not in room['leaderboard']:
        room['leaderboard'][name] = 0
        
    emit_player_list(room_id)
    emit_leaderboard(room_id)
    emit('game_state', {
        'game_started': room['game_started'],
        'called_numbers': room['called_numbers'],
        'grid_size': room.get('grid_size', 5),
        'max_number': room.get('max_number', 25)
    }, to=sid)

@socketio.on('set_board')
def on_set_board(data):
    sid = request.sid
    r_id = sid_to_room.get(sid)
    if r_id and r_id in rooms:
        room = rooms[r_id]
        if sid in room['players'] and not room['game_started']:
            room['players'][sid]['board_ready'] = True
            emit_player_list(r_id)

@socketio.on('select_grid_size')
def on_select_grid_size(data):
    sid = request.sid
    room_id = sid_to_room.get(sid)
    if room_id and room_id in rooms:
        room = rooms[room_id]
        if sid == room['host_sid'] and not room['game_started']:
            try:
                size_map = {
                    '5': (5, 25),
                    '6': (6, 36),
                    '7': (7, 49),
                    '8': (8, 64),
                    '9': (9, 81),
                    '10': (10, 100)
                }
                grid_size_str = str(data.get('size'))
                if grid_size_str in size_map:
                    grid_size, max_number = size_map[grid_size_str]
                    room['grid_size'] = grid_size
                    room['max_number'] = max_number
                    
                    # Reset all players' board ready state
                    for p_sid in room['players']:
                        room['players'][p_sid]['board_ready'] = False
                    
                    socketio.emit('grid_size_selected', {'grid_size': grid_size, 'max_number': max_number}, to=room_id)
                    emit_player_list(room_id)
            except ValueError:
                pass

@socketio.on('start_game')
def on_start_game(data):
    sid = request.sid
    room_id = sid_to_room.get(sid)
    if room_id and room_id in rooms:
        room = rooms[room_id]
        if sid == room['host_sid'] and not room['game_started']:
            all_ready = all(p['board_ready'] for p in room['players'].values())
            if all_ready and len(room['players']) > 0:
                room['game_started'] = True
                room['round_won'] = False
                
                # Analytics: Game Start
                platform_stats["total_games_played"] += 1
                platform_stats["total_rounds_played"] += 1
                room['round'] = 1
                emit_admin_update()
                
                # Setup turn order (host first, then others)
                turn_order = [room['host_sid']]
                for player_sid in room['players'].keys():
                    if player_sid != room['host_sid']:
                        turn_order.append(player_sid)
                        
                room['turn_order'] = turn_order
                room['current_turn_index'] = 0
                
                socketio.emit('start_game', {'status': 'started'}, to=room_id)
                emit_player_list(room_id)
                
                # Broadcast the first turn after starting
                current_turn_sid = room['turn_order'][room['current_turn_index']]
                current_turn_name = room['players'][current_turn_sid]['name']
                socketio.emit('turn_changed', {'turn_sid': current_turn_sid, 'turn_name': current_turn_name}, to=room_id)
                
                # Start the 20s timer for the first player
                start_turn_timer(room_id)

@socketio.on('call_number')
def on_call_number(data):
    sid = request.sid
    r_id = sid_to_room.get(sid)
    if r_id and r_id in rooms:
        room = rooms[r_id]
        if room['game_started']:
            if not room['turn_order']: return
            
            expected_sid = room['turn_order'][room['current_turn_index']]
            if sid == expected_sid:
                try:
                    number = int(data.get('number'))
                    max_num = room.get('max_number', 25)
                    if number not in room['called_numbers'] and 1 <= number <= max_num:
                        room['called_numbers'].append(number)
                        
                        # Move to next person
                        room['current_turn_index'] = (room['current_turn_index'] + 1) % len(room['turn_order'])
                        next_turn_sid = room['turn_order'][room['current_turn_index']]
                        next_turn_name = room['players'][next_turn_sid]['name']
                        
                        # Tell everyone
                        socketio.emit('number_called', {'number': number, 'called_numbers': room['called_numbers']}, to=r_id)
                        socketio.emit('turn_changed', {'turn_sid': next_turn_sid, 'turn_name': next_turn_name}, to=r_id)
                        
                        # Reset timer for the next person
                        start_turn_timer(r_id)
                except ValueError:
                    pass

@socketio.on('bingo_update')
def on_bingo_update(data):
    sid = request.sid
    r_id = sid_to_room.get(sid)
    if r_id and r_id in rooms:
        room = rooms[r_id]
        if sid in room['players'] and room['game_started']:
            lines = int(data.get('lines', 0))
            room['players'][sid]['bingo_lines'] = lines
            
            emit_player_list(r_id)
            
            if lines >= 5:
                if not room.get('round_won', False):
                    room['round_won'] = True
                    winner_name = room['players'][sid]['name']
                    room['leaderboard'][winner_name] = room['leaderboard'].get(winner_name, 0) + 1
                    
                    # Analytics: Global Leaderboard
                    global_leaderboard[winner_name] = global_leaderboard.get(winner_name, 0) + 1
                    emit_admin_update()
                    
                    emit_leaderboard(r_id)
                    socketio.emit('winner', {'name': winner_name, 'sid': sid}, to=r_id)
                    
                    # Stop the timer when someone wins
                    cancel_room_timer(r_id)

@socketio.on('next_round')
def on_next_round(data):
    sid = request.sid
    r_id = sid_to_room.get(sid)
    if r_id and r_id in rooms:
        room = rooms[r_id]
        if sid == room['host_sid']:
            room['game_started'] = False
            room['called_numbers'] = []
            room['turn_order'] = []
            room['current_turn_index'] = 0
            room['round_won'] = False
            
            # Analytics: Next Round
            platform_stats["total_rounds_played"] += 1
            room['round'] = room.get('round', 0) + 1
            emit_admin_update()
            
            for p_sid in room['players']:
                room['players'][p_sid]['board_ready'] = False
                room['players'][p_sid]['bingo_lines'] = 0
                
            socketio.emit('next_round', to=r_id)
            emit_player_list(r_id)
            cancel_room_timer(r_id)

@socketio.on('end_session')
def on_end_session(data):
    sid = request.sid
    room_id = sid_to_room.get(sid)
    if room_id and room_id in rooms:
        room = rooms[room_id]
        if sid == room['host_sid']:
            socketio.emit('end_session', to=room_id)
            if room_id in rooms:
                rooms[room_id]['turn_version'] = rooms[room_id].get('turn_version', 0) + 1
                # Analytics: Room End
                platform_stats["active_rooms"] = max(0, platform_stats["active_rooms"] - 1)
                emit_admin_update()
            rooms.pop(room_id, None)

# @socketio.on('send_message')
# def on_send_message(data):
#     sid = request.sid
#     room_id = sid_to_room.get(sid)
#     if room_id and room_id in rooms:
#         room = rooms[room_id]
#         if sid in room['players']:
#             name = room['players'][sid]['name']
#             message = data.get('message', '').strip()
#             if message:
#                 emit('receive_message', {
#                     'name': name,
#                     'message': message,
#                     'sid': sid,
#                     'type': 'user'
#                 }, to=room_id)

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000)

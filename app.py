import eventlet
eventlet.monkey_patch()
from flask import Flask, render_template, request, redirect, session
import time
from flask_socketio import SocketIO, emit, join_room, leave_room
import threading
import random
import os
from typing import Dict, List, Any, Optional, cast, Tuple
from itertools import islice

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'

# Admin Security
ADMIN_PASSWORD = "dhruv@admin123"

# Admin Security
ADMIN_PASSWORD = "dhruv@admin123"

# Persistent Data Trackers (Syncs with DB automatically)
# Simple In-Memory Data Trackers
class StatsTracker(dict):
    def __init__(self):
        super().__init__()
        self.update({
            "total_rooms_created": 0,
            "active_rooms": 0, 
            "total_players_joined": 0,
            "current_players_online": 0,
            "total_games_played": 0,
            "total_rounds_played": 0,
            "peak_players": 0
        })
    
    def to_dict(self):
        return {k: v for k, v in self.items()}

class LeaderboardTracker(dict):
    def get_wins(self, key):
        val = self.get(key, 0)
        return int(val) if val is not None else 0

platform_stats = StatsTracker()
global_leaderboard = LeaderboardTracker()

socketio = SocketIO(app, 
                    cors_allowed_origins='*', 
                    logger=True, 
                    engineio_logger=True, 
                    async_mode='eventlet',
                    ping_timeout=60,
                    ping_interval=25)

# Current Session Data
rooms: Dict[str, Any] = {}
sid_to_room: Dict[str, str] = {}
inactive_players: Dict[str, Dict[str, Any]] = {} # room_id -> {name -> {data, timeout_task}}
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
        avg_rounds = float("{:.2f}".format(float(total_rounds) / total_games))
    
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
                player_data = room['players'][sid]
                name = player_data['name']
                
                # Move to inactive instead of deleting immediately
                if room_id not in inactive_players:
                    inactive_players[room_id] = {}
                
                # Cancel existing timeout if any (shouldn't happen but for safety)
                if name in inactive_players[room_id]:
                    if inactive_players[room_id][name].get('timeout_task'):
                        inactive_players[room_id][name]['timeout_task'].cancel()

                def timeout_player(r_id, p_name):
                    socketio.sleep(60) # Wait 60 seconds for reconnection
                    if r_id in inactive_players and p_name in inactive_players[r_id]:
                        print(f"Player {p_name} timed out from room {r_id}")
                        inactive_players[r_id].pop(p_name, None)
                        
                        # Only now really remove them if they haven't reconnected
                        if r_id in rooms:
                            # Re-check if they reconnected (their name wouldn't be in inactive if they did)
                            # Actually delete from room if still not back
                            r_obj = rooms[r_id]
                            # If they were host, transfer host
                            if r_obj['host_sid'] == None and not r_obj['players']:
                                # Room is truly empty now
                                platform_stats["active_rooms"] = max(0, platform_stats["active_rooms"] - 1)
                                emit_admin_update()
                                rooms.pop(r_id, None)
                            elif not r_obj['players'] and not inactive_players[r_id]:
                                # No active players and no one waiting to reconnect
                                rooms.pop(r_id, None)

                task = socketio.start_background_task(timeout_player, room_id, name)
                inactive_players[room_id][name] = {
                    'data': player_data,
                    'timeout_task': task,
                    'sid': sid
                }

                room['players'].pop(sid, None)
                
                # Analytics: Player Leave
                platform_stats["current_players_online"] = max(0, platform_stats["current_players_online"] - 1)
                emit_admin_update()
                
                # If host leaves, don't transfer yet, wait for timeout
                if sid == room['host_sid']:
                    room['host_sid'] = None 
                    # We'll assign a new host only if someone else is active OR when this host times out
                    if room['players']:
                        room['host_sid'] = list(room['players'].keys())[0]

            if room_id in rooms:
                emit_player_list(room_id)
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
    
    # Active players
    for sid, data in room['players'].items():
        player_data.append({
            'id': sid,
            'name': data['name'],
            'is_host': sid == room['host_sid'],
            'board_ready': data['board_ready'],
            'bingo_lines': data['bingo_lines'],
            'is_online': True
        })
    
    # Inactive/Offline players
    if room_id in inactive_players:
        for name, data in inactive_players[room_id].items():
            # Check if this name is already in active players (should not be, but for safety)
            if not any(p['name'] == name for p in player_data):
                player_data.append({
                    'id': None,
                    'name': name,
                    'is_host': data['sid'] == room['host_sid'],
                    'board_ready': data['data']['board_ready'],
                    'bingo_lines': data['data']['bingo_lines'],
                    'is_online': False
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
            'created_at': int(time.time()),
            'active_vote': None
        }
        # Analytics: Room Create
        platform_stats["total_rooms_created"] += 1
        platform_stats["active_rooms"] += 1
        emit_admin_update()
    
    room = rooms[room_id]
    
    # Check for reconnection
    reconnecting = False
    if room_id in inactive_players and name in inactive_players[room_id]:
        print(f"Player {name} reconnecting to room {room_id}")
        old_data = inactive_players[room_id][name]['data']
        room['players'][sid] = old_data
        # If they were host, they might want host back? 
        # For simplicity, just give it back if no host currently
        if room['host_sid'] is None:
            room['host_sid'] = sid
        inactive_players[room_id].pop(name, None)
        reconnecting = True
    else:
        if len(room['players']) >= room.get('grid_size', 5):
            emit('room_full', {'message': f"Room is full! Maximum {room.get('grid_size', 5)} players allowed."}, to=sid)
            return

        room['players'][sid] = {
            'name': name,
            'board_ready': False,
            'bingo_lines': 0
        }
        if name not in room['leaderboard']:
            room['leaderboard'][name] = 0

    # Analytics: Player Join
    platform_stats["total_players_joined"] += 1
    platform_stats["current_players_online"] += 1
    if platform_stats["current_players_online"] > platform_stats["peak_players"]:
        platform_stats["peak_players"] = platform_stats["current_players_online"]
    emit_admin_update()
        
    emit_player_list(room_id)
    emit_leaderboard(room_id)
    
    # Send current state specifically to the joining sid
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
                    '8': (8, 64)
                }
                grid_size_str = str(data.get('size'))
                if grid_size_str in size_map:
                    grid_size, max_number = size_map[grid_size_str]
                    
                    if len(room['players']) > grid_size:
                        socketio.emit('error', {'message': f'Cannot select {grid_size}x{grid_size} mode. Room currently has {len(room["players"])} players.'}, to=sid)
                        return

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
    if r_id is not None and r_id in rooms:
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
                    global_leaderboard[winner_name] = global_leaderboard.get_wins(winner_name) + 1
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

@socketio.on('change_name')
def on_change_name(data):
    sid = request.sid
    new_name = data.get('new_name', '').strip()
    room_id = sid_to_room.get(sid)
    
    if not new_name or not room_id or room_id not in rooms:
        return
        
    if len(new_name) > 15:
        new_name = new_name[:15]
        
    room = rooms[cast(str, room_id)]
    if sid not in room['players']:
        return
        
    old_name = room['players'][sid]['name']
    if old_name == new_name:
        return
        
    # Update player name
    room['players'][sid]['name'] = new_name
    
    # Migrate leaderboard stats
    if old_name in room['leaderboard']:
        stats = room['leaderboard'].pop(old_name)
        # Check if anyone else is still using the old name
        others_with_old_name = any(p['name'] == old_name for p_sid, p in room['players'].items() if p_sid != sid)
        if others_with_old_name:
            # Put stats back for others
            room['leaderboard'][old_name] = stats
        
        # Add stats to new name (or merge if new name exists)
        room['leaderboard'][new_name] = room['leaderboard'].get(new_name, 0) + (stats if not others_with_old_name else 0)
        # Note: if others_with_old_name is true, we didn't "move" the stats, just copied or shared.
        # This logic is a bit tricky since stats are shared by name.
        # Simpler approach: if stats were for this name, and name changes, 
        # just ensure new name has an entry. 
    
    if new_name not in room['leaderboard']:
        room['leaderboard'][new_name] = 0

    emit_player_list(room_id)
    emit_leaderboard(room_id)
    emit('name_changed', {'new_name': new_name}, to=sid)

@socketio.on('initiate_kick_vote')
def on_initiate_kick_vote(data):
    sid = request.sid
    target_name = data.get('target_name')
    target_sid = data.get('target_sid')
    room_id = sid_to_room.get(sid)
    
    if not room_id or room_id not in rooms:
        return
        
    room = rooms[room_id]
    if sid != room['host_sid']:
        return # Only host can initiate
        
    if room.get('active_vote'):
        return # Already a vote in progress

    # Find total voters (everyone except the target)
    voters = []
    if target_sid:
        voters = [p_sid for p_sid in room['players'] if p_sid != target_sid]
    else:
        voters = [p_sid for p_sid in room['players']]
    if not voters:
        # If no one else is online, host can just kick directly if it's an offline player?
        # But we'll follow the rule of "all others vote". 
        # For now, let's allow it if there's at least 1 other voter.
        pass

    room['active_vote'] = {
        'target_name': target_name,
        'target_sid': target_sid,
        'votes': {sid: 'yes'}, # Host automatically votes yes
        'start_time': time.time()
    }
    
    socketio.emit('kick_vote_started', {
        'target_name': target_name,
        'initiator_name': room['players'].get(sid, {}).get('name', 'Host')
    }, to=room_id)
    
    # Auto-end vote after 5 seconds
    def vote_timeout(r_id):
        socketio.sleep(5)
        if r_id in rooms and rooms[r_id].get('active_vote'):
            process_vote(r_id, timeout=True)
            
    socketio.start_background_task(vote_timeout, room_id)

@socketio.on('submit_kick_vote')
def on_submit_kick_vote(data):
    sid = request.sid
    vote = data.get('vote') # 'yes' or 'no'
    room_id = sid_to_room.get(sid)
    
    if not room_id or room_id not in rooms:
        return
        
    room = rooms[room_id]
    if not room.get('active_vote'):
        return
        
    active_vote = room['active_vote']
    if sid == active_vote['target_sid']:
        return # Target can't vote
        
    active_vote['votes'][sid] = vote
    process_vote(room_id)

def process_vote(room_id, timeout=False):
    if room_id not in rooms:
        return
    room = rooms[room_id]
    vote_data = room.get('active_vote')
    if not vote_data:
        return
        
    total_active_players = len(room['players'])
    # Other players = total - (1 if target is online else 0)
    target_online = vote_data['target_sid'] in room['players']
    voter_pool_size = total_active_players - (1 if target_online else 0)
    
    yes_votes = list(vote_data['votes'].values()).count('yes')
    no_votes = list(vote_data['votes'].values()).count('no')
    
    # Needs > 50% of the voter pool to say yes
    # Or if everyone has voted, or if timeout
    passed = False
    if voter_pool_size > 0:
        if yes_votes > voter_pool_size / 2:
            passed = True
        elif no_votes >= voter_pool_size / 2:
            passed = False
            # Vote failed early
            end_vote(room_id, False)
            return

    # End early only if everyone has voted
    if yes_votes + no_votes >= voter_pool_size:
        end_vote(room_id, yes_votes > voter_pool_size / 2)
    elif timeout:
        # On timeout, tally what we have
        end_vote(room_id, yes_votes > voter_pool_size / 2)

def end_vote(room_id, passed):
    if room_id not in rooms:
        return
    room = rooms[room_id]
    vote_data = room.pop('active_vote', None)
    if not vote_data:
        return
        
    target_name = vote_data['target_name']
    target_sid = vote_data['target_sid']
    
    socketio.emit('kick_vote_ended', {
        'target_name': target_name,
        'passed': passed
    }, to=room_id)
    
    if passed:
        kick_player(room_id, target_sid, target_name)

def kick_player(room_id, sid, name):
    if room_id not in rooms:
        return
    room = rooms[room_id]
    
    print(f"Kicking player {name} (sid: {sid}) from room {room_id}")
    
    # If online
    if sid and sid in room['players']:
        socketio.emit('kicked', {'reason': 'You have been voted out.'}, to=sid)
        # The disconnect handler will take care of a lot, but we want to ensure they are GONE
        # and not moved to inactive.
        room['players'].pop(sid, None)
        platform_stats["current_players_online"] = max(0, platform_stats["current_players_online"] - 1)
        emit_admin_update()
        
        # If they were host, transfer (host usually won't be kicked but just in case of future changes)
        if sid == room['host_sid']:
            room['host_sid'] = list(room['players'].keys())[0] if room['players'] else None
            
        # Ensure they don't stay in sid_to_room or inactive_players
        sid_to_room.pop(sid, None)
        # Use name to prevent them from "reconnecting"
        if room_id in inactive_players:
            inactive_players[room_id].pop(name, None)
            
    # If offline
    if room_id in inactive_players and name in inactive_players[room_id]:
        inactive_players[room_id].pop(name, None)
        
    emit_player_list(room_id)
    
    # If it was their turn, skip it
    if room['game_started'] and room['turn_order']:
        if sid in room['turn_order']:
            # Actually we need to rebuild turn order or handle the index
            # Simplest: rebuild turn order from current active players
            active_sids = list(room['players'].keys())
            new_turn_order = [s for s in room['turn_order'] if s in active_sids]
            
            if not new_turn_order:
                # No one left?
                return
                
            # Adjust index if necessary
            current_sid = None
            if room['current_turn_index'] < len(room['turn_order']):
                current_sid = room['turn_order'][room['current_turn_index']]
            
            room['turn_order'] = new_turn_order
            
            if current_sid == sid:
                # It WAS their turn, now it's the next person's turn at the same index
                room['current_turn_index'] = room['current_turn_index'] % len(room['turn_order'])
                next_sid = room['turn_order'][room['current_turn_index']]
                next_name = room['players'].get(next_sid, {}).get('name', 'Player')
                socketio.emit('turn_changed', {'turn_sid': next_sid, 'turn_name': next_name}, to=room_id)
                start_turn_timer(room_id)
            else:
                # Find new index of current_sid
                if current_sid in new_turn_order:
                    room['current_turn_index'] = new_turn_order.index(current_sid)
                else:
                    room['current_turn_index'] = 0

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

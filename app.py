from flask import Flask, render_template, request
from flask_socketio import SocketIO, join_room
import random
import os
import json
import time

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, async_mode='threading')

# -------- DATA --------
players = {}
waiting_players = []
games = {}
admin_sid = None

SAVE_FILE = "games_history.json"

# Load history
if os.path.exists(SAVE_FILE):
    with open(SAVE_FILE, "r") as f:
        finished_games = json.load(f)
else:
    finished_games = {}


# -------- ROUTES --------
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/player')
def player():
    return render_template('player.html')

@app.route('/admin')
def admin():
    return render_template('admin.html')


# -------- HELPERS --------
def get_waiting_list():
    return [players[sid] for sid in waiting_players]


def payoff(c1, c2):
    if c1 == "cooperate" and c2 == "cooperate":
        return (3, 3)
    if c1 == "cooperate" and c2 == "defect":
        return (0, 5)
    if c1 == "defect" and c2 == "cooperate":
        return (5, 0)
    return (1, 1)


def save_history():
    with open(SAVE_FILE, "w") as f:
        json.dump(finished_games, f)


def send_games_update():
    if not admin_sid:
        return

    dashboard = {}

    # ACTIVE GAMES
    for room_id, game in games.items():
        p1, p2 = game["players"]

        name1 = "BOT" if p1 == "BOT" else players.get(p1, "Unknown")
        name2 = "BOT" if p2 == "BOT" else players.get(p2, "Unknown")

        dashboard[room_id] = {
            "players": [name1, name2],
            "round": game["round"],
            "total_rounds": game["total_rounds"],
            "status": "playing"
        }

    # FINISHED GAMES
    for game_id, game in finished_games.items():
        dashboard[game_id] = game

    socketio.emit("games_data", dashboard, room=admin_sid)


# -------- SOCKET EVENTS --------
@socketio.on('join_player')
def handle_join_player(data):
    name = data.get('name')
    players[request.sid] = name

    if request.sid not in waiting_players:
        waiting_players.append(request.sid)

    socketio.emit('waiting_room_update', get_waiting_list())


@socketio.on('join_admin')
def handle_admin(data):
    global admin_sid

    if data.get('password') == "12345":
        admin_sid = request.sid
        socketio.emit('admin_ok', room=request.sid)
        socketio.emit('waiting_room_update', get_waiting_list(), room=request.sid)
        send_games_update()
    else:
        socketio.emit('admin_error', room=request.sid)


@socketio.on('get_games')
def get_games():
    send_games_update()


@socketio.on('start_game')
def handle_start_game(data):
    global admin_sid

    if request.sid != admin_sid:
        socketio.emit("not_admin", room=request.sid)
        return

    if len(games) > 0:
        socketio.emit("game_in_progress", room=request.sid)
        return

    if len(waiting_players) == 0:
        socketio.emit("no_players", room=request.sid)
        return

    total_rounds = data.get("rounds", 5)

    shuffled = waiting_players[:]
    random.shuffle(shuffled)

    pairs = []

    while len(shuffled) > 1:
        p1 = shuffled.pop()
        p2 = shuffled.pop()
        pairs.append((p1, p2))

    if len(shuffled) == 1:
        pairs.append((shuffled.pop(), "BOT"))

    for i, (p1, p2) in enumerate(pairs):
        room_id = f"room_{i}"

        join_room(room_id, sid=p1)
        if p2 != "BOT":
            join_room(room_id, sid=p2)

        games[room_id] = {
            "players": [p1, p2],
            "round": 1,
            "choices": {},
            "history": [],
            "total_rounds": total_rounds,
            "resolving": False
        }

        socketio.emit("game_start", {
            "room": room_id,
            "role": "p1",
            "opponent": "BOT" if p2 == "BOT" else players[p2]
        }, room=p1)

        if p2 != "BOT":
            socketio.emit("game_start", {
                "room": room_id,
                "role": "p2",
                "opponent": players[p1]
            }, room=p2)

    waiting_players.clear()
    socketio.emit('waiting_room_update', [])
    send_games_update()


@socketio.on('make_move')
def handle_move(data):
    room = data['room']
    choice = data['choice']

    game = games.get(room)
    if not game:
        return

    game["choices"][request.sid] = choice

    # FIXED BOT LOGIC
    if "BOT" in game["players"] and "BOT" not in game["choices"]:
        game["choices"]["BOT"] = random.choice(["cooperate", "defect"])

    if len(game["choices"]) == len(game["players"]):
        if game["resolving"]:
            return

        game["resolving"] = True
        resolve_round(room)
        game["resolving"] = False


def resolve_round(room):
    game = games[room]
    p1, p2 = game["players"]

    c1 = game["choices"].get(p1)
    c2 = game["choices"].get(p2)

    if p2 == "BOT":
        c2 = game["choices"]["BOT"]

    score1, score2 = payoff(c1, c2)

    result = {
        "round": game["round"],
        "p1_choice": c1,
        "p2_choice": c2,
        "p1_score": score1,
        "p2_score": score2
    }

    game["history"].append(result)

    socketio.emit("round_result", result, room=room)

    game["choices"] = {}

    if game["round"] >= game["total_rounds"]:
        socketio.emit("game_over", game["history"], room=room)

        name1 = "BOT" if p1 == "BOT" else players.get(p1, "Unknown")
        name2 = "BOT" if p2 == "BOT" else players.get(p2, "Unknown")

        total1 = sum(r["p1_score"] for r in game["history"])
        total2 = sum(r["p2_score"] for r in game["history"])

        game_id = f"{room}_{int(time.time())}"

        finished_games[game_id] = {
            "players": [name1, name2],
            "history": game["history"],
            "total_scores": [total1, total2],
            "status": "finished"
        }

        save_history()

        del games[room]
        send_games_update()
        return

    game["round"] += 1
    socketio.emit("next_round", {"round": game["round"]}, room=room)
    send_games_update()


@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid

    if sid in waiting_players:
        waiting_players.remove(sid)

    players.pop(sid, None)

    for room_id, game in list(games.items()):
        if sid in game["players"]:
            remaining = [p for p in game["players"] if p != sid]

            if all(p == "BOT" or p not in players for p in remaining):
                del games[room_id]
            else:
                game["players"] = [
                    "BOT" if p == sid else p for p in game["players"]
                ]

                socketio.emit("opponent_left", {
                    "message": "Opponent disconnected. You are now playing against BOT."
                }, room=room_id)

    socketio.emit('waiting_room_update', get_waiting_list())
    send_games_update()


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, host="0.0.0.0", port=port, allow_unsafe_werkzeug=True)

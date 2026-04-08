const socket = io();


// -------- PLAYER JOIN --------
function join() {
    const nameInput = document.getElementById("name");
    const joinBtn = document.getElementById("joinBtn");

    if (!nameInput) return;

    const name = nameInput.value.trim();
    if (!name) {
        alert("Enter a name");
        return;
    }

    socket.emit("join_player", { name });

    nameInput.disabled = true;
    joinBtn.disabled = true;
    joinBtn.innerText = "Joined";
}


// -------- ADMIN --------
function login() {
    const password = document.getElementById("password").value;
    socket.emit("join_admin", { password });
}

function startGame() {
    const rounds = document.getElementById("rounds").value;
    socket.emit("start_game", { rounds: parseInt(rounds) });
}


// -------- WAITING ROOM --------
socket.on("waiting_room_update", (players) => {
    const list = document.getElementById("players");
    if (!list) return;

    list.innerHTML = "";

    players.forEach(p => {
        const li = document.createElement("li");
        li.innerText = p;
        list.appendChild(li);
    });
});


// -------- ADMIN STATUS --------
socket.on("admin_ok", () => {
    const status = document.getElementById("status");
    if (status) status.innerText = "Login successful";

    const btn = document.getElementById("startBtn");
    if (btn) btn.disabled = false;

    socket.emit("get_games");
});

socket.on("admin_error", () => {
    const status = document.getElementById("status");
    if (status) status.innerText = "Wrong password";
});


// -------- ADMIN DASHBOARD --------
socket.on("games_data", (games) => {
    const container = document.getElementById("liveGames");
    if (!container) return;

    container.innerHTML = "";

    Object.entries(games).forEach(([room, game]) => {

        const div = document.createElement("div");
        div.className = "card";

        const [p1, p2] = game.players;

        if (game.status === "playing") {
            div.innerHTML = `
                <h3>${p1} vs ${p2}</h3>
                <p><b>Currently Playing</b></p>
                <p>Round ${game.round} / ${game.total_rounds}</p>
            `;
        }

        else {
            const rounds = game.history.map(r => r.round);

            const p1Row = game.history.map(r => `<td>${r.p1_score}</td>`).join("");
            const p2Row = game.history.map(r => `<td>${r.p2_score}</td>`).join("");

            const total1 = game.total_scores[0];
            const total2 = game.total_scores[1];

            div.innerHTML = `
                <h3>${p1} vs ${p2}</h3>
                <p><b>Game Finished</b></p>

                <table>
                    <thead>
                        <tr>
                            <th></th>
                            ${rounds.map(r => `<th>R${r}</th>`).join("")}
                            <th>Total</th>
                        </tr>
                    </thead>

                    <tbody>
                        <tr>
                            <th>${p1}</th>
                            ${p1Row}
                            <td><b>${total1}</b></td>
                        </tr>

                        <tr>
                            <th>${p2}</th>
                            ${p2Row}
                            <td><b>${total2}</b></td>
                        </tr>
                    </tbody>
                </table>
            `;
        }

        container.appendChild(div);
    });
});


// -------- GAME START --------
socket.on("game_start", (data) => {
    window.currentRoom = data.room;
    window.role = data.role;

    window.youTotal = 0;
    window.oppTotal = 0;

    document.body.innerHTML = `
    <div class="container">

        <h2>Repeated Prisoner's Dilemma</h2>

        <h3 id="opponentName">Your opponent is: ${data.opponent}</h3>

        <div class="game-layout">

            <div class="card">
                <h3 id="round">Round 1</h3>

                <button id="coopBtn" onclick="makeMove('cooperate')">Cooperate</button>
                <button id="defBtn" onclick="makeMove('defect')">Defect</button>

                <p id="status">Choose your action</p>

                <h4>Payoff Matrix</h4>
                <table>
                    <tr>
                        <th></th>
                        <th>Opponent C</th>
                        <th>Opponent D</th>
                    </tr>
                    <tr>
                        <th>You C</th>
                        <td>2,2</td>
                        <td>0,5</td>
                    </tr>
                    <tr>
                        <th>You D</th>
                        <td>5,0</td>
                        <td>1,1</td>
                    </tr>
                </table>
            </div>

            <div class="card">
                <h3>History</h3>

                <table>
                    <thead>
                        <tr>
                            <th>Round</th>
                            <th>You</th>
                            <th>Opponent</th>
                        </tr>
                    </thead>

                    <tbody id="history"></tbody>

                    <tfoot>
                        <tr>
                            <td><b>TOTAL</b></td>
                            <td id="youTotal"><b>0</b></td>
                            <td id="oppTotal"><b>0</b></td>
                        </tr>
                    </tfoot>
                </table>
            </div>

        </div>
    </div>
    `;
});


// -------- MOVE --------
function makeMove(choice) {
    socket.emit("make_move", {
        room: window.currentRoom,
        choice: choice
    });

    const coopBtn = document.getElementById("coopBtn");
    const defBtn = document.getElementById("defBtn");

    if (!coopBtn || !defBtn) return;

    coopBtn.disabled = true;
    defBtn.disabled = true;

    coopBtn.classList.remove("selected-coop");
    defBtn.classList.remove("selected-def");

    if (choice === "cooperate") {
        coopBtn.classList.add("selected-coop");
    } else {
        defBtn.classList.add("selected-def");
    }

    document.getElementById("status").innerText = "Waiting for opponent...";
}


// -------- ROUND RESULT --------
socket.on("round_result", (data) => {
    let youScore, oppScore;

    if (window.role === "p1") {
        youScore = data.p1_score;
        oppScore = data.p2_score;
    } else {
        youScore = data.p2_score;
        oppScore = data.p1_score;
    }

    window.youTotal += youScore;
    window.oppTotal += oppScore;

    document.getElementById("youTotal").innerText = window.youTotal;
    document.getElementById("oppTotal").innerText = window.oppTotal;

    document.getElementById("status").innerText = "Round complete";

    const row = document.createElement("tr");

    row.innerHTML = `
        <td>${data.round}</td>
        <td>${youScore}</td>
        <td>${oppScore}</td>
    `;

    document.getElementById("history").appendChild(row);
});


// -------- NEXT ROUND --------
socket.on("next_round", (data) => {
    document.getElementById("round").innerText = `Round ${data.round}`;
    document.getElementById("status").innerText = "Choose your action";

    const coopBtn = document.getElementById("coopBtn");
    const defBtn = document.getElementById("defBtn");

    coopBtn.disabled = false;
    defBtn.disabled = false;

    coopBtn.classList.remove("selected-coop");
    defBtn.classList.remove("selected-def");
});


// -------- GAME OVER --------
socket.on("game_over", () => {
    document.getElementById("status").innerText = "Game Over 🎉";

    document.getElementById("coopBtn").disabled = true;
    document.getElementById("defBtn").disabled = true;
});


// -------- DISCONNECT --------
socket.on("opponent_left", (data) => {
    alert(data.message);

    const opponentText = document.getElementById("opponentName");
    if (opponentText) {
        opponentText.innerText = "Your opponent is: BOT";
    }

    document.getElementById("status").innerText = "Playing against BOT";
});


// -------- WARNINGS --------
socket.on("game_in_progress", () => {
    alert("A game is already in progress!");
});

socket.on("no_players", () => {
    alert("No players in waiting room!");
});


// -------- DASHBOARD POLLING --------
setInterval(() => {
    socket.emit("get_games");
}, 2000);
document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('start-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const resumeBtn = document.getElementById('resume-btn');
    const endBtn = document.getElementById('end-btn');
    const scoreEl = document.getElementById('score');
    const distanceEl = document.getElementById('distance');
    const gameContainer = document.getElementById('game-container');
    const gridContainer = document.getElementById('grid-container');
    const canvas = document.getElementById('line-canvas');
    const ctx = canvas.getContext('2d');

    let state = {
        grid: [],
        score: 0,
        linePath: [],
        timer: null,
        isPaused: false,
        isGameRunning: false,
        rows: 10,
        cols: 20,
        cellSize: 0,
        gridWidth: 0,
        gridHeight: 0,
        totalDistance: 0,
        scrollOffset: 0,
        socketTask: null
    };

    function initializeGame() {
        resizeCanvas();
        state.cellSize = gameContainer.clientHeight / state.rows;
        state.cols = Math.floor(gameContainer.clientWidth / state.cellSize);
        state.gridWidth = state.cols * state.cellSize;
        state.gridHeight = state.rows * state.cellSize;
        gridContainer.style.gridTemplateColumns = `repeat(${state.cols}, ${state.cellSize}px)`;
        gridContainer.style.gridTemplateRows = `repeat(${state.rows}, ${state.cellSize}px)`;

        state.score = 0;
        state.linePath = [];
        state.totalDistance = 0;
        state.scrollOffset = 0;
        state.isPaused = false;
        state.isGameRunning = true;

        updateUI();
        initGrid();
        
        const initialY = Math.floor(state.rows / 2);
        updateLine(initialY);
        connectWebSocket();

        startBtn.disabled = true;
        pauseBtn.disabled = false;
        resumeBtn.disabled = true;
        endBtn.disabled = false;
    }

    function resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = gameContainer.clientWidth * dpr;
        canvas.height = gameContainer.clientHeight * dpr;
        ctx.scale(dpr, dpr);
        canvas.style.width = `${gameContainer.clientWidth}px`;
        canvas.style.height = `${gameContainer.clientHeight}px`;
    }

    function initGrid() {
        gridContainer.innerHTML = '';
        state.grid = [];
        for (let i = 0; i < state.rows; i++) {
            const row = [];
            for (let j = 0; j < state.cols; j++) {
                const cell = document.createElement('div');
                cell.classList.add('grid-cell');
                cell.dataset.row = i;
                cell.dataset.col = j;
                cell.addEventListener('click', handleSquareClick);
                gridContainer.appendChild(cell);
                row.push({ clicked: false, element: cell });
            }
            state.grid.push(row);
        }
    }

    function handleSquareClick(e) {
        if (!state.isGameRunning || state.isPaused) return;
        const row = parseInt(e.target.dataset.row);
        const col = parseInt(e.target.dataset.col);

        const lastPoint = state.linePath.length > 0 ? state.linePath[state.linePath.length - 1] : { x: -1 };
        const absoluteCol = col + state.scrollOffset;

        if (absoluteCol >= lastPoint.x) {
            state.grid[row][col].clicked = !state.grid[row][col].clicked;
            e.target.classList.toggle('clicked');
        }
    }

    function connectWebSocket() {
        if (state.socketTask) {
            state.socketTask.close();
        }
        state.socketTask = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@kline_1s');

        state.socketTask.onopen = () => {
            console.log('WebSocket Connection Opened');
            state.socketTask.send(JSON.stringify({
                method: "SUBSCRIBE",
                params: ["btcusdt@kline_1s"],
                id: 1
            }));
        };

        state.socketTask.onmessage = (event) => {
            if (state.isPaused || !state.isGameRunning) return;
            try {
                const data = JSON.parse(event.data);
                if (data && data.k) {
                    const price = parseFloat(data.k.c);
                    const targetRow = Math.floor(price * 100) % 10;
                    updateLine(targetRow);
                }
            } catch (error) {
                console.error('Error processing WebSocket message:', error);
            }
        };

        state.socketTask.onerror = (error) => {
            console.error('WebSocket Error:', error);
        };

        state.socketTask.onclose = () => {
            console.log('WebSocket Connection Closed');
        };
    }

    function updateLine(targetRow) {
        const lastPoint = state.linePath.length > 0 ? state.linePath[state.linePath.length - 1] : { x: -1, y: Math.floor(state.rows / 2) };
        const newX = lastPoint.x + 1;
        state.linePath.push({ x: newX, y: targetRow });
        state.totalDistance++;

        const visualCol = newX - state.scrollOffset;
        if (visualCol >= 0 && visualCol < state.cols && state.grid[targetRow][visualCol].clicked) {
            state.score++;
        }

        if (newX >= state.scrollOffset + state.cols - 5) {
            state.scrollOffset += 5;
            scrollGrid();
        }

        drawLine();
        updateUI();
    }

    function scrollGrid() {
        const newGrid = [];
        for (let i = 0; i < state.rows; i++) {
            const newRow = state.grid[i].slice(5);
            for (let j = 0; j < 5; j++) {
                const cell = document.createElement('div');
                cell.classList.add('grid-cell');
                cell.dataset.row = i;
                cell.dataset.col = state.cols - 5 + j;
                cell.addEventListener('click', handleSquareClick);
                gridContainer.appendChild(cell);
                newRow.push({ clicked: false, element: cell });
            }
            newGrid.push(newRow);
        }
        
        for(let i = 0; i < state.rows * 5; i++) {
            gridContainer.removeChild(gridContainer.firstChild);
        }

        state.grid = newGrid;

        // Re-assign dataset columns
        for (let r = 0; r < state.rows; r++) {
            for (let c = 0; c < state.cols; c++) {
                state.grid[r][c].element.dataset.col = c;
            }
        }
    }

    function drawLine() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (state.linePath.length === 0) return;

        ctx.beginPath();
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 3;
        ctx.shadowColor = 'rgba(255, 0, 0, 0.5)';
        ctx.shadowBlur = 5;

        let firstVisiblePoint = true;
        state.linePath.forEach(point => {
            const x = (point.x - state.scrollOffset + 0.5) * state.cellSize;
            const y = (point.y + 0.5) * state.cellSize;

            if (x >= -state.cellSize && x <= gameContainer.clientWidth + state.cellSize) {
                if (firstVisiblePoint) {
                    ctx.moveTo(x, y);
                    firstVisiblePoint = false;
                } else {
                    ctx.lineTo(x, y);
                }
            }
        });
        ctx.stroke();

        const lastPoint = state.linePath[state.linePath.length - 1];
        const lastX = (lastPoint.x - state.scrollOffset + 0.5) * state.cellSize;
        const lastY = (lastPoint.y + 0.5) * state.cellSize;

        ctx.beginPath();
        ctx.fillStyle = 'red';
        ctx.arc(lastX, lastY, state.cellSize * 0.3, 0, Math.PI * 2);
        ctx.fill();
    }

    function updateUI() {
        scoreEl.textContent = state.score;
        distanceEl.textContent = state.totalDistance;
    }

    function pauseGame() {
        state.isPaused = true;
        pauseBtn.disabled = true;
        resumeBtn.disabled = false;
    }

    function resumeGame() {
        state.isPaused = false;
        pauseBtn.disabled = false;
        resumeBtn.disabled = true;
    }

    function endGame() {
        state.isGameRunning = false;
        if (state.socketTask) {
            state.socketTask.close();
        }
        if (state.timer) {
            clearInterval(state.timer);
        }
        alert(`Game Over!\nYour score: ${state.score}\nTotal distance: ${state.totalDistance}`);
        
        startBtn.disabled = false;
        pauseBtn.disabled = true;
        resumeBtn.disabled = true;
        endBtn.disabled = true;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        gridContainer.innerHTML = '';
    }

    startBtn.addEventListener('click', initializeGame);
    pauseBtn.addEventListener('click', pauseGame);
    resumeBtn.addEventListener('click', resumeGame);
    endBtn.addEventListener('click', endGame);
    window.addEventListener('resize', () => {
        if (state.isGameRunning) {
            resizeCanvas();
            drawLine();
        }
    });
});
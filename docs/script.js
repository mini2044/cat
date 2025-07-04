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
        isPaused: false,
        isGameRunning: false,
        rows: 10,
        cols: 20,
        cellSize: 0,
        totalDistance: 0,
        scrollOffset: 0,
        socketTask: null
    };

    function initializeGame() {
        resizeCanvasAndGrid();

        state.score = 0;
        state.linePath = [];
        state.totalDistance = 0;
        state.scrollOffset = 0;
        state.isPaused = false;
        state.isGameRunning = true;

        updateUI();
        initGrid();
        
        const initialY = Math.floor(state.rows / 2);
        state.linePath.push({ x: 0, y: initialY });
        
        connectWebSocket();

        gridContainer.removeEventListener('click', handleSquareClick);
        gridContainer.addEventListener('click', handleSquareClick);

        startBtn.disabled = true;
        pauseBtn.disabled = false;
        resumeBtn.disabled = true;
        endBtn.disabled = false;
    }

    function resizeCanvasAndGrid() {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = gameContainer.clientWidth * dpr;
        canvas.height = gameContainer.clientHeight * dpr;
        ctx.scale(dpr, dpr);
        canvas.style.width = `${gameContainer.clientWidth}px`;
        canvas.style.height = `${gameContainer.clientHeight}px`;

        state.cellSize = gameContainer.clientHeight / state.rows;
        state.cols = Math.floor(gameContainer.clientWidth / state.cellSize);
        gridContainer.style.gridTemplateColumns = `repeat(${state.cols}, ${state.cellSize}px)`;
        gridContainer.style.gridTemplateRows = `repeat(${state.rows}, ${state.cellSize}px)`;
    }

    function initGrid() {
        gridContainer.innerHTML = '';
        state.grid = [];
        for (let i = 0; i < state.rows; i++) {
            const row = [];
            for (let j = 0; j < state.cols + 10; j++) { // Create some buffer columns
                row.push({ clicked: false });
            }
            state.grid.push(row);
        }
        renderGrid();
    }

    function renderGrid() {
        gridContainer.innerHTML = '';
        for (let r = 0; r < state.rows; r++) {
            for (let c = 0; c < state.cols; c++) {
                const absoluteCol = c + state.scrollOffset;
                const cell = document.createElement('div');
                cell.classList.add('grid-cell');
                cell.dataset.row = r;
                cell.dataset.col = absoluteCol;
                if (state.grid[r][absoluteCol] && state.grid[r][absoluteCol].clicked) {
                    cell.classList.add('clicked');
                }
                gridContainer.appendChild(cell);
            }
        }
    }

    function handleSquareClick(e) {
        if (!state.isGameRunning || state.isPaused || !e.target.classList.contains('grid-cell')) return;

        const row = parseInt(e.target.dataset.row);
        const col = parseInt(e.target.dataset.col);

        // 获取当前红线的最新位置
        const lastPoint = state.linePath[state.linePath.length - 1];
        if (col <= lastPoint.x) {
            console.log(`Column ${col} is behind the line, click disabled.`);
            return; // 如果点击的列在红线后面或当前列，则不允许点击
        }

        console.log(`Square clicked at [${row}, ${col}]`);

        if (state.grid[row] && state.grid[row][col]) {
            state.grid[row][col].clicked = !state.grid[row][col].clicked;
            e.target.classList.toggle('clicked');
            console.log(`Square at [${row}, ${col}] is now ${state.grid[row][col].clicked ? 'clicked' : 'unclicked'}`);
        }
    }

    function connectWebSocket() {
        if (state.socketTask) state.socketTask.close();
        state.socketTask = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@kline_1s');

        state.socketTask.onopen = () => console.log('WebSocket Connection Opened');
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
        state.socketTask.onerror = (error) => console.error('WebSocket Error:', error);
        state.socketTask.onclose = () => console.log('WebSocket Connection Closed');
    }

    function updateLine(targetRow) {
        const lastPoint = state.linePath[state.linePath.length - 1];
        const newX = lastPoint.x + 1;
        state.linePath.push({ x: newX, y: targetRow });
        state.totalDistance++;

        if (state.grid[targetRow] && state.grid[targetRow][newX] && state.grid[targetRow][newX].clicked) {
            state.score++;
            console.log(`Collision detected at [${targetRow}, ${newX}]! Score: ${state.score}`);
        }

        // Scroll logic
        if (newX > state.scrollOffset + state.cols - 5) {
            state.scrollOffset++;
            // Add new columns to the data grid if needed
            if (state.scrollOffset + state.cols > state.grid[0].length) {
                for (let i = 0; i < state.rows; i++) {
                    state.grid[i].push({ clicked: false });
                }
            }
            renderGrid();
        }

        drawLine();
        updateUI();
    }

    function drawLine() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (state.linePath.length < 2) return;

        ctx.beginPath();
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 3;
        ctx.shadowColor = 'rgba(255, 0, 0, 0.5)';
        ctx.shadowBlur = 5;

        state.linePath.forEach((point, index) => {
            const x = (point.x - state.scrollOffset + 0.5) * state.cellSize;
            const y = (point.y + 0.5) * state.cellSize;
            if (x >= -state.cellSize && x <= gameContainer.clientWidth + state.cellSize) {
                if (index === 0 || state.linePath[index-1].x < state.scrollOffset) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
        });
        ctx.stroke();

        const lastPoint = state.linePath[state.linePath.length - 1];
        const lastX = (lastPoint.x - state.scrollOffset + 0.5) * state.cellSize;
        const lastY = (lastPoint.y + 0.5) * state.cellSize;
        ctx.fillStyle = 'red';
        ctx.beginPath();
        ctx.arc(lastX, lastY, 5, 0, 2 * Math.PI);
        ctx.fill();
    }

    function updateUI() {
        scoreEl.textContent = `Score: ${state.score}`;
        distanceEl.textContent = `Distance: ${state.totalDistance}`;
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
        if (state.socketTask) state.socketTask.close();
        startBtn.disabled = false;
        pauseBtn.disabled = true;
        resumeBtn.disabled = true;
        endBtn.disabled = true;
    }

    startBtn.addEventListener('click', initializeGame);
    pauseBtn.addEventListener('click', pauseGame);
    resumeBtn.addEventListener('click', resumeGame);
    endBtn.addEventListener('click', endGame);
    window.addEventListener('resize', () => {
        if (state.isGameRunning) {
            resizeCanvasAndGrid();
            renderGrid();
            drawLine();
        }
    });
});
document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('start-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const resumeBtn = document.getElementById('resume-btn');
    const endBtn = document.getElementById('end-btn');
    const soundToggleBtn = document.getElementById('sound-toggle-btn');
    const scoreEl = document.getElementById('score');
    const distanceEl = document.getElementById('distance');
    const clearedPercentageEl = document.getElementById('cleared-percentage'); // 新增
    const gameContainer = document.getElementById('game-container');
    const gridContainer = document.getElementById('grid-container');
    const canvas = document.getElementById('line-canvas');
    const ctx = canvas.getContext('2d');
    const bingoSound = document.getElementById('bingo-sound');

    let confettiInstance = confetti.create(null, { resize: true, useWorker: true });

    let state = {
        grid: [],
        score: 0,
        linePath: [],
        isPaused: false,
        isGameRunning: false,
        isSoundOn: false,
        rows: 10,
        cols: 20,
        cellSize: 0,
        totalDistance: 0,
        scrollOffset: 0,
        socketTask: null,
        revealedPositions: new Set() // 改用 Set 来存储已揭示的屏幕位置
    };

    function initializeGame() {
        resizeCanvasAndGrid();

        state.score = 100; // 初始分数为100
        state.linePath = [];
        state.totalDistance = 0;
        state.scrollOffset = 0;
        state.isPaused = false;
        state.isGameRunning = true;
        state.revealedPositions.clear(); // 重置已揭示位置集合

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

    function toggleSound() {
        state.isSoundOn = !state.isSoundOn;
        soundToggleBtn.textContent = `音效：${state.isSoundOn ? '开' : '关'}`;
        if (state.isSoundOn) {
            bingoSound.play().catch(e => console.error("Audio unlock failed"));
            bingoSound.pause();
            bingoSound.currentTime = 0;
        }
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

        const lastPoint = state.linePath[state.linePath.length - 1];
        if (col <= lastPoint.x) {
            console.log(`Column ${col} is behind the line, click disabled.`);
            return;
        }

        if (state.grid[row] && state.grid[row][col]) {
            // 切换格子的点击状态和样式
            state.grid[row][col].clicked = !state.grid[row][col].clicked;
            e.target.classList.toggle('clicked');

            // 根据点击行为更新分数
            if (state.grid[row][col].clicked) {
                state.score -= 1; // 点击选中，扣1分
            } else {
                state.score += 1; // 取消选中，返还1分
            }

            const screenCol = col - state.scrollOffset;
            const positionKey = `${row}-${screenCol}`;

            // 只有当这个位置是第一次被揭示时，才增加探索度
            if (!state.revealedPositions.has(positionKey)) {
                state.revealedPositions.add(positionKey);
            }
            updateUI(); // 每次点击都更新UI以显示分数变化
        }
    }

    function updateUI() {
        scoreEl.textContent = state.score.toFixed(1); // 保留一位小数以显示9.9分
        distanceEl.textContent = state.totalDistance;
        const totalPositions = state.rows * state.cols; // 屏幕上可见的总格子数
        const percentage = totalPositions > 0 ? (state.revealedPositions.size / totalPositions) * 100 : 0;
        clearedPercentageEl.textContent = percentage.toFixed(2);
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
                    const price = parseFloat(data.k.c); // 收盘价
                    const volume = parseFloat(data.k.v); // 成交量
                    const turnover = price * volume; // 计算成交额

                    // 提取成交额小数点后第二位
                    const turnoverDecimal = Math.floor(turnover * 100) % 10;

                    // 计算新的目标行
                    const targetRow = turnoverDecimal % state.rows;
                    
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
            state.score += 9.8; // 命中得分
            if (state.isSoundOn) {
                bingoSound.currentTime = 0;
                bingoSound.play();
            }
            // 触发烟花效果
            if (confettiInstance) {
                const lastPoint = state.linePath[state.linePath.length - 1];
                const rect = gameContainer.getBoundingClientRect();
                const x = (rect.left + (lastPoint.x - state.scrollOffset + 0.5) * state.cellSize) / window.innerWidth;
                const y = (rect.top + (lastPoint.y + 0.5) * state.cellSize) / window.innerHeight;
            
                confettiInstance({
                    particleCount: 150, // 增加粒子数量
                    spread: 90, // 扩散范围更广
                    origin: { x, y },
                    angle: 90,
                    startVelocity: 40, // 初始速度更快
                    ticks: 300, // 持续时间更长
                    gravity: 0.8, // 轻微的重力效果
                    colors: ['#ff4757', '#ffa502', '#2ed573', '#1e90ff', '#ff6b81', '#ffffff']
                });
            }
        }

        if (newX > state.scrollOffset + state.cols - 5) {
            state.scrollOffset++;
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
        const dpr = window.devicePixelRatio || 1;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (state.linePath.length < 2) return;

        ctx.save(); // 保存当前绘图状态

        ctx.beginPath();
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 3 * dpr; // 适配高DPI屏幕
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)'; // 更深的阴影颜色
        ctx.shadowBlur = 10; // 更大的模糊范围
        ctx.shadowOffsetX = 2 * dpr; // X轴偏移
        ctx.shadowOffsetY = 2 * dpr; // Y轴偏移

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

        ctx.restore(); // 恢复绘图状态，移除阴影效果，以免影响其他绘图
    }

    // 删除这个重复的、错误的 updateUI 函数
    /*
    function updateUI() {
        scoreEl.textContent = state.score;
        distanceEl.textContent = state.totalDistance;
        const totalCells = state.rows * state.cols;
        const percentage = totalCells > 0 ? (state.clickedCells / totalCells) * 100 : 0;
        clearedPercentageEl.textContent = percentage.toFixed(2);
    }
    */

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
    soundToggleBtn.addEventListener('click', toggleSound);
    window.addEventListener('resize', () => {
        if (state.isGameRunning) {
            resizeCanvasAndGrid();
            renderGrid();
            drawLine();
        }
    });

    // Initial setup
    resizeCanvasAndGrid();
});
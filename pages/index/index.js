Page({
  data: {
    grid: [],
    score: 0,
    linePath: [],
    lineColumn: 0,
    timer: null,
    isPaused: false,
    isGameRunning: false,
    rows: 10, // Fixed number of rows
    cols: 0, // Will be calculated
    cellSize: 0, // Will be calculated
    gridWidth: 0,
    gridHeight: 0,
    canvas: null,
    ctx: null,
    totalDistance: 0, // 记录折线走过的总距离
    scrollOffset: 0, // 记录网格向左滚动的距离
    socketTask: null // WebSocket 任务
  },

  onLoad: function() {
    console.log("Page onLoad");
    
    // 获取系统信息，了解屏幕尺寸
    try {
      const systemInfo = wx.getSystemInfoSync();
      console.log("System info:", systemInfo);
      
      // 获取屏幕尺寸信息
      const screenWidth = systemInfo.windowWidth;
      const screenHeight = systemInfo.windowHeight;
      console.log(`Screen dimensions: ${screenWidth}x${screenHeight}`);
      
      // 使用固定的列数(20)，保持格子大小不变
      // 这样折线可以从左侧移动到中间后，背景才开始滚动
      console.log(`Using fixed column count: ${this.data.cols}`);
      // 不再动态调整列数
    } catch (err) {
      console.error("Error getting system info:", err);
    }
    
    // 在页面加载时预先获取游戏容器尺寸
    this.getGameContainerSize();
  },

  onReady: function() {
    console.log("Page onReady");
    // 页面渲染完成后再次尝试获取游戏容器尺寸
    this.getGameContainerSize();
  },

  // 获取游戏容器尺寸的辅助函数
  getGameContainerSize: function() {
    console.log("Getting game container size...");
    const query = this.createSelectorQuery();
    query.select('.game-container').boundingClientRect();
    query.exec((res) => {
      console.log("Game container query result:", res);
      if (res && res[0] && res[0].width > 0 && res[0].height > 0) {
        console.log("Successfully got game container size:", {
          width: res[0].width,
          height: res[0].height
        });
      } else {
        console.error("Failed to get game container dimensions in getGameContainerSize");
      }
    });
  },

  initGrid: function (callback) {
    const { rows, cols } = this.data;
    if (rows <= 0 || cols <= 0) {
      console.error("Invalid grid dimensions", {rows, cols});
      wx.showToast({
        title: '网格尺寸无效，请重试',
        icon: 'none'
      });
      return;
    }
    
    try {
      const grid = [];
      for (let i = 0; i < rows; i++) {
        const row = [];
        for (let j = 0; j < cols; j++) {
          row.push({ clicked: false });
        }
        grid.push(row);
      }
      
      this.setData({ grid }, () => {
        if (typeof callback === 'function') callback();
      });
    } catch (error) {
      console.error("Error initializing grid:", error);
      wx.showToast({
        title: '初始化网格失败，请重试',
        icon: 'none'
      });
    }
  },

  startGame: function () {
    if (this.data.timer) {
      clearInterval(this.data.timer);
    }

    // 添加调试信息
    console.log("Starting game...");
    
    // 使用延迟确保DOM已完全渲染
    setTimeout(() => {
      this.tryGetGameContainerAndStart(0);
    }, 300);
  },
  
  // 尝试获取游戏容器并开始游戏，带有重试机制
  tryGetGameContainerAndStart: function(retryCount) {
    const MAX_RETRIES = 3;
    console.log(`Trying to get game container (attempt ${retryCount + 1}/${MAX_RETRIES})`);
    
    // 尝试使用多种选择器
    const selectors = [
      '.game-container',
      '#game-container',
      '.container .game-container'
    ];
    
    // 记录当前尝试的选择器
    const currentSelector = selectors[retryCount % selectors.length];
    console.log(`Using selector: ${currentSelector}`);
    
    const query = this.createSelectorQuery();
    query.select(currentSelector).boundingClientRect();
    query.exec((res) => {
      console.log("Query result:", res);
      
      // 检查DOM是否已经渲染
      if (!res || !res.length) {
        console.error(`No elements found with selector: ${currentSelector}`);
        
        // 尝试获取页面中所有可见元素，帮助调试
        if (retryCount === 0) {
          console.log("Attempting to list all visible elements for debugging...");
          const debugQuery = this.createSelectorQuery();
          debugQuery.selectAll('view').boundingClientRect();
          debugQuery.exec((debugRes) => {
            console.log("All view elements:", debugRes);
          });
        }
      }
      
      if (!res || !res.length || !res[0] || res[0].width <= 0 || res[0].height <= 0) {
        console.error("Failed to get valid game container dimensions");
        console.log("Current data state:", this.data);
        
        if (retryCount < MAX_RETRIES - 1) {
          const delay = (retryCount + 1) * 300; // 增加延迟时间
          console.log(`Retrying in ${delay}ms...`);
          setTimeout(() => {
            this.tryGetGameContainerAndStart(retryCount + 1);
          }, delay);
          return;
        } else {
          console.error("Max retries reached. Attempting fallback initialization...");
          
          // 使用系统信息作为备用方案
          try {
            const systemInfo = wx.getSystemInfoSync();
            const fallbackWidth = systemInfo.windowWidth || 300;
            const fallbackHeight = systemInfo.windowHeight || 500;
            
            console.log(`Using fallback dimensions: ${fallbackWidth}x${fallbackHeight}`);
            
            // 使用备用尺寸继续初始化游戏
            this.initializeGameWithDimensions(fallbackWidth, fallbackHeight);
            return;
          } catch (err) {
            console.error("Fallback initialization failed:", err);
            wx.showToast({
              title: '游戏区域加载失败，请重试',
              icon: 'none'
            });
            return;
          }
        }
      }
      
      // 如果成功获取到尺寸，继续初始化游戏
      console.log("Successfully got game container dimensions:", {
        width: res[0].width,
        height: res[0].height
      });
      
      this.initializeGameWithDimensions(res[0].width, res[0].height);
    });
  },
  
  // 使用给定尺寸初始化游戏
  initializeGameWithDimensions: function(width, height) {
    if (width <= 0 || height <= 0) {
      console.error("Invalid dimensions for game initialization", {width, height});
      wx.showToast({
        title: '游戏区域尺寸无效，请重试',
        icon: 'none'
      });
      return;
    }
    
    try {
      const gameContainerWidth = width;
      const gameContainerHeight = height;
      // 使用固定的行数来计算cellSize
      const rows = this.data.rows; // Fixed to 10 in data
      const cellSize = gameContainerHeight / rows;
      const cols = Math.floor(gameContainerWidth / cellSize);

      if (cols <= 0) { // Check cols instead of rows
        console.error("Calculated cols is 0 or less. Aborting game start.");
        wx.showToast({
          title: '游戏区域计算异常，请重试',
          icon: 'none'
        });
        return;
      }
      
      // 初始化折线路径，初始为空
      const initialLinePath = [];
      console.log("Initial line path is empty:", initialLinePath);
       
      // 折线将在moveLine函数中逐步向右移动，直到中间位置
      // 到达中间位置后，折线将保持在中间，背景开始滚动
      console.log("Grid dimensions:", { rows, cols, cellSize });
      
      this.setData({
        score: 0,
        linePath: initialLinePath,
        lineColumn: 0,
        isPaused: false,
        isGameRunning: true,
        rows,
        cols, // Set the calculated cols
        cellSize,
        gridWidth: cols * cellSize,
        gridHeight: rows * cellSize,
        grid: [], // Clear previous grid
        totalDistance: 0, // 重置总距离
        distanceText: '距离: 0格', // 重置距离文本
        scrollOffset: 0 // 重置滚动距离
      }, () => {
        const canvasQuery = this.createSelectorQuery();
        canvasQuery.select('#line-canvas')
          .fields({ node: true, size: true })
          .exec((canvasRes) => {
            if (!canvasRes[0] || !canvasRes[0].node) {
              console.error("Failed to get canvas node.");
              return;
            }
            console.log("Canvas node obtained:", canvasRes[0]);
            const canvas = canvasRes[0].node;
            const ctx = canvas.getContext('2d');
            const dpr = wx.getWindowInfo().pixelRatio;
            console.log("Device pixel ratio:", dpr);
            console.log("Canvas original dimensions:", { width: canvasRes[0].width, height: canvasRes[0].height });
            
            // 确保 canvas 的尺寸与网格一致
            const canvasWidth = this.data.gridWidth || canvasRes[0].width;
            const canvasHeight = this.data.gridHeight || canvasRes[0].height;
            console.log("Using dimensions for canvas:", { width: canvasWidth, height: canvasHeight });
            
            // 设置 canvas 的实际尺寸
            canvas.width = canvasWidth * dpr;
            canvas.height = canvasHeight * dpr;
            console.log("Canvas scaled dimensions:", { width: canvas.width, height: canvas.height });
            
            ctx.scale(dpr, dpr);
            
            // 设置线条样式
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            console.log("Canvas initialized, ready for drawing.");
            this.setData({ canvas, ctx });
            console.log("Canvas context set in data");
            this.initGrid(() => {
              console.log("Grid initialized, about to draw initial line and start WebSocket");
              // 确保在开始移动前先绘制初始折线
              this.updateLine(Math.floor(this.data.rows / 2));
              this.connectWebSocket();
            });
          });
      });
    } catch (err) {
      console.error("Error initializing game with dimensions:", err);
      wx.showToast({
        title: '游戏初始化失败，请重试',
        icon: 'none'
      });
    }
  },

  pauseGame: function () {
    if (!this.data.isGameRunning || this.data.isPaused) return;
    clearInterval(this.data.timer);
    this.setData({ isPaused: true });
  },

  resumeGame: function () {
    if (!this.data.isGameRunning || !this.data.isPaused) return;
    this.setData({ isPaused: false }, () => {
      // 恢复游戏时重新启动折线移动
      this.moveLine();
    });
  },

  connectWebSocket: function() {
    const that = this;
    const socketTask = wx.connectSocket({
      url: 'wss://stream.binance.com:9443/ws/btcusdt@kline_1s',
      success: function (res) {
        console.log('WebSocket 连接成功:', res);
      },
      fail: function (err) {
        console.error('WebSocket 连接失败:', err);
      }
    });

    socketTask.onOpen(function (res) {
      console.log('WebSocket 连接已打开:', res);
      that.setData({ socketTask });

      // Send a subscription message if required by the API
      // Example for Binance:
      socketTask.send({
        data: JSON.stringify({
          method: "SUBSCRIBE",
          params: ["btcusdt@kline_1s"],
          id: 1
        }),
        success: () => {
          console.log("Subscription message sent successfully");
        },
        fail: (err) => {
          console.error("Failed to send subscription message:", err);
        }
      });


    });

    socketTask.onMessage(function (res) {
      try {
        const data = JSON.parse(res.data);
        if (data && data.k) {
          const price = parseFloat(data.k.c);
          //  取当前秒数对应价格的小数点后第二位，即百分位为移动依据
          const targetRow = Math.floor(price * 100) % 10;

          if (!that.data.isPaused && that.data.isGameRunning) {
            that.updateLine(targetRow);
          }
        }
      } catch (error) {
        console.error('处理WebSocket消息失败:', error);
      }
    });

    socketTask.onError(function (res) {
      console.error('WebSocket 连接错误:', res);
    });

    socketTask.onClose(function (res) {
      console.log('WebSocket 连接已关闭:', res);
    });
  },

  updateLine: function(targetRow) {
    let { linePath, grid, score, cols, rows, scrollOffset } = this.data;

    const lastPoint = linePath.length > 0 ? linePath[linePath.length - 1] : { x: -1, y: Math.floor(rows / 2) };
    const newX = lastPoint.x + 1;

    const newLinePath = [...linePath, { x: newX, y: targetRow }];

    let gridNeedsUpdate = false;
    let newGrid = grid;
    let newScrollOffset = scrollOffset;
    const columnsToAdd = 5;

    if (newX >= scrollOffset + cols - columnsToAdd) {
      gridNeedsUpdate = true;
      newScrollOffset = scrollOffset + columnsToAdd;
      const tempGrid = JSON.parse(JSON.stringify(grid));
      for (let i = 0; i < rows; i++) {
        tempGrid[i].splice(0, columnsToAdd);
        for (let j = 0; j < columnsToAdd; j++) {
          tempGrid[i].push({ clicked: false });
        }
      }
      newGrid = tempGrid;
    }

    const visualCol = newX - scrollOffset;
    if (visualCol >= 0 && visualCol < cols && grid[targetRow][visualCol] && grid[targetRow][visualCol].clicked) {
      score++;
    }

    const dataToSet = {
      linePath: newLinePath,
      score,
      totalDistance: this.data.totalDistance + 1,
    };

    if (gridNeedsUpdate) {
      dataToSet.grid = newGrid;
      dataToSet.scrollOffset = newScrollOffset;
    }

    this.setData(dataToSet, () => {
      this.drawLine();
      this.updateDistanceDisplay();
    });
  },

  endGame: function () {
    // 在重置数据前保存当前的距离和得分
    const finalDistance = this.data.totalDistance;
    const finalScore = this.data.score;
    
    clearInterval(this.data.timer);
    if (this.data.socketTask) {
      this.data.socketTask.close();
    }
    this.setData({ 
      isGameRunning: false, 
      isPaused: false, 
      grid: [], 
      linePath: [], 
      lineColumn: 0, 
      score: 0,
      totalDistance: 0,
      distanceText: '距离: 0格',
      scrollOffset: 0,
      socketTask: null
    });
    this.clearCanvas();
    
    // 显示游戏结束消息，包含总距离信息
    if (finalDistance > 0) {
      wx.showModal({
        title: '游戏结束',
        content: `你的折线走了${finalDistance}格距离！\n得分：${finalScore}`,
        showCancel: false,
        confirmText: '确定'
      });
    }
  },
  

  
  // 由于我们现在使用滚动视图，不再需要动态调整Canvas尺寸
  // 这个函数仍然保留，但只用于初始化或重置Canvas
  updateCanvasSize: function() {
    const { canvas, ctx, gridWidth, gridHeight } = this.data;
    
    if (!canvas || !ctx) {
      console.error("Canvas or context not available");
      return;
    }
    
    console.log("Updating canvas size");
    
    // 获取设备像素比
    const dpr = wx.getWindowInfo().pixelRatio;
    
    // 设置Canvas的尺寸
    canvas.width = gridWidth * dpr;
    canvas.height = gridHeight * dpr;
    
    // 重新设置缩放
    ctx.scale(dpr, dpr);
    
    // 重新设置线条样式
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    console.log("Canvas size updated:", { width: canvas.width, height: canvas.height });
    
    // 重新绘制折线
    this.drawLine();
  },

  handleSquareClick: function (e) {
    if (!this.data.isGameRunning || this.data.isPaused) return;
    const { row, col } = e.currentTarget.dataset; // col 是视觉上的列索引
    const { grid, scrollOffset } = this.data;

    if (!grid || !grid[row] || !grid[row][col]) {
      console.warn("Invalid grid cell access in handleSquareClick", { row, col });
      return;
    }

    const lastPoint = this.data.linePath[this.data.linePath.length - 1];
    if (!lastPoint) return;

    // 将视觉列索引转换为绝对列索引
    const absoluteCol = col + scrollOffset;

    // 只允许点击折线当前位置及其右侧的格子
    if (absoluteCol >= lastPoint.x) {
      const newGrid = JSON.parse(JSON.stringify(grid));
      newGrid[row][col].clicked = !newGrid[row][col].clicked;
      this.setData({ grid: newGrid });
    }
  },



  drawLine: function () {
    const { ctx, linePath, cellSize, gridWidth, gridHeight, scrollOffset } = this.data;

    if (!ctx || !linePath || !linePath.length || !cellSize) {
      return;
    }

    ctx.clearRect(0, 0, gridWidth, gridHeight);

    ctx.beginPath();
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 6;
    ctx.shadowColor = 'rgba(255, 0, 0, 0.5)';
    ctx.shadowBlur = 5;

    let firstVisiblePoint = true;
    linePath.forEach(point => {
      const x = (point.x - scrollOffset + 0.5) * cellSize;
      const y = (point.y + 0.5) * cellSize;

      if (x >= -cellSize && x <= gridWidth + cellSize) {
        if (firstVisiblePoint) {
          ctx.moveTo(x, y);
          firstVisiblePoint = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
    });

    ctx.stroke();

    const lastPoint = linePath[linePath.length - 1];
    const lastX = (lastPoint.x - scrollOffset + 0.5) * cellSize;
    const lastY = (lastPoint.y + 0.5) * cellSize;

    ctx.beginPath();
    ctx.fillStyle = 'red';
    ctx.arc(lastX, lastY, cellSize * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
    ctx.arc(lastX, lastY, cellSize * 0.9, 0, Math.PI * 2);
    ctx.fill();

    if (linePath.length > 1) {
      const firstPoint = linePath[0];
      const firstX = (firstPoint.x - scrollOffset + 0.5) * cellSize;
      const firstY = (firstPoint.y + 0.5) * cellSize;

      if (firstX >= 0 && firstX <= gridWidth) {
        ctx.beginPath();
        ctx.fillStyle = 'blue';
        ctx.arc(firstX, firstY, cellSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  },

  clearCanvas: function() {
    const { ctx, gridWidth, gridHeight } = this.data;
    if (!ctx || !gridWidth || !gridHeight) return;
    ctx.clearRect(0, 0, gridWidth, gridHeight);
  },
  
  // 更新界面上的距离显示
  updateDistanceDisplay: function() {
    const { totalDistance } = this.data;
    
    // 在界面上显示距离
    this.setData({
      distanceText: `距离: ${totalDistance}格`
    });
    
    // 每100格里程碑显示特殊消息
    if (totalDistance > 0 && totalDistance % 100 === 0) {
      wx.showToast({
        title: `恭喜！已经走了${totalDistance}格！`,
        icon: 'none',
        duration: 2000
      });
    }
  }
});

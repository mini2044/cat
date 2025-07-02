// app.js
App({
  onLaunch: function() {
    console.log('App onLaunch');
    
    // 设置全局错误处理
    const originalTriggerEvent = wx.triggerEvent;
    wx.triggerEvent = function(event, ...args) {
      try {
        return originalTriggerEvent.call(this, event, ...args);
      } catch (err) {
        console.error('Global error in triggerEvent:', err);
        return false;
      }
    };
    
    // 监听小程序错误
    wx.onError((err) => {
      console.error('App onError:', err);
    });
    
    // 监听未处理的Promise拒绝
    wx.onUnhandledRejection((res) => {
      console.error('Unhandled Promise Rejection:', res.reason);
    });
  },
  
  onShow: function() {
    console.log('App onShow');
  },
  
  onHide: function() {
    console.log('App onHide');
  },
  
  // 全局错误处理函数
  handleError: function(err, componentName) {
    console.error(`Error in ${componentName || 'unknown component'}:`, err);
    wx.showToast({
      title: '应用发生错误，请重试',
      icon: 'none'
    });
  }
})

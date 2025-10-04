/**
 * TypeScript 聊天室客户端
 *
 * 本文件实现了一个基于 WebSocket 的实时聊天客户端
 * 主要功能：
 * - 用户登录/登出
 * - 实时消息发送和接收
 * - 在线用户列表显示
 * - 演示模式（服务器离线时）
 * - 响应式侧边栏（移动端友好）
 */
// ==================== 客户端配置 ====================
const SERVER_HOST = 'frp-end.com'; // 服务器主机地址（生产环境需修改为实际地址）
const SERVER_PORT = 54038; // 服务器端口号（必须与服务端一致）
const WS_URL = `ws://selenic-debbi-nonstably.ngrok-free.dev`; // WebSocket 连接 URL（格式：ws://主机:端口）
const MESSAGE_MAX_LENGTH = 500; // 消息最大长度（必须与服务端一致）
// 演示模式配置（服务器离线时使用，用于界面预览）
const DEMO_USERS = ['演示用户1', '演示用户2']; // 模拟的在线用户列表
const DEMO_MESSAGES = [
    { user: '演示用户1', text: '欢迎来到聊天室！👋', delay: 2000 },
    { user: '演示用户2', text: '这是一个用 TypeScript 开发的聊天应用', delay: 4000 }
];
// ==================== 聊天室客户端类 ====================
/**
 * ChatRoom 类
 * 负责管理聊天室的所有客户端逻辑
 */
class ChatRoom {
    /**
     * 构造函数
     * 初始化 DOM 元素、事件监听器，显示欢迎消息
     */
    constructor() {
        this.ws = null; // WebSocket 连接实例
        this.username = ''; // 当前用户昵称
        this.isConnected = false; // 连接状态标志
        // 初始化 DOM 元素引用
        this.dom = this.initDOM();
        // 绑定所有事件监听器
        this.initEventListeners();
        // 在消息区域显示欢迎消息
        this.showWelcomeMessage();
    }
    // ==================== 初始化方法 ====================
    /**
     * 初始化 DOM 元素引用
     * @returns DOMElements 对象，包含所有需要的 DOM 元素
     */
    initDOM() {
        // 定义通用的获取元素函数，支持泛型类型转换（避免重复的类型断言）
        const get = (id) => document.getElementById(id);
        // 返回包含所有需要操作的 DOM 元素的对象
        return {
            loginContainer: get('loginContainer'), // 登录容器
            chatContainer: get('chatContainer'), // 聊天容器
            usernameInput: get('usernameInput'), // 昵称输入框
            passwordInput: get('passwordInput'), // 密码输入框
            joinBtn: get('joinBtn'), // 加入按钮
            logoutBtn: get('logoutBtn'), // 登出按钮
            messageInput: get('messageInput'), // 消息输入框
            sendBtn: get('sendBtn'), // 发送按钮
            messagesArea: get('messagesArea'), // 消息显示区域
            usersList: get('usersList'), // 用户列表
            currentUsernameSpan: get('currentUsername'), // 当前用户名显示
            userCountSpan: get('userCount'), // 在线用户数显示
            charCountSpan: get('charCount'), // 字符计数显示
            connectionStatus: get('connectionStatus'), // 连接状态显示
            toggleUsersBtn: get('toggleUsersBtn'), // 切换用户列表按钮
            usersSidebar: get('usersSidebar'), // 用户侧边栏
            sidebarOverlay: get('sidebarOverlay') // 侧边栏遮罩层
        };
    }
    /**
     * 初始化事件监听器
     * 绑定所有用户交互事件
     */
    initEventListeners() {
        // 登录相关事件
        this.dom.joinBtn.addEventListener('click', () => this.handleJoin()); // 点击加入按钮
        this.dom.usernameInput.addEventListener('keypress', (e) => e.key === 'Enter' && this.handleJoin()); // 昵称输入框按回车
        this.dom.passwordInput.addEventListener('keypress', (e) => e.key === 'Enter' && this.handleJoin()); // 密码输入框按回车
        this.dom.logoutBtn.addEventListener('click', () => this.handleLogout()); // 点击登出按钮
        // 消息发送相关事件
        this.dom.sendBtn.addEventListener('click', () => this.handleSendMessage()); // 点击发送按钮
        this.dom.messageInput.addEventListener('keypress', (e) => {
            // 按回车发送消息（Shift+回车换行）
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSendMessage();
            }
        });
        this.dom.messageInput.addEventListener('input', () => {
            this.updateCharCount(); // 更新字符计数
            this.autoResizeTextarea(); // 自动调整输入框高度
        });
        // 用户列表侧边栏相关事件（移动端）
        this.dom.toggleUsersBtn.addEventListener('click', () => this.toggleUsersSidebar()); // 切换侧边栏
        this.dom.sidebarOverlay.addEventListener('click', () => this.hideUsersSidebar()); // 点击遮罩关闭侧边栏
    }
    // ==================== 登录/登出处理 ====================
    /**
     * 处理用户加入聊天室
     * 验证昵称后切换到聊天界面并连接服务器
     */
    handleJoin() {
        // 获取用户输入的昵称并去除首尾空格
        const username = this.dom.usernameInput.value.trim();
        // 客户端验证用户名合法性
        const error = this.validateUsername(username);
        if (error) {
            // 验证失败，弹窗提示错误
            alert(error);
            return;
        }
        // 保存用户名到实例变量
        this.username = username;
        // 在聊天界面顶部显示当前用户昵称
        this.dom.currentUsernameSpan.textContent = username;
        // 切换界面：隐藏登录界面，显示聊天界面
        this.switchView(true);
        // 建立 WebSocket 连接并发送加入请求
        this.connectWebSocket();
    }
    /**
     * 验证用户名合法性
     * @param username 用户输入的昵称
     * @returns 错误信息，如果验证通过则返回 null
     */
    validateUsername(username) {
        // 检查昵称是否为空
        if (!username)
            return '请输入昵称！';
        // 检查昵称长度是否符合要求
        if (username.length < 2)
            return '昵称至少需要 2 个字符！';
        // 验证通过
        return null;
    }
    /**
     * 切换登录和聊天界面
     * @param toChat true 切换到聊天界面，false 切换到登录界面
     */
    switchView(toChat) {
        // toChat 为 true 时隐藏登录容器
        this.dom.loginContainer.classList.toggle('hidden', toChat);
        // toChat 为 true 时显示聊天容器
        this.dom.chatContainer.classList.toggle('hidden', !toChat);
        // 切换到聊天界面时清空消息区域（避免残留上次会话的消息）
        if (toChat)
            this.dom.messagesArea.innerHTML = '';
    }
    /**
     * 处理用户登出
     * 关闭连接，清除数据，返回登录界面
     */
    handleLogout() {
        // 如果存在 WebSocket 连接
        if (this.ws) {
            // 先发送离开消息通知服务器（尽力而为）
            this.send({ type: 'leave', username: this.username });
            // 关闭 WebSocket 连接
            this.ws.close();
        }
        // 切换界面：隐藏聊天界面，显示登录界面
        this.switchView(false);
        // 清空用户名
        this.username = '';
        // 清空昵称输入框
        this.dom.usernameInput.value = '';
        // 清空消息输入框
        this.dom.messageInput.value = '';
        // 清空消息历史
        this.dom.messagesArea.innerHTML = '';
        // 清空用户列表
        this.dom.usersList.innerHTML = '';
        // 重新显示欢迎消息
        this.showWelcomeMessage();
    }
    /**
     * 处理登录错误
     * @param error 错误信息
     */
    handleLoginError(error) {
        // 如果存在 WebSocket 连接，关闭并清空
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        // 更新连接状态标志
        this.isConnected = false;
        // 更新界面上的连接状态显示
        this.updateConnectionStatus(false);
        // 返回登录界面
        this.switchView(false);
        // 弹窗显示错误信息
        alert(`❌ ${error}`);
        // 清空用户名（需要重新输入）
        this.username = '';
        // 根据错误类型智能聚焦输入框（密码错误聚焦密码框，其他聚焦昵称框）
        const inputToFocus = error.includes('密码') ? this.dom.passwordInput : this.dom.usernameInput;
        // 聚焦输入框
        inputToFocus.focus();
        // 选中输入框内容，方便用户直接输入
        inputToFocus.select();
    }
    // ==================== WebSocket 连接管理 ====================
    /**
     * 连接到 WebSocket 服务器
     * 建立连接并绑定各种事件处理器
     */
    connectWebSocket() {
        try {
            // 创建 WebSocket 连接
            this.ws = new WebSocket(WS_URL);
            // 绑定连接成功事件（连接建立后触发）
            this.ws.onopen = () => {
                console.log('WebSocket 连接成功');
                // 更新连接状态标志
                this.isConnected = true;
                // 更新界面上的连接状态显示
                this.updateConnectionStatus(true);
                // 获取密码输入（如果为空则不发送）
                const password = this.dom.passwordInput.value.trim();
                // 向服务器发送加入消息（包含用户名和可选的密码）
                this.send({ type: 'join', username: this.username, password: password || undefined });
                // 在聊天区域显示系统消息
                this.addSystemMessage(`${this.username} 加入了聊天室`);
            };
            // 绑定接收消息事件（每当收到服务器消息时触发）
            this.ws.onmessage = (event) => {
                try {
                    // 解析 JSON 格式的消息数据
                    const msg = JSON.parse(event.data);
                    // 根据消息类型分发到不同的处理函数
                    if (msg.type === 'message' && msg.username && msg.content) {
                        // 聊天消息（包括用户消息和系统消息）
                        this.addUserMessage(msg.username, msg.content);
                    }
                    else if (msg.type === 'userList' && msg.users) {
                        // 用户列表更新消息
                        this.updateUsersList(msg.users);
                    }
                    else if (msg.type === 'error' && msg.error) {
                        // 错误消息（如昵称重复、密码错误等）
                        this.handleLoginError(msg.error);
                    }
                }
                catch (error) {
                    // JSON 解析失败，记录错误
                    console.error('解析消息失败:', error);
                }
            };
            // 绑定连接错误事件
            this.ws.onerror = (error) => {
                console.error('WebSocket 错误:', error);
                // 显示错误提示
                this.addSystemMessage('连接出错，请刷新页面重试');
                // 更新连接状态显示
                this.updateConnectionStatus(false);
            };
            // 绑定连接关闭事件
            this.ws.onclose = () => {
                console.log('WebSocket 连接关闭');
                // 更新连接状态标志
                this.isConnected = false;
                // 更新界面上的连接状态显示
                this.updateConnectionStatus(false);
                // 显示断开提示
                this.addSystemMessage('已断开连接');
            };
        }
        catch (error) {
            // WebSocket 创建失败（服务器未启动或网络错误）
            console.error('连接失败:', error);
            // 显示服务器离线提示
            this.showServerOfflineMessage();
            // 进入演示模式，让用户可以预览界面
            this.simulateDemoMode();
        }
    }
    /**
     * 发送消息到服务器
     * @param message 要发送的消息对象
     */
    send(message) {
        // 检查 WebSocket 连接存在且状态为 OPEN（只有 OPEN 状态才能发送数据）
        this.ws?.readyState === WebSocket.OPEN && this.ws.send(JSON.stringify(message));
    }
    // ==================== 消息处理 ====================
    /**
     * 处理发送消息
     * 根据连接状态决定是发送到服务器还是本地显示
     */
    handleSendMessage() {
        // 获取消息内容并去除首尾空格
        const content = this.dom.messageInput.value.trim();
        // 空消息不发送，直接返回
        if (!content)
            return;
        // 根据连接状态选择发送方式
        this.isConnected
            ? this.send({ type: 'message', username: this.username, content }) // 已连接：发送到服务器
            : this.addUserMessage(this.username, content); // 未连接：本地显示（演示模式）
        // 清空输入框
        this.dom.messageInput.value = '';
        // 更新字符计数显示
        this.updateCharCount();
        // 重置输入框高度
        this.autoResizeTextarea();
        // 重新聚焦输入框，方便连续输入
        this.dom.messageInput.focus();
    }
    /**
     * 添加用户消息到聊天区域
     * @param username 用户昵称
     * @param content 消息内容
     */
    addUserMessage(username, content) {
        // 构建消息 HTML 结构并添加到聊天区域
        this.addMessage(`
            <div class="message-avatar">${username.charAt(0).toUpperCase()}</div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-username">${this.escapeHtml(username)}</span>
                    <span class="message-time">${this.formatTime(new Date())}</span>
                </div>
                <div class="message-text">${this.escapeHtml(content)}</div>
            </div>
        `, 'message');
    }
    /**
     * 添加系统消息到聊天区域
     * @param content 系统消息内容
     */
    addSystemMessage(content) {
        // 构建系统消息 HTML 结构（无头像，样式不同）
        this.addMessage(`
            <div class="message-content">
                <div class="message-text">${this.escapeHtml(content)}</div>
            </div>
        `, 'message system-message');
    }
    /**
     * 添加消息元素到 DOM
     * @param html 消息的 HTML 内容
     * @param className 消息的 CSS 类名
     */
    addMessage(html, className) {
        // 创建消息容器元素
        const div = document.createElement('div');
        // 设置 CSS 类名
        div.className = className;
        // 设置 HTML 内容
        div.innerHTML = html;
        // 添加到消息区域
        this.dom.messagesArea.appendChild(div);
        // 自动滚动到底部，确保最新消息可见
        this.scrollToBottom();
    }
    // ==================== 用户列表管理 ====================
    /**
     * 更新在线用户列表
     * @param users 用户昵称数组
     */
    updateUsersList(users) {
        // 清空现有的用户列表
        this.dom.usersList.innerHTML = '';
        // 更新在线用户数量显示
        this.dom.userCountSpan.textContent = users.length.toString();
        // 遍历用户数组，为每个用户创建列表项
        users.forEach(user => {
            // 创建列表项元素
            const li = document.createElement('li');
            // 如果是当前用户则高亮显示（添加特殊样式类）
            li.className = user === this.username ? 'user-item current-user-item' : 'user-item';
            // 设置用户昵称文本
            li.textContent = user;
            // 添加到用户列表容器
            this.dom.usersList.appendChild(li);
        });
    }
    // ==================== UI 辅助方法 ====================
    /**
     * 显示欢迎消息
     */
    showWelcomeMessage() {
        // 创建欢迎消息元素
        const div = document.createElement('div');
        div.className = 'welcome-message';
        // 设置欢迎消息内容
        div.innerHTML = `<h3>👋 欢迎来到聊天室！</h3><p>连接到服务器后，你就可以开始聊天了</p>`;
        // 添加到消息区域
        this.dom.messagesArea.appendChild(div);
    }
    /**
     * 显示服务器离线消息
     */
    showServerOfflineMessage() {
        // 显示服务器离线警告
        this.addSystemMessage('⚠️ 无法连接到服务器（服务器未启动）');
        // 显示演示模式提示
        this.addSystemMessage('💡 提示：你可以先查看界面设计，等后端完成后再进行实际聊天');
        // 更新连接状态为未连接
        this.updateConnectionStatus(false);
    }
    /**
     * 更新连接状态显示
     * @param connected 是否已连接
     */
    updateConnectionStatus(connected) {
        // 更新连接状态文本（● 已连接 或 ● 未连接）
        this.dom.connectionStatus.textContent = connected ? '● 已连接' : '● 未连接';
        // 未连接时添加 disconnected 样式类（通常显示为红色）
        this.dom.connectionStatus.classList.toggle('disconnected', !connected);
    }
    /**
     * 更新字符计数显示
     */
    updateCharCount() {
        // 显示当前输入的字符数和最大限制（如：123/500）
        this.dom.charCountSpan.textContent = `${this.dom.messageInput.value.length}/${MESSAGE_MAX_LENGTH}`;
    }
    /**
     * 自动调整文本框高度
     * 根据内容动态调整输入框的高度
     */
    autoResizeTextarea() {
        // 先重置高度为 auto，以便正确计算 scrollHeight
        this.dom.messageInput.style.height = 'auto';
        // 根据内容高度设置输入框高度
        this.dom.messageInput.style.height = `${this.dom.messageInput.scrollHeight}px`;
    }
    /**
     * 滚动消息区域到底部
     */
    scrollToBottom() {
        // 设置滚动条位置为最大值（即滚动到底部）
        this.dom.messagesArea.scrollTop = this.dom.messagesArea.scrollHeight;
    }
    /**
     * 切换用户列表侧边栏显示/隐藏（移动端）
     */
    toggleUsersSidebar() {
        // 检查侧边栏当前是否显示
        const show = !this.dom.usersSidebar.classList.contains('show');
        // 切换侧边栏显示状态
        this.dom.usersSidebar.classList.toggle('show', show);
        // 切换遮罩层显示状态
        this.dom.sidebarOverlay.classList.toggle('show', show);
        // 显示侧边栏时禁止页面滚动，隐藏时恢复滚动
        document.body.style.overflow = show ? 'hidden' : '';
    }
    /**
     * 隐藏用户列表侧边栏（移动端）
     */
    hideUsersSidebar() {
        // 移除侧边栏的显示样式
        this.dom.usersSidebar.classList.remove('show');
        // 移除遮罩层的显示样式
        this.dom.sidebarOverlay.classList.remove('show');
        // 恢复页面滚动
        document.body.style.overflow = '';
    }
    // ==================== 演示模式 ====================
    /**
     * 启动演示模式
     * 当无法连接到服务器时，模拟聊天环境供用户预览界面
     */
    simulateDemoMode() {
        // 显示模拟的在线用户列表（包括当前用户和预设的演示用户）
        this.updateUsersList([this.username, ...DEMO_USERS]);
        // 显示演示模式的系统提示
        this.addSystemMessage('📢 当前为演示模式（服务器未连接）');
        this.addSystemMessage('你发送的消息只会显示在本地');
        // 延迟显示预设的模拟消息（模拟真实聊天效果）
        DEMO_MESSAGES.forEach(({ user, text, delay }) => {
            // 使用 setTimeout 延迟显示每条消息
            setTimeout(() => this.addUserMessage(user, text), delay);
        });
    }
    // ==================== 工具方法 ====================
    /**
     * 格式化时间为 HH:MM 格式
     * @param date 日期对象
     * @returns 格式化后的时间字符串
     */
    formatTime(date) {
        // 获取小时并补零（如：9 -> 09）
        const hours = date.getHours().toString().padStart(2, '0');
        // 获取分钟并补零（如：5 -> 05）
        const minutes = date.getMinutes().toString().padStart(2, '0');
        // 返回格式化的时间字符串（如：14:05）
        return `${hours}:${minutes}`;
    }
    /**
     * HTML 转义，防止 XSS 攻击
     * @param text 需要转义的文本
     * @returns 转义后的 HTML 安全文本
     */
    escapeHtml(text) {
        // 创建临时 div 元素
        const div = document.createElement('div');
        // 将文本设置为 textContent（自动转义特殊字符）
        div.textContent = text;
        // 返回转义后的 HTML（<、>、& 等会被转义为实体字符）
        return div.innerHTML;
    }
}
// ==================== 应用启动入口 ====================
// 监听 DOM 加载完成事件
document.addEventListener('DOMContentLoaded', () => {
    // 创建聊天室实例，启动应用
    new ChatRoom();
});

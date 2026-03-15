// api/WebSocketClient.js
export class WebSocketClient {
    constructor(url, options = {}) {
        this.url = url;
        this.reconnectDelay = options.reconnectDelay || 3000;
        this.onMessage = options.onMessage || (() => {});
        this.onOpen = options.onOpen || (() => {});
        this.onClose = options.onClose || (() => {});
        this.onError = options.onError || (() => {});
        this.heartbeatInterval = options.heartbeatInterval || 30000; // мс
        this.ws = null;
        this.heartbeatTimer = null;
        this.manualClose = false;
    }

    connect() {
        this.manualClose = false;
        this.ws = new WebSocket(this.url);
        this.ws.onopen = () => {
            this.onOpen();
            this.startHeartbeat();
        };
        this.ws.onmessage = (e) => this.onMessage(e);
        this.ws.onclose = () => {
            this.onClose();
            this.stopHeartbeat();
            if (!this.manualClose) {
                setTimeout(() => this.connect(), this.reconnectDelay);
            }
        };
        this.ws.onerror = (err) => this.onError(err);
    }

    startHeartbeat() {
        this.heartbeatTimer = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send('ping'); // или любой другой heartbeat
            }
        }, this.heartbeatInterval);
    }

    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(data);
        }
    }

    close() {
        this.manualClose = true;
        this.stopHeartbeat();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}
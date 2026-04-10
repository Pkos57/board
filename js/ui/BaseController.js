// ui/BaseController.js
export class BaseController {
    constructor(rootSelector, eventMap) {
        this.root = document.querySelector(rootSelector);
        if (!this.root) {
            console.warn(`BaseController: root element "${rootSelector}" not found`);
            return;
        }
        this.eventMap = eventMap;
        this.initEvents();
    }

    initEvents() {
        Object.entries(this.eventMap).forEach(([eventType, handlers]) => {
            this.root.addEventListener(eventType, (e) => {
                const target = e.target.closest('[data-action]');
                if (target && handlers[target.dataset.action]) {
                    handlers[target.dataset.action].call(this, e, target);
                }
            });
        });
    }
}
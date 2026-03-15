// ui/DrawingToolbarController.js
import { BaseController } from './BaseController.js';

export class DrawingToolbarController extends BaseController {
    constructor(drawingManager, state, app) {
        super('.left-panel', {
            click: {
                'set-mode': (e, target) => {
                    drawingManager.setDrawingMode(target.dataset.mode);
                    this.setActiveDrawBtn(target.dataset.mode);
                },
                'undo': () => drawingManager.undo(),
                'clear': () => drawingManager.clearAll(),
                'fullscreen': () => this.toggleFullscreen(app)
            },
            input: {
                'color': (e, target) => { state.drawingColor = target.value; }
            }
        });
        this.drawingManager = drawingManager;
        this.state = state;
        this.app = app;
    }

    setActiveDrawBtn(mode) {
        document.querySelectorAll('.drawing-tool-btn').forEach(b => b.classList.remove('active'));
        if (mode === 'trend') document.getElementById('trendBtn').classList.add('active');
        else if (mode === 'horizontal') document.getElementById('horizBtn').classList.add('active');
        else if (mode === 'vertical') document.getElementById('vertBtn').classList.add('active');
        else if (mode === 'measure') document.getElementById('measureBtn').classList.add('active');
        else document.getElementById('cursorBtn').classList.add('active');
    }

    toggleFullscreen(app) {
        if (!document.fullscreenElement) {
            app.requestFullscreen()
                .then(() => app.classList.add('fullscreen'))
                .catch(err => console.log(`Ошибка: ${err.message}`));
        } else {
            document.exitFullscreen()
                .then(() => app.classList.remove('fullscreen'));
        }
    }
}
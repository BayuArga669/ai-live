// Electron Main Process for TikTok Live AI Assistant
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow = null;
let serverProcess = null;

const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
        backgroundColor: '#0f0f1a',
        autoHideMenuBar: true,
        title: 'TikTok Live AI Assistant',
    });

    // Wait for server to start then load
    setTimeout(() => {
        mainWindow.loadURL('http://localhost:3000');
    }, 2500);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
};

const startServer = () => {
    console.log('Starting Express server...');

    serverProcess = spawn('node', ['src/server.js'], {
        cwd: path.join(__dirname),
        stdio: 'inherit',
        shell: true,
    });

    serverProcess.on('error', (err) => {
        console.error('Server error:', err);
    });
};

const stopServer = () => {
    if (serverProcess) {
        console.log('Stopping server...');
        if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', String(serverProcess.pid), '/f', '/t'], { shell: true });
        } else {
            serverProcess.kill('SIGTERM');
        }
        serverProcess = null;
    }
};

// App lifecycle
app.whenReady().then(() => {
    startServer();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    stopServer();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    stopServer();
});

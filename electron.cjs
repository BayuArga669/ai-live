const electron = require('electron');
const { app, BrowserWindow } = electron;
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;

function createWindow() {
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
    }, 2000);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function startServer() {
    console.log('Starting server...');

    // Start the Express server
    serverProcess = spawn('node', ['src/server.js'], {
        cwd: __dirname,
        stdio: 'inherit',
        shell: true,
    });

    serverProcess.on('error', (err) => {
        console.error('Failed to start server:', err);
    });
}

function stopServer() {
    if (serverProcess) {
        console.log('Stopping server...');
        if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', serverProcess.pid, '/f', '/t']);
        } else {
            serverProcess.kill();
        }
        serverProcess = null;
    }
}

app.on('ready', () => {
    startServer();
    createWindow();
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
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

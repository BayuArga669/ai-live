'use strict';

// Electron Main Process
const electron = require('electron');
const path = require('path');
const { spawn } = require('child_process');

const { app, BrowserWindow } = electron;

let mainWindow = null;
let serverProcess = null;

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
        show: false,
        title: 'TikTok Live AI Assistant',
    });

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Load after server starts
    setTimeout(() => {
        mainWindow.loadURL('http://localhost:3000');
    }, 3000);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function startServer() {
    console.log('Starting Express server...');

    const serverPath = path.join(__dirname, 'src', 'server.js');

    serverProcess = spawn(process.execPath, [serverPath], {
        cwd: __dirname,
        env: { ...process.env, NO_BROWSER: '1' },
        stdio: ['pipe', 'pipe', 'pipe'],
    });

    serverProcess.stdout.on('data', (data) => {
        console.log(`Server: ${data}`);
    });

    serverProcess.stderr.on('data', (data) => {
        console.error(`Server Error: ${data}`);
    });

    serverProcess.on('error', (err) => {
        console.error('Failed to start server:', err);
    });

    serverProcess.on('close', (code) => {
        console.log(`Server exited with code ${code}`);
    });
}

function stopServer() {
    if (serverProcess) {
        console.log('Stopping server...');
        serverProcess.kill();
        serverProcess = null;
    }
}

// App ready
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

app.on('quit', () => {
    stopServer();
});

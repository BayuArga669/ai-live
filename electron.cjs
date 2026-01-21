const electron = require('electron');
const { app, BrowserWindow } = electron;
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow;
let serverProcess;

const SERVER_URL = 'http://localhost:3000';

// Check if server is ready
function checkServerReady() {
    return new Promise((resolve) => {
        http.get(SERVER_URL, (res) => {
            resolve(true);
        }).on('error', () => {
            resolve(false);
        });
    });
}

// Wait for server with retries
async function waitForServer(maxRetries = 30, interval = 500) {
    for (let i = 0; i < maxRetries; i++) {
        const ready = await checkServerReady();
        if (ready) {
            console.log('Server is ready!');
            return true;
        }
        console.log(`Waiting for server... (${i + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, interval));
    }
    return false;
}

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
        title: 'TikTok AI Dashboard',
    });

    // Show loading state
    mainWindow.loadURL(`data:text/html,
        <html>
        <body style="background:#0f0f1a;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;">
            <div style="text-align:center;color:white;">
                <h2>Loading TikTok AI...</h2>
                <p style="color:#888;">Starting server, please wait...</p>
            </div>
        </body>
        </html>
    `);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function startServer() {
    console.log('Starting server...');

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

app.on('ready', async () => {
    startServer();
    createWindow();

    // Wait for server then load the app
    const serverReady = await waitForServer();
    if (serverReady && mainWindow) {
        mainWindow.loadURL(SERVER_URL);
    } else {
        mainWindow.loadURL(`data:text/html,
            <html>
            <body style="background:#0f0f1a;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;">
                <div style="text-align:center;color:white;">
                    <h2 style="color:#ff2d55;">Server Failed to Start</h2>
                    <p style="color:#888;">Please check the console for errors and restart the application.</p>
                </div>
            </body>
            </html>
        `);
    }
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

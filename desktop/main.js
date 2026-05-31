const path = require('path')

// 确保在 Electron 环境运行（非纯 Node.js）
if (process.type !== 'browser') {
  const { spawn } = require('child_process')
  const electronPath = require('electron')
  const appDir = path.dirname(require.resolve('../desktop/package.json'))
  const child = spawn(electronPath, [appDir], {
    stdio: 'inherit',
    detached: true,
  })
  child.unref()
  console.log('正在启动 Trusted PR Reviewer 桌面应用...')
  process.exit(0)
}

const { app, BrowserWindow, dialog } = require('electron')
const { spawn } = require('child_process')
const http = require('http')

let mainWindow = null
let backendProcess = null

const BACKEND_PORT = 8000
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`

function getBackendPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'backend', 'backend.exe')
  }
  // 开发模式: 优先使用 PyInstaller 编译的 exe（更快启动）
  const exePath = path.join(__dirname, '..', 'backend', 'dist', 'backend.exe')
  try {
    if (require('fs').existsSync(exePath)) {
      return exePath
    }
  } catch (_) { /* fs 不可用 */ }
  // 回退到 Python 源码模式
  return path.join(__dirname, '..', 'backend', 'main.py')
}

function getFrontendPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'frontend', 'dist')
  }
  return path.join(__dirname, '..', 'frontend', 'dist')
}

async function startBackend() {
  const backendPath = getBackendPath()
  const isExe = backendPath.endsWith('.exe')

  const cmd = isExe ? backendPath : 'python'
  const args = isExe ? [] : [backendPath]

  backendProcess = spawn(cmd, args, {
    cwd: path.dirname(backendPath),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      FRONTEND_DIST: getFrontendPath(),
    },
  })

  backendProcess.stdout.on('data', (data) => {
    process.stdout.write(`[Backend] ${data}`)
  })
  backendProcess.stderr.on('data', (data) => {
    process.stderr.write(`[Backend] ${data}`)
  })
  backendProcess.on('error', (err) => {
    dialog.showErrorBox('启动失败', `无法启动后端服务:\n${err.message}\n\n请确认已安装 Python 3.12+`)
    app.quit()
  })

  await waitForBackend()
}

function waitForBackend(maxRetries = 30, interval = 500) {
  return new Promise((resolve, reject) => {
    let retries = 0
    const check = () => {
      http.get(`${BACKEND_URL}/api/health`, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          resolve()
        } else {
          retry()
        }
      }).on('error', () => retry())
    }
    const retry = () => {
      if (++retries >= maxRetries) {
        reject(new Error('后端启动超时，请确认 ollama 已安装并运行'))
      } else {
        setTimeout(check, interval)
      }
    }
    check()
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Trusted PR Reviewer',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.loadURL(BACKEND_URL)
  mainWindow.setMenuBarVisibility(false)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function stopBackend() {
  if (!backendProcess) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', backendProcess.pid.toString(), '/f', '/t'], {
      stdio: 'ignore',
    })
  } else {
    backendProcess.kill('SIGTERM')
  }
  backendProcess = null
}

app.whenReady().then(async () => {
  try {
    await startBackend()
    createWindow()
  } catch (err) {
    dialog.showErrorBox('启动失败', err.message)
    app.quit()
  }
})

app.on('window-all-closed', () => {
  stopBackend()
  app.quit()
})

app.on('before-quit', () => {
  stopBackend()
})

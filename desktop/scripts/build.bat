@echo off
chcp 65001 >nul
echo ========================================
echo  Trusted PR Reviewer - 一键构建脚本
echo ========================================
echo.

set "ROOT=%~dp0..\.."

REM 0. 准备虚拟环境（仅首次）
echo [0/3] 检查构建环境...
cd /d "%ROOT%"
if not exist ".venv-build\Scripts\python.exe" (
    echo 正在创建构建虚拟环境...
    python -m venv .venv-build
    call .venv-build\Scripts\activate.bat
    pip install -r backend\requirements.txt pyinstaller
) else (
    call .venv-build\Scripts\activate.bat
)
echo 构建环境就绪
echo.

REM 1. 构建前端
echo [1/3] 构建前端...
cd /d "%ROOT%\frontend"
call npm run build
if %errorlevel% neq 0 (
    echo 前端构建失败！
    exit /b 1
)

REM 2. PyInstaller 打包后端
echo [2/3] PyInstaller 打包后端...
cd /d "%ROOT%\backend"
pyinstaller --onefile --name backend --clean --noconfirm ^
    --add-data ".env.example;." ^
    --hidden-import=uvicorn.logging ^
    --hidden-import=uvicorn.loops.auto ^
    --hidden-import=uvicorn.protocols.http.auto ^
    --hidden-import=tree_sitter ^
    --hidden-import=tree_sitter_python ^
    --hidden-import=tree_sitter_javascript ^
    --hidden-import=tree_sitter_typescript ^
    --hidden-import=tree_sitter_go ^
    --hidden-import=tree_sitter_rust ^
    --hidden-import=tree_sitter_java ^
    --hidden-import=tree_sitter_c_sharp ^
    --hidden-import=tree_sitter_ruby ^
    --hidden-import=aiosqlite ^
    --hidden-import=sse_starlette ^
    main.py
if %errorlevel% neq 0 (
    echo PyInstaller 打包失败！
    exit /b 1
)

REM 3. electron-builder 打包
echo [3/3] electron-builder 打包...
cd /d "%ROOT%\desktop"
call npx electron-builder --win
if %errorlevel% neq 0 (
    echo electron-builder 打包失败！
    exit /b 1
)

echo.
echo ========================================
echo  构建完成！
echo  输出: desktop\dist\Trusted PR Reviewer Setup.exe
echo ========================================
pause

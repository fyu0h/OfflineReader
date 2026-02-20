@echo off
:: 切换代码页为 UTF-8，解决中文乱码问题
chcp 65001 >nul
setlocal enabledelayedexpansion

:: 1. 检查当前目录是否为 Git 仓库
if not exist .git (
    echo [错误] 当前目录不是一个 Git 仓库。
    pause
    exit /b
)

:: 2. 提示输入 Commit 信息
echo ========================================
set /p msg="请输入 Commit 提交内容: "

:: 如果输入为空，设置默认信息
if "!msg!"=="" (
    set msg=Update %date% %time%
)

:: 3. 执行 Git 命令
echo.
echo [1/3] 正在添加文件 (git add .)
git add .

echo [2/3] 正在提交 (git commit)
git commit -m "!msg!"

echo [3/3] 正在推送到远程仓库 (git push)
git push

echo.
echo ========================================
echo 脚本执行完毕！
pause
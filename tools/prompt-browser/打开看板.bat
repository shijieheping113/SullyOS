@echo off
cd /d "%~dp0"
title SullyOS Prompt Board
chcp 65001 >nul

set "NODE_EXE="
if exist "C:\Program Files\nodejs\node.exe" set "NODE_EXE=C:\Program Files\nodejs\node.exe"
if not defined NODE_EXE if exist "C:\Program Files (x86)\nodejs\node.exe" set "NODE_EXE=C:\Program Files (x86)\nodejs\node.exe"
if not defined NODE_EXE (
  where node >nul 2>nul
  if not errorlevel 1 set "NODE_EXE=node"
)

if not defined NODE_EXE (
  echo.
  echo Cannot open: Node.js is not installed.
  echo Tell Sully / the cat about this.
  echo.
  pause
  exit /b 1
)

"%NODE_EXE%" launch.mjs
if errorlevel 1 pause

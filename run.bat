@echo off
set PATH=C:\msys64\mingw64\bin;%PATH%
set CGO_ENABLED=1
wails dev -tags fts5

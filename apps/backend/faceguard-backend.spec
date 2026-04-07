# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for 거북이 키우기 backend."""

import sys
import os
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None

# Collect MediaPipe data files (models, etc.)
mediapipe_datas = collect_data_files('mediapipe')

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=mediapipe_datas + [
        ('turtle_ranks.json', '.'),
        ('scoring_rules.json', '.'),
        ('default_settings.json', '.'),
        ('../../config.json', '.'),
    ],
    hiddenimports=[
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'cv2',
        'mediapipe',
        'numpy',
        'pydantic',
        'sse_starlette',
        'starlette',
        'anyio',
        'anyio._backends._asyncio',
        'multipart',
        'multipart.multipart',
    ] + collect_submodules('mediapipe'),
    hookspath=[],
    hooksconfig={},
    runtime_hooks=['runtime_hook.py'],
    excludes=['matplotlib', 'matplotlib.pyplot', 'matplotlib.backends',
              'tkinter', 'PIL.ImageTk', 'IPython', 'jupyter',
              'notebook', 'scipy', 'pandas', 'sympy'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

# ── Use onedir (COLLECT) instead of onefile for faster startup ──
exe = EXE(
    pyz,
    a.scripts,
    [],            # No binaries/datas bundled in EXE itself
    exclude_binaries=True,
    name='faceguard-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='faceguard-backend',
)

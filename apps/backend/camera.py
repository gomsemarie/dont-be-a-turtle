"""Webcam management module."""

import cv2
import platform
import threading
import time
from typing import Optional


class CameraManager:
    """Manages webcam devices and frame capture."""

    # Cache camera list to avoid repeated open/close (which triggers macOS Continuity Camera alerts)
    _camera_list_cache: list[dict] = []
    _camera_list_time: float = 0.0
    _CAMERA_LIST_TTL: float = 300.0  # 5 minutes

    def __init__(self):
        self._capture: Optional[cv2.VideoCapture] = None
        self._lock = threading.Lock()
        self._current_index: int = -1

    @staticmethod
    def _get_system_camera_names() -> list[str]:
        """Get camera device names from the OS (macOS only, falls back to empty)."""
        if platform.system() != "Darwin":
            return []
        try:
            import subprocess
            result = subprocess.run(
                ["system_profiler", "SPCameraDataType", "-json"],
                capture_output=True, text=True, timeout=5,
            )
            import json
            data = json.loads(result.stdout)
            cameras = data.get("SPCameraDataType", [])
            return [cam.get("_name", "") for cam in cameras]
        except Exception:
            return []

    def list_cameras(self, max_check: int = 10, force: bool = False) -> list[dict]:
        """List available camera devices. Uses cached result unless stale or force=True."""
        now = time.time()
        if not force and self._camera_list_cache and (now - self._camera_list_time) < self._CAMERA_LIST_TTL:
            return self._camera_list_cache

        # Try to get real camera names from OS
        system_names = self._get_system_camera_names()

        cameras = []
        for i in range(max_check):
            # Skip the currently open camera — re-opening it on macOS
            # can invalidate the existing capture handle.
            if i == self._current_index and self._capture is not None:
                w = int(self._capture.get(cv2.CAP_PROP_FRAME_WIDTH))
                h = int(self._capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
                name = system_names[len(cameras)] if len(cameras) < len(system_names) else f"Camera {i}"
                cameras.append({
                    "index": i,
                    "name": name,
                    "resolution": f"{w}x{h}",
                })
                continue

            cap = cv2.VideoCapture(i)
            if cap.isOpened():
                w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                name = system_names[len(cameras)] if len(cameras) < len(system_names) else f"Camera {i}"
                cameras.append({
                    "index": i,
                    "name": name,
                    "resolution": f"{w}x{h}",
                })
                cap.release()

        CameraManager._camera_list_cache = cameras
        CameraManager._camera_list_time = now
        return cameras

    def select_camera(self, index: int) -> bool:
        """Select and open a camera by index."""
        with self._lock:
            if self._capture is not None:
                self._capture.release()

            backend = cv2.CAP_DSHOW if platform.system() == "Windows" else cv2.CAP_ANY
            cap = cv2.VideoCapture(index, backend)

            if not cap.isOpened():
                self._capture = None
                self._current_index = -1
                return False

            # Optimize capture settings
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            cap.set(cv2.CAP_PROP_FPS, 30)

            self._capture = cap
            self._current_index = index
            return True

    def read_frame(self) -> Optional[any]:
        """Read a single frame from the current camera."""
        with self._lock:
            if self._capture is None or not self._capture.isOpened():
                return None
            ret, frame = self._capture.read()
            return frame if ret else None

    @property
    def is_open(self) -> bool:
        with self._lock:
            return self._capture is not None and self._capture.isOpened()

    @property
    def current_index(self) -> int:
        return self._current_index

    def release(self):
        """Release the camera resource."""
        with self._lock:
            if self._capture is not None:
                self._capture.release()
                self._capture = None
                self._current_index = -1

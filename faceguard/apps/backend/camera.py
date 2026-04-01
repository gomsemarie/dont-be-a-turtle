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

    def list_cameras(self, max_check: int = 10, force: bool = False) -> list[dict]:
        """List available camera devices. Uses cached result unless stale or force=True."""
        now = time.time()
        if not force and self._camera_list_cache and (now - self._camera_list_time) < self._CAMERA_LIST_TTL:
            return self._camera_list_cache

        cameras = []
        for i in range(max_check):
            cap = cv2.VideoCapture(i)
            if cap.isOpened():
                w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                cameras.append({
                    "index": i,
                    "name": f"Camera {i}",
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

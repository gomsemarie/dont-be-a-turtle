"""Check mediapipe installation and report which API is available."""
import sys


def check():
    print(f"Python version: {sys.version}")

    try:
        import mediapipe as mp
        print(f"mediapipe version: {mp.__version__}")
    except ImportError:
        print("mediapipe: NOT INSTALLED")
        return "missing"

    # Check legacy solutions API
    try:
        _ = mp.solutions.face_mesh
        print("API: solutions (legacy) OK")
        return "legacy"
    except AttributeError:
        pass

    # Check tasks API
    try:
        from mediapipe.tasks.python import vision
        print("API: tasks.vision OK")
        return "tasks"
    except ImportError:
        pass

    print("ERROR: No usable API found!")
    return "broken"


if __name__ == "__main__":
    status = check()
    if status in ("legacy", "tasks"):
        print(f"\n[OK] mediapipe is ready (using {status} API)")
        sys.exit(0)
    else:
        print(f"\n[FAIL] mediapipe is not usable")
        sys.exit(1)

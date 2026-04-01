"""Runtime hook: block matplotlib import to avoid font cache build on startup."""
import sys
import types

# Create a fake matplotlib module so mediapipe's optional import doesn't trigger
# the real matplotlib (which builds a slow font cache on first run).
fake_mpl = types.ModuleType("matplotlib")
fake_mpl.__version__ = "0.0.0"
fake_mpl.__path__ = []
fake_mpl.pyplot = types.ModuleType("matplotlib.pyplot")
sys.modules["matplotlib"] = fake_mpl
sys.modules["matplotlib.pyplot"] = fake_mpl.pyplot

"""Rutas compartidas por los scripts del pipeline."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Datos crudos de Kaggle (gonzalopezgil/spotify-charts-daily-updated). No van al repo.
RAW_DIR = Path(os.environ.get("INFOVIS_RAW_DIR", ROOT / "Data"))
SONGS_CSV = RAW_DIR / "charts_songs_daily.csv"
SONGS_PARQUET = RAW_DIR / "charts_songs_daily.parquet"

# Salida liviana que consume la visualización (sí va al repo).
# Se llama "datos" porque en macOS "data" y "Data" son la misma carpeta.
WEB_DATA_DIR = ROOT / "datos"

# Umbral de "llegada": una canción llegó a un país el primer día que entra a su Top N.
ARRIVAL_TOP_N = 50

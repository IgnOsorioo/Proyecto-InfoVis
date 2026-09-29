"""Convierte charts_songs_daily.csv (11 GB) a Parquet con solo las columnas útiles.

Uso: python scripts/01_csv_a_parquet.py
Tarda unos minutos; se corre una vez por cada descarga nueva de Kaggle.
"""
import time

import duckdb

from config import SONGS_CSV, SONGS_PARQUET

t0 = time.time()
con = duckdb.connect()
con.execute(f"""
    COPY (
        SELECT
            CAST(date AS DATE)                     AS date,
            country,
            CAST(rank AS SMALLINT)                 AS rank,
            replace(uri, 'spotify:track:', '')     AS track_id,
            track_name,
            artist_names,
            CAST(streams AS BIGINT)                AS streams,
            TRY_CAST(release_date AS DATE)         AS release_date
        FROM read_csv('{SONGS_CSV}', header = true, all_varchar = true)
    ) TO '{SONGS_PARQUET}' (FORMAT parquet, COMPRESSION zstd)
""")
n = con.execute(f"SELECT count(*) FROM '{SONGS_PARQUET}'").fetchone()[0]
print(f"{n:,} filas -> {SONGS_PARQUET.name} "
      f"({SONGS_PARQUET.stat().st_size / 1e9:.2f} GB) en {time.time() - t0:.0f}s")

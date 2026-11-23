/* Acceso a los datos de la V4 de la E2 (datos/e2/decadas.js, de scripts/16_albumes_e2.py).

   Para cada país y década: las ventas de álbumes de cada género (unidades certificadas en el país, según las tablas
   de certificaciones de Wikipedia y las listas de álbumes más vendidos de Wikipedia y BestSellingAlbums.org), qué
   parte del total fue de cada género (género según Deezer) y los cinco álbumes más vendidos de cada género (con su
   portada y la canción más popular en Deezer). Sin sencillos ni recopilaciones de grandes éxitos.
   R3: el profesor pidió pocas posiciones por perilla, grabadas en la caja: seis países y seis décadas.
   21-nov: Canadá reemplaza a Argentina, que no tenía datos de 2010 en adelante (los seis países, completos).

   Los países van en el dial de oeste a este. Las décadas con muy pocos álbumes con ventas conocidas no tienen datos:
   el disco se detiene y suena la estática. */

const Datos = (() => {
  const D = window.DECADAS;
  const DIAL = ['us', 'ca', 'gb', 'de', 'se', 'jp'];
  const NOMBRES = { us: 'EE. UU.', ca: 'Canadá', gb: 'Reino Unido', de: 'Alemania', se: 'Suecia', jp: 'Japón' };
  const GENEROS = { rock: 'Rock', pop: 'Pop', hiphop: 'Hip hop', electronica: 'Electrónica' };

  const paises = DIAL.map(cc => ({ cc, nombre: NOMBRES[cc] }));
  const decadas = D.decadas.map(d => {
    const corto = d < 2000 ? String(d).slice(2) : String(d);      // «70», «2000»: «en los 70»
    return { d, corto, nombre: `Años ${corto}` };
  });

  /** → { cuota (0–1), ventas, albumes (cuántos álbumes con ventas tiene el país en la década, de todos los géneros),
         top: [{album, artista, unidades, anio, portada, deezer, cancion, preview}], sinDatos }
      top = de TODOS los álbumes con ventas registradas en el país y la década, los del género, de más a menos ventas
      (los 5 primeros). */
  function lectura(cc, iDecada, familia) {
    const x = D.datos[cc]?.[String(D.decadas[iDecada])];
    if (!x || x.sin_datos) return { sinDatos: true, cuota: 0, top: [] };
    const top = (x.top[familia] || []).map(([album, artista, unidades, anio, portada, deezer, cancion, preview]) => ({
      idx: `${cc}-${album}-${artista}`, album, artista, unidades, anio, portada, deezer, cancion, preview,
      titulo: cancion || album, artistas: artista,    // lo que usa el reproductor para buscar el preview
    }));
    return {
      sinDatos: false,
      cuota: familia ? (x.cuota[familia] || 0) / 100 : 0,
      ventas: familia ? x.ventas[familia] : x.total,
      albumes: x.albumes,
      top,
    };
  }

  /** 27 000 000 → «27 millones»; 450 000 → «450 mil». */
  function copias(n) {
    if (n >= 1e6) {
      const m = (n / 1e6).toLocaleString('es-CL', { maximumFractionDigits: n >= 1e7 ? 0 : 1 });
      return m === '1' ? '1 millón' : `${m} millones`;
    }
    return `${Math.round(n / 1e3).toLocaleString('es-CL')} mil`;
  }

  /** Con el sustantivo: «2,2 millones de copias», «1 millón de copias», pero «250 mil copias» (no «250 mil de»). */
  const copiasTexto = n => `${copias(n)}${n >= 1e6 ? ' de' : ''} copias`;

  return { paises, decadas, lectura, copias, copiasTexto, nombreGenero: f => GENEROS[f] || f };
})();

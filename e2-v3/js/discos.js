/* Los discos del tocadiscos (E2, V3): un color por familia de géneros. El sensor RGB del Arduino informa el color
   que ve ("C:rojo") y la página elige el disco con ese id. En la V3 los discos son las caras de un cubo Rubik:
   el cubo no tiene morado, así que el hip hop es la cara blanca; en la V4, con discos pintados, vuelve el morado.

   - id: lo que viaja entre las páginas. nombre: lo que se lee. muestra: el color de referencia en pantalla.
   - familia: la familia de datos/e2/top200/ (scripts/15_top200_e2.py) que representa el disco. Cinco son géneros;
     "local" (verde) es la música de artistas del país que está en la perilla, sea del género que sea. */

const DISCOS = [
  { id: 'azul', nombre: 'Azul', muestra: '#1e88e5', familia: 'pop' },
  { id: 'blanco', nombre: 'Blanco', muestra: '#eeeeee', familia: 'hiphop' },
  { id: 'amarillo', nombre: 'Amarillo', muestra: '#fdd835', familia: 'latino' },
  { id: 'rojo', nombre: 'Rojo', muestra: '#e53935', familia: 'rock' },
  { id: 'naranjo', nombre: 'Naranjo', muestra: '#fb8c00', familia: 'electro' },
  { id: 'verde', nombre: 'Verde', muestra: '#43a047', familia: 'local' },
];

const discoPorId = id => DISCOS.find(d => d.id === id) || null;
const discoPorFamilia = familia => DISCOS.find(d => d.familia === familia) || null;

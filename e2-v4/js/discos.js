/* Los discos del tocadiscos (E2, V4): cuatro CD pintados, uno por género. El sensor RGB del Arduino informa el color
   que ve ("C:rojo") y la página elige el disco con ese id; un color sin disco no cambia nada.
   V4: los discos de la caja son rojo, azul, negro y verde (calibrados el 22-nov; ver NOTAS-E2.md y tocadiscos.ino).

   - id: el color que manda el Arduino. nombre: lo que se lee. muestra: el color del disco en pantalla.
   - acento: el color de los bordes y textos del disco elegido, si la muestra no se ve sobre el fondo negro.
   - familia: la familia de datos/e2/decadas.js (scripts/16_albumes_e2.py). */

const DISCOS = [
  { id: 'rojo', nombre: 'Rojo', muestra: '#e53935', familia: 'rock' },
  { id: 'azul', nombre: 'Azul', muestra: '#1e88e5', familia: 'pop' },
  { id: 'negro', nombre: 'Negro', muestra: '#111111', acento: '#d6d6d6', familia: 'hiphop' },
  { id: 'verde', nombre: 'Verde', muestra: '#43a047', familia: 'electronica' },
];

const discoPorId = id => DISCOS.find(d => d.id === id) || null;
const discoPorFamilia = familia => DISCOS.find(d => d.familia === familia) || null;

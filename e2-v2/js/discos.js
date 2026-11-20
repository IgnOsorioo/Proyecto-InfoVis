/* Los discos del tocadiscos (E2, V2). Cada CD lleva pegado debajo un anillo de cartulina mate de un solo color, que
   el celular reconoce desde dentro de la caja (lector.html). Lo comparten el lector y la página del tocadiscos.

   - id: lo que viaja entre las páginas. nombre: lo que se lee. muestra: el color de referencia en pantalla (el que
     reconoce el lector sale de la calibración, con la luz de la caja).
   - Pendiente: asignar un género a cada color cuando estén los datos de género. */

const DISCOS = [
  { id: 'rojo', nombre: 'Rojo', muestra: '#e53935' },
  { id: 'azul', nombre: 'Azul', muestra: '#1e88e5' },
  { id: 'amarillo', nombre: 'Amarillo', muestra: '#fdd835' },
  { id: 'verde', nombre: 'Verde', muestra: '#43a047' },
  { id: 'morado', nombre: 'Morado', muestra: '#8e24aa' },
];

const discoPorId = id => DISCOS.find(d => d.id === id) || null;

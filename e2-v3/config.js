// Protobject (E2, V2): la página del tocadiscos es la principal; el celular abre el lector escaneando el QR del
// botón «+». Con setProduction(true) cada apertura tiene su propio identificador (?ptjuid=…), así que dos personas
// pueden usar la página publicada a la vez sin cruzarse.
Protobject.setProduction(true);
Protobject.initialize([
  { name: 'Tocadiscos', page: 'index.html', main: true },
  { name: 'Lector de discos (celular)', page: 'lector.html' },
]);

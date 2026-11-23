// Tocadiscos del mundo — Entrega 2, IIC2026 (V4)
// El CD gira según la cuota del género elegido en lo que se escuchó en el país y año de las perillas.
// El género se elige poniendo en el eje el CD pintado del género: el sensor RGB, bajo el disco, lee su color.
//
// Protocolo por USB (115200 baudios, una orden por línea):
//   V:0.37   velocidad entre 0 y 1 (la cuota del género). 0 = detenido.
//   S        detener
//   ?        responde el estado actual (SENSOR, BASE = brillo al encender, NADA = color de «sin disco»)
//   R        activa o desactiva el diagnóstico: RAW:claro,rojo,verde,azul (sensor), BOTON:0/1 (cada cambio
//            eléctrico del botón, antes del antirrebote) y POTES:país,década crudos (antes del filtro)
// Mensajes que envía el Arduino:
//   P:512,T:300   lectura de los potenciómetros país y tiempo (0–1023), solo al cambiar
//   BOTON         se apretó el botón (22-nov: la pausa la decide solo la página, que manda V:0 en pausa;
//                 antes el Arduino llevaba su propia pausa y se desincronizaba con la de la pantalla)
//   C:rojo        color del disco que ve el sensor (rojo, azul, negro, verde); C:- = sin disco.
//                 Se envía al cambiar y se repite cada 2 s, para que la página sepa que el sensor está vivo.
// Si no llega ninguna orden en TIEMPO_SIN_ORDEN_MS, el disco se detiene solo
// (por ejemplo, si se cierra la página).
//
// Conexiones (la mini protoboard reparte 5V y GND):
//   Protoboard: primera línea de 5 agujeros (izquierda) = 5V, última (derecha) = GND
//   Servo: rojo → línea 5V, marrón → línea GND, naranjo → ~9
//   Potenciómetro en A0: país (22-nov, noche: con A1 el dial del país movía la década en la caja armada)
//   Potenciómetro en A1: década
//   (patas de los extremos a 5V y GND, centro al pin)
//   Botón: dos patas en diagonal, una → pin 7, la otra → línea GND
//   Sensor TCS34725: VIN → línea 5V, GND → GND, SDA → agujero SDA, SCL → agujero SCL (los dos junto a AREF;
//   son los mismos pines 2 y 3, pero el agujero del pin 2 de esta placa hace mal contacto). LED e INT sin conectar.

#include <Servo.h>
#include <Wire.h>

// ---------- Servo ----------
const int PIN_SERVO = 9;
const int STOP_US = 1500;      // punto de reposo; ajustar si gira estando en 0
const int MIN_OFFSET = 40;     // velocidad mínima visible (alcance > 0): un hit local apenas gira
const int MAX_OFFSET = 1000;   // velocidad máxima (alcance = 1)
const int PASO_RAMPA = 15;     // µs por ciclo: el disco acelera y frena suave
const unsigned long TIEMPO_SIN_ORDEN_MS = 3000;

// ---------- Potenciómetros ----------
const bool HAY_POTES = true;   // false si los potenciómetros no están conectados
const int PIN_POTE_PAIS = A0;
const int PIN_POTE_TIEMPO = A1;
const int UMBRAL_POTE = 5;     // ignora variaciones menores (ruido)
const int MUESTRAS_POTE = 16;  // por lectura: se ordenan y se promedian las 8 del medio (sin extremos)
// Saltos (22-nov): los WH148 pierden contacto un instante y la lectura salta lejos y vuelve. Un salto de más de
// SALTO_POTE se acepta solo si se repite en CONFIRMAR_SALTO lecturas seguidas (girar rápido sí lo cumple; un
// chispazo no). Lo demás se suaviza: cada lectura acerca el valor SUAVIZADO del camino (~0,1 s).
const int SALTO_POTE = 120;
const int CONFIRMAR_SALTO = 3;
const float SUAVIZADO = 0.35;
struct Pote { float valor; int pendiente; byte cuenta; };
Pote potePais = {-1, -1, 0}, poteTiempo = {-1, -1, 0};

// ---------- Botón de pausa (para cambiar el disco) ----------
const int PIN_BOTON = 7;       // INPUT_PULLUP: suelto = HIGH, apretado = LOW
const unsigned long REBOTE_MS = 40;

// ---------- Sensor de color (TCS34725) ----------
// Calibración con los discos de la V4 en el eje (22-nov, caja de MDF armada, discos quietos): proporción de rojo,
// verde y azul sobre el total (no cambia con la distancia) y el brillo total (claro) típico de cada disco.
//   sin disco 835 · .22 .38 .35     rojo 450–510 · .74 .21 .19     azul 805 · .21 .35 .46
//   verde 236–292 · .32 .44 .27     negro 161 · .49 .32 .24        mano tapando ~45
// «Sin disco» es lo MÁS brillante (el sensor ve la luz de la sala por el hueco), así que ya no se decide por
// brillo: es una referencia de color más, que además se vuelve a medir al encender (otra sala, otra luz).
// El brillo solo descarta lecturas imposibles: cada disco se acepta entre la mitad y el doble de su brillo
// típico (una mano que tapa el sensor no pasa por el disco negro).
struct Referencia { const char *nombre; float r, g, b; unsigned int brillo; };
const Referencia COLORES[] = {
  {"rojo",  0.74, 0.21, 0.19, 490},   // rock
  {"azul",  0.21, 0.35, 0.46, 805},   // pop
  {"negro", 0.49, 0.32, 0.24, 161},   // hip hop
  {"verde", 0.32, 0.44, 0.27, 260},   // electrónica
};
const int N_COLORES = sizeof(COLORES) / sizeof(COLORES[0]);
float nadaR = 0.22, nadaG = 0.38, nadaB = 0.35;   // sin disco (se reemplaza por lo medido al encender)
const float DISTANCIA_MAX = 0.06;      // los colores están a ≥ 0,11 entre sí; más lejos que esto: dudoso (al poner o sacar)
const unsigned int BRILLO_NADA_MIN = 300;   // sin disco se ve la sala: más oscuro que esto no es «sin disco»
const int LECTURAS_COLOR = 3;          // lecturas iguales seguidas para aceptar un color (~0,3 s)
const int LECTURAS_NADA = 10;          // y para aceptar que no hay disco (~1 s)
const unsigned long REPETIR_COLOR_MS = 2000;
const unsigned long CADA_LECTURA_MS = 110;   // el sensor integra 101 ms: no se relee la misma medición
unsigned long ultimaLectura = 0;
const byte SENSOR = 0x29;
bool haySensor = false;
unsigned int brilloBase = 0;           // brillo sin nada delante, medido al encender
int colorActual = -2;                  // -2 = aún no se informa; -1 = nada; 0.. = índice en COLORES
int candidato = -2, repeticiones = 0;
unsigned long ultimoColor = 0;
bool crudo = false;                    // orden R: imprime cada lectura del sensor

Servo motor;
float alcance = 0;
int pulsoActual = STOP_US;
int pulsoObjetivo = STOP_US;
unsigned long ultimaOrden = 0;
int ultimoPais = -100, ultimoTiempo = -100;
String linea;
int estadoBoton = HIGH, lecturaPrevia = HIGH;
unsigned long cambioBoton = 0;

int pulsoDeAlcance(float a) {
  if (a <= 0) return STOP_US;
  if (a > 1) a = 1;
  return STOP_US + MIN_OFFSET + (int)(a * (MAX_OFFSET - MIN_OFFSET));
}

void fijarAlcance(float a) {
  alcance = constrain(a, 0, 1);
  pulsoObjetivo = pulsoDeAlcance(alcance);
}

void procesar(String orden) {
  orden.trim();
  if (orden.length() == 0) return;
  ultimaOrden = millis();
  if (orden.startsWith("V:")) {
    fijarAlcance(orden.substring(2).toFloat());
  } else if (orden == "S") {
    fijarAlcance(0);
  } else if (orden == "?") {
    Serial.println(haySensor ? "SENSOR:1" : "SENSOR:0");
    Serial.print("BASE:"); Serial.println(brilloBase);
    Serial.print("NADA:"); Serial.print(nadaR, 2); Serial.print(','); Serial.print(nadaG, 2); Serial.print(',');
    Serial.println(nadaB, 2);
  } else if (orden == "R") {
    crudo = !crudo;
    return;
  } else {
    Serial.println("ERR orden desconocida");
    return;
  }
  Serial.print("OK V:");
  Serial.print(alcance, 2);
  Serial.print(" us:");
  Serial.println(pulsoObjetivo);
}

// Promedio recortado: se ordenan las muestras y se promedia la mitad del medio.
int leerRecortado(int pin) {
  int m[MUESTRAS_POTE];
  for (int i = 0; i < MUESTRAS_POTE; i++) {
    int v = analogRead(pin), j = i;
    while (j > 0 && m[j - 1] > v) { m[j] = m[j - 1]; j--; }
    m[j] = v;
  }
  long suma = 0;
  for (int i = MUESTRAS_POTE / 4; i < 3 * MUESTRAS_POTE / 4; i++) suma += m[i];
  return suma / (MUESTRAS_POTE / 2);
}

int filtrar(Pote &p, int v) {
  if (p.valor < 0) { p.valor = v; return v; }
  if (abs(v - (int)p.valor) > SALTO_POTE) {
    if (p.pendiente >= 0 && abs(v - p.pendiente) <= SALTO_POTE / 2) {
      if (++p.cuenta >= CONFIRMAR_SALTO) { p.valor = v; p.pendiente = -1; p.cuenta = 0; }
    } else {
      p.pendiente = v; p.cuenta = 1;
    }
    return (int)(p.valor + 0.5);
  }
  p.pendiente = -1; p.cuenta = 0;
  p.valor += SUAVIZADO * (v - p.valor);
  return (int)(p.valor + 0.5);
}

int ultimoCrudoPais = -100, ultimoCrudoTiempo = -100;

void leerPotes() {
  int crudoPais = leerRecortado(PIN_POTE_PAIS);
  int crudoTiempo = leerRecortado(PIN_POTE_TIEMPO);
  if (crudo && (abs(crudoPais - ultimoCrudoPais) > 2 || abs(crudoTiempo - ultimoCrudoTiempo) > 2)) {
    ultimoCrudoPais = crudoPais; ultimoCrudoTiempo = crudoTiempo;
    Serial.print("POTES:"); Serial.print(crudoPais); Serial.print(','); Serial.println(crudoTiempo);
  }
  int pais = filtrar(potePais, crudoPais);
  int tiempo = filtrar(poteTiempo, crudoTiempo);
  if (abs(pais - ultimoPais) < UMBRAL_POTE && abs(tiempo - ultimoTiempo) < UMBRAL_POTE) return;
  ultimoPais = pais;
  ultimoTiempo = tiempo;
  Serial.print("P:");
  Serial.print(pais);
  Serial.print(",T:");
  Serial.println(tiempo);
}

// Cada apretón avisa a la página, que alterna la pausa (detiene el disco para cambiarlo y lo reanuda).
void leerBoton() {
  int lectura = digitalRead(PIN_BOTON);
  if (lectura != lecturaPrevia) {
    if (crudo) { Serial.print("BOTON:"); Serial.println(lectura); }
    cambioBoton = millis();
    lecturaPrevia = lectura;
  }
  if (millis() - cambioBoton < REBOTE_MS || lectura == estadoBoton) return;
  estadoBoton = lectura;
  if (estadoBoton == LOW) {
    Serial.println("BOTON");
  }
}

// ---------- Sensor ----------
float distancia(float r1, float g1, float b1, float r2, float g2, float b2) {
  return sqrt(sq(r1 - r2) + sq(g1 - g2) + sq(b1 - b2));
}

bool escribirSensor(byte reg, byte valor) {
  Wire.beginTransmission(SENSOR);
  Wire.write(0x80 | reg);
  Wire.write(valor);
  return Wire.endTransmission() == 0;
}

int leerRegistro(byte reg) {
  Wire.beginTransmission(SENSOR);
  Wire.write(0x80 | reg);
  if (Wire.endTransmission() != 0 || Wire.requestFrom(SENSOR, (byte)1) != 1) return -1;
  return Wire.read();
}

// Lee claro, rojo, verde y azul si hay una medición nueva lista (cada ~100 ms). No bloquea.
bool leerSensor(unsigned int &c, unsigned int &r, unsigned int &g, unsigned int &b) {
  int estado = leerRegistro(0x13);
  if (estado < 0 || !(estado & 0x01)) return false;
  Wire.beginTransmission(SENSOR);
  Wire.write(0x80 | 0x20 | 0x14);
  if (Wire.endTransmission() != 0 || Wire.requestFrom(SENSOR, (byte)8) != 8) return false;
  unsigned int v[4];
  for (int i = 0; i < 4; i++) { byte lo = Wire.read(); byte hi = Wire.read(); v[i] = (hi << 8) | lo; }
  c = v[0]; r = v[1]; g = v[2]; b = v[3];
  return true;
}

void iniciarSensor() {
  Wire.begin();
  Wire.setWireTimeout(3000, true);     // si se suelta un cable, el tocadiscos sigue funcionando
  int id = leerRegistro(0x12);
  haySensor = (id == 0x44 || id == 0x4D)
           && escribirSensor(0x01, 0xD5)   // 101 ms de integración
           && escribirSensor(0x0F, 0x01)   // ganancia 4x
           && escribirSensor(0x00, 0x01);
  if (!haySensor) return;
  delay(3);
  escribirSensor(0x00, 0x03);              // encendido + medición
  // Color de «sin disco» en esta sala: si al encender el sensor ve algo claro que no es ningún disco, esa es la luz
  // de la sala por el hueco. Si ya había un disco puesto, se queda la referencia calibrada.
  unsigned int c, r, g, b;
  unsigned long sc = 0, sr = 0, sg = 0, sb = 0;
  unsigned long t = millis();
  while (millis() - t < 450) if (leerSensor(c, r, g, b)) { sc += c; sr += r; sg += g; sb += b; brilloBase = max(brilloBase, c); }
  if (sc == 0 || brilloBase < BRILLO_NADA_MIN) return;
  float fr = (float)sr / sc, fg = (float)sg / sc, fb = (float)sb / sc;
  for (int i = 0; i < N_COLORES; i++)
    if (distancia(fr, fg, fb, COLORES[i].r, COLORES[i].g, COLORES[i].b) < 2 * DISTANCIA_MAX) return;
  nadaR = fr; nadaG = fg; nadaB = fb;
}

// Índice del disco más parecido, -1 si no hay disco, -3 si es dudoso (poniendo o sacando el disco, una mano).
int clasificar(unsigned int c, unsigned int r, unsigned int g, unsigned int b) {
  if (c == 0) return -3;
  float fr = (float)r / c, fg = (float)g / c, fb = (float)b / c;
  int mejor = -3;
  float dMejor = DISTANCIA_MAX;
  if (c >= BRILLO_NADA_MIN) {
    float d = distancia(fr, fg, fb, nadaR, nadaG, nadaB);
    if (d < dMejor) { dMejor = d; mejor = -1; }
  }
  for (int i = 0; i < N_COLORES; i++) {
    if (c < COLORES[i].brillo / 2 || c > 2UL * COLORES[i].brillo) continue;
    float d = distancia(fr, fg, fb, COLORES[i].r, COLORES[i].g, COLORES[i].b);
    if (d < dMejor) { dMejor = d; mejor = i; }
  }
  return mejor;
}

void informarColor() {
  Serial.print("C:");
  Serial.println(colorActual < 0 ? "-" : COLORES[colorActual].nombre);
  ultimoColor = millis();
}

void leerColor() {
  unsigned int c, r, g, b;
  if (!haySensor || millis() - ultimaLectura < CADA_LECTURA_MS || !leerSensor(c, r, g, b)) {
    if (colorActual != -2 && millis() - ultimoColor > REPETIR_COLOR_MS) informarColor();
    return;
  }
  ultimaLectura = millis();
  int visto = clasificar(c, r, g, b);
  if (crudo) {
    Serial.print("RAW:"); Serial.print(c); Serial.print(','); Serial.print(r); Serial.print(',');
    Serial.print(g); Serial.print(','); Serial.print(b); Serial.print(" -> ");
    Serial.println(visto == -1 ? "nada" : visto == -3 ? "dudoso" : COLORES[visto].nombre);
  }
  if (visto == -3) return;                 // dudoso: no cambia nada
  if (visto == candidato) repeticiones++;
  else { candidato = visto; repeticiones = 1; }
  int necesarias = visto == -1 ? LECTURAS_NADA : LECTURAS_COLOR;
  if (repeticiones >= necesarias && visto != colorActual) {
    colorActual = visto;
    informarColor();
  } else if (colorActual != -2 && millis() - ultimoColor > REPETIR_COLOR_MS) {
    informarColor();
  }
}

void setup() {
  Serial.begin(115200);
  motor.attach(PIN_SERVO, 500, 2500);
  motor.writeMicroseconds(STOP_US);
  pinMode(PIN_BOTON, INPUT_PULLUP);
  iniciarSensor();
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') {
      procesar(linea);
      linea = "";
    } else if (linea.length() < 32) {
      linea += c;
    }
  }

  if (alcance > 0 && millis() - ultimaOrden > TIEMPO_SIN_ORDEN_MS) fijarAlcance(0);

  if (pulsoActual < pulsoObjetivo) pulsoActual = min(pulsoActual + PASO_RAMPA, pulsoObjetivo);
  else if (pulsoActual > pulsoObjetivo) pulsoActual = max(pulsoActual - PASO_RAMPA, pulsoObjetivo);
  motor.writeMicroseconds(pulsoActual);

  leerBoton();
  if (HAY_POTES) leerPotes();
  leerColor();
  delay(20);
}

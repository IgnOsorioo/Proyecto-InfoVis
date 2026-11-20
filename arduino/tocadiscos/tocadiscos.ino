// Tocadiscos del mundo — Entrega 2, IIC2026 (V3)
// El CD gira según la cuota del género elegido en lo que se escuchó en el país y año de las perillas.
// El género se elige mostrándole un color al sensor RGB (en la V3, una cara de un cubo Rubik).
//
// Protocolo por USB (115200 baudios, una orden por línea):
//   V:0.37   velocidad entre 0 y 1 (la cuota del género). 0 = detenido.
//   S        detener
//   ?        responde el estado actual
// Mensajes que envía el Arduino:
//   P:512,T:300   lectura de los potenciómetros país y tiempo (0–1023), solo al cambiar
//   PAUSA:1 / PAUSA:0   el botón detuvo o reanudó el disco
//   C:rojo        color que ve el sensor (blanco, amarillo, naranjo, rojo, verde, azul); C:- = nada delante.
//                 Se envía al cambiar y se repite cada 2 s, para que la página sepa que el sensor está vivo.
// Si no llega ninguna orden en TIEMPO_SIN_ORDEN_MS, el disco se detiene solo
// (por ejemplo, si se cierra la página).
//
// Conexiones (la mini protoboard reparte 5V y GND):
//   Protoboard: primera línea de 5 agujeros (izquierda) = 5V, última (derecha) = GND
//   Servo: rojo → línea 5V, marrón → línea GND, naranjo → ~9
//   Potenciómetro país:   patas de los extremos a 5V y GND, centro → A0
//   Potenciómetro tiempo: patas de los extremos a 5V y GND, centro → A1
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
const int UMBRAL_POTE = 4;     // ignora variaciones menores (ruido)
const int MUESTRAS_POTE = 16;  // se promedian lecturas para que la perilla no tiemble

// ---------- Botón de pausa (para cambiar el disco) ----------
const int PIN_BOTON = 7;       // INPUT_PULLUP: suelto = HIGH, apretado = LOW
const unsigned long REBOTE_MS = 40;

// ---------- Sensor de color (TCS34725) ----------
// Referencias medidas con el cubo Rubik a ~1 cm (18-nov): proporción de rojo, verde y azul sobre el total.
// La proporción no cambia con la distancia, solo el brillo. Recalibrar con arduino/prueba_sensor al cambiar
// los objetos (discos pintados en la V4; el morado todavía no está medido).
struct Referencia { const char *nombre; float r, g, b; };
const Referencia COLORES[] = {
  {"blanco",   0.42, 0.35, 0.24},
  {"amarillo", 0.46, 0.40, 0.14},
  {"naranjo",  0.68, 0.21, 0.14},
  {"rojo",     0.71, 0.18, 0.17},
  {"verde",    0.32, 0.48, 0.19},
  {"azul",     0.23, 0.41, 0.35},
};
const int N_COLORES = sizeof(COLORES) / sizeof(COLORES[0]);
const float DISTANCIA_MAX = 0.07;      // más lejos de toda referencia: color dudoso (un borde, dos caras), se ignora
const int LECTURAS_COLOR = 3;          // lecturas iguales seguidas para aceptar un color (~0,3 s)
const int LECTURAS_NADA = 10;          // y para aceptar que no hay nada (~1 s): girar el cubo no detiene el disco
const unsigned long REPETIR_COLOR_MS = 2000;
const byte SENSOR = 0x29;
bool haySensor = false;
unsigned int brilloBase = 0;           // brillo sin nada delante, medido al encender
int colorActual = -2;                  // -2 = aún no se informa; -1 = nada; 0.. = índice en COLORES
int candidato = -2, repeticiones = 0;
unsigned long ultimoColor = 0;

Servo motor;
float alcance = 0;
int pulsoActual = STOP_US;
int pulsoObjetivo = STOP_US;
unsigned long ultimaOrden = 0;
int ultimoPais = -100, ultimoTiempo = -100;
String linea;
bool pausa = false;
int estadoBoton = HIGH, lecturaPrevia = HIGH;
unsigned long cambioBoton = 0;

int pulsoDeAlcance(float a) {
  if (a <= 0 || pausa) return STOP_US;
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
  } else {
    Serial.println("ERR orden desconocida");
    return;
  }
  Serial.print("OK V:");
  Serial.print(alcance, 2);
  Serial.print(" us:");
  Serial.println(pulsoObjetivo);
}

int leerPromedio(int pin) {
  long suma = 0;
  for (int i = 0; i < MUESTRAS_POTE; i++) suma += analogRead(pin);
  return suma / MUESTRAS_POTE;
}

void leerPotes() {
  int pais = leerPromedio(PIN_POTE_PAIS);
  int tiempo = leerPromedio(PIN_POTE_TIEMPO);
  if (abs(pais - ultimoPais) < UMBRAL_POTE && abs(tiempo - ultimoTiempo) < UMBRAL_POTE) return;
  ultimoPais = pais;
  ultimoTiempo = tiempo;
  Serial.print("P:");
  Serial.print(pais);
  Serial.print(",T:");
  Serial.println(tiempo);
}

// Cada apretón alterna la pausa: detiene el disco para cambiarlo y lo reanuda.
void leerBoton() {
  int lectura = digitalRead(PIN_BOTON);
  if (lectura != lecturaPrevia) {
    cambioBoton = millis();
    lecturaPrevia = lectura;
  }
  if (millis() - cambioBoton < REBOTE_MS || lectura == estadoBoton) return;
  estadoBoton = lectura;
  if (estadoBoton == LOW) {
    pausa = !pausa;
    pulsoObjetivo = pulsoDeAlcance(alcance);
    Serial.println(pausa ? "PAUSA:1" : "PAUSA:0");
  }
}

// ---------- Sensor ----------
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
  unsigned int c, r, g, b;
  unsigned long t = millis();
  while (millis() - t < 400) if (leerSensor(c, r, g, b)) brilloBase = max(brilloBase, c);
}

// Índice del color más parecido, -1 si no hay nada delante, -3 si es dudoso.
int clasificar(unsigned int c, unsigned int r, unsigned int g, unsigned int b) {
  unsigned int umbral = max(700u, 2 * brilloBase);
  if (c < umbral || c == 0) return -1;
  float fr = (float)r / c, fg = (float)g / c, fb = (float)b / c;
  int mejor = -3;
  float dMejor = DISTANCIA_MAX;
  for (int i = 0; i < N_COLORES; i++) {
    float d = sqrt(sq(fr - COLORES[i].r) + sq(fg - COLORES[i].g) + sq(fb - COLORES[i].b));
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
  if (!haySensor || !leerSensor(c, r, g, b)) {
    if (colorActual != -2 && millis() - ultimoColor > REPETIR_COLOR_MS) informarColor();
    return;
  }
  int visto = clasificar(c, r, g, b);
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

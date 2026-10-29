// Tocadiscos del mundo — Entrega 2, IIC2026
// El CD gira más rápido mientras más países tienen de #1 la canción que suena.
//
// Protocolo por USB (115200 baudios, una orden por línea):
//   V:0.37   alcance entre 0 y 1 (países donde es #1 / 52). 0 = detenido.
//   S        detener
//   ?        responde el estado actual
// Si no llega ninguna orden en TIEMPO_SIN_ORDEN_MS, el disco se detiene solo
// (por ejemplo, si se cierra la página).
//
// Conexiones:
//   Servo: rojo → 5V, marrón → GND, naranjo → ~9
//   Potenciómetros (cuando lleguen): país en A0 (alimentado por pin 2),
//   tiempo en A1 (alimentado por pin 4). Activar con HAY_POTES = true.

#include <Servo.h>

// ---------- Servo ----------
const int PIN_SERVO = 9;
const int STOP_US = 1500;      // punto de reposo; ajustar si gira estando en 0
const int MIN_OFFSET = 40;     // velocidad mínima visible (alcance > 0): un hit local apenas gira
const int MAX_OFFSET = 1000;   // velocidad máxima (alcance = 1)
const int PASO_RAMPA = 15;     // µs por ciclo: el disco acelera y frena suave
const unsigned long TIEMPO_SIN_ORDEN_MS = 3000;

// ---------- Potenciómetros ----------
const bool HAY_POTES = false;
const int PIN_POTE_PAIS = A0;
const int PIN_POTE_TIEMPO = A1;
const int PIN_5V_PAIS = 2;
const int PIN_5V_TIEMPO = 4;
const int UMBRAL_POTE = 6;     // ignora variaciones menores (ruido)

Servo motor;
float alcance = 0;
int pulsoActual = STOP_US;
int pulsoObjetivo = STOP_US;
unsigned long ultimaOrden = 0;
int ultimoPais = -100, ultimoTiempo = -100;
String linea;

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
  } else if (orden != "?") {
    Serial.println("ERR orden desconocida");
    return;
  }
  Serial.print("OK V:");
  Serial.print(alcance, 2);
  Serial.print(" us:");
  Serial.println(pulsoObjetivo);
}

void leerPotes() {
  int pais = analogRead(PIN_POTE_PAIS);
  int tiempo = analogRead(PIN_POTE_TIEMPO);
  if (abs(pais - ultimoPais) < UMBRAL_POTE && abs(tiempo - ultimoTiempo) < UMBRAL_POTE) return;
  ultimoPais = pais;
  ultimoTiempo = tiempo;
  Serial.print("P:");
  Serial.print(pais);
  Serial.print(",T:");
  Serial.println(tiempo);
}

void setup() {
  Serial.begin(115200);
  motor.attach(PIN_SERVO, 500, 2500);
  motor.writeMicroseconds(STOP_US);
  if (HAY_POTES) {
    pinMode(PIN_5V_PAIS, OUTPUT);
    digitalWrite(PIN_5V_PAIS, HIGH);
    pinMode(PIN_5V_TIEMPO, OUTPUT);
    digitalWrite(PIN_5V_TIEMPO, HIGH);
  }
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

  if (HAY_POTES) leerPotes();
  delay(20);
}

// Prueba del sensor de color TCS34725 — Entrega 2, IIC2026
// Sketch solo de diagnóstico: no mueve el servo ni lee las perillas.
// Revisa en orden: (1) que el bus I2C no esté en corto, (2) que el sensor
// responda en la dirección 0x29, (3) su número de identidad y (4) que las
// lecturas de color cambien al acercar objetos de distinto color.
//
// Conexiones en el Leonardo (con el USB DESCONECTADO mientras se cablea):
//   VIN → 5V      GND → GND      SDA → pin 2 (SDA)      SCL → pin 3 (SCL)
//   LED e INT quedan sin conectar (el LED blanco queda encendido).
// Monitor serie a 115200 baudios.

#include <Wire.h>

const byte DIRECCION = 0x29;
const byte CMD = 0x80;          // bit de comando del TCS34725
const byte AUTOINC = 0x20;      // lectura de varios registros seguidos
const byte REG_ENABLE = 0x00, REG_ATIME = 0x01, REG_CONTROL = 0x0F;
const byte REG_ID = 0x12, REG_STATUS = 0x13, REG_CDATA = 0x14;

bool sensorOk = false;

bool escribir(byte reg, byte valor) {
  Wire.beginTransmission(DIRECCION);
  Wire.write(CMD | reg);
  Wire.write(valor);
  return Wire.endTransmission() == 0;
}

int leer8(byte reg) {
  Wire.beginTransmission(DIRECCION);
  Wire.write(CMD | reg);
  if (Wire.endTransmission() != 0) return -1;
  if (Wire.requestFrom(DIRECCION, (byte)1) != 1) return -1;
  return Wire.read();
}

bool leerColor(unsigned int &c, unsigned int &r, unsigned int &g, unsigned int &b) {
  Wire.beginTransmission(DIRECCION);
  Wire.write(CMD | AUTOINC | REG_CDATA);
  if (Wire.endTransmission() != 0) return false;
  if (Wire.requestFrom(DIRECCION, (byte)8) != 8) return false;
  unsigned int v[4];
  for (int i = 0; i < 4; i++) { byte lo = Wire.read(); byte hi = Wire.read(); v[i] = (hi << 8) | lo; }
  c = v[0]; r = v[1]; g = v[2]; b = v[3];
  return true;
}

// Pista gruesa del color (se calibra después con los discos pintados).
const char *pista(unsigned int ru, unsigned int gu, unsigned int bu) {
  float r = ru, g = gu, b = bu;           // en float: restar enteros sin signo da basura
  float mx = max(r, max(g, b)), mn = min(r, min(g, b));
  if (mx < 1) return "oscuro";
  if ((mx - mn) / mx < 0.15) return "blanco/gris";
  float h;
  if (mx == r) h = 60 * fmod((g - b) / (mx - mn), 6);
  else if (mx == g) h = 60 * ((b - r) / (mx - mn) + 2);
  else h = 60 * ((r - g) / (mx - mn) + 4);
  if (h < 0) h += 360;
  if (h < 20 || h >= 330) return "rojo";
  if (h < 45) return "naranjo";
  if (h < 75) return "amarillo";
  if (h < 165) return "verde";
  if (h < 255) return "azul";
  return "morado";
}

bool lineaConectada(int pin) {
  pinMode(pin, OUTPUT); digitalWrite(pin, LOW); delay(2);
  pinMode(pin, INPUT);                    // suelta la linea sin pull-up interno
  delayMicroseconds(200);
  int arriba = 0;
  for (int i = 0; i < 20; i++) { arriba += digitalRead(pin); delayMicroseconds(50); }
  return arriba >= 18;
}

void diagnosticar() {
  Serial.println();
  Serial.println("=== Prueba del sensor TCS34725 ===");

  // Cada linea se descarga a 0 V y se suelta sin pull-up interno. Si el cable y la
  // soldadura llegan al sensor, sus resistencias la suben a 5 V en microsegundos;
  // si el pin queda al aire, sigue en 0 V.
  bool sda = lineaConectada(2), scl = lineaConectada(3);
  Serial.print("1) Pin 2 (SDA): "); Serial.println(sda ? "llega al sensor" : "NO llega al sensor");
  Serial.print("   Pin 3 (SCL): "); Serial.println(scl ? "llega al sensor" : "NO llega al sensor");
  if (!sda || !scl) {
    Serial.println("   FALLA: revisa ese cable, que este en la misma columna que su pin, la soldadura de ese pin y que VIN vaya a 5V.");
    return;
  }
  Serial.println("   OK: el sensor recibe energia y ambas lineas llegan.");

  Wire.begin();
  Wire.setWireTimeout(3000, true);        // nunca se queda colgado si el bus falla
  Serial.print("2) Buscando dispositivos I2C:");
  int encontrados = 0;
  for (byte a = 1; a < 127; a++) {
    Wire.beginTransmission(a);
    if (Wire.endTransmission() == 0) { Serial.print(" 0x"); Serial.print(a, HEX); encontrados++; }
  }
  Serial.println(encontrados ? "" : " ninguno");
  int id = leer8(REG_ID);
  if (id < 0) {
    Serial.println("   FALLA: nada responde en 0x29. Revisa la soldadura de SDA y SCL y que no esten invertidos.");
    return;
  }
  Serial.println("   OK: el sensor responde en 0x29.");

  Serial.print("3) Identidad: 0x"); Serial.print(id, HEX);
  if (id == 0x44 || id == 0x4D) Serial.println("  OK: es un TCS3472x.");
  else Serial.println("  (no es el valor tipico 0x44; puede ser un clon, seguimos igual)");

  bool cfg = escribir(REG_ATIME, 0xD5)    // 101 ms de integracion
          && escribir(REG_CONTROL, 0x01)  // ganancia 4x
          && escribir(REG_ENABLE, 0x01);  // encendido
  delay(3);
  cfg = cfg && escribir(REG_ENABLE, 0x03);  // encendido + medicion de color
  if (!cfg) { Serial.println("   FALLA: no acepta la configuracion."); return; }
  sensorOk = true;
  Serial.println("4) Lecturas cada medio segundo. Acerca objetos de colores a 1 cm del sensor:");
  Serial.println("   claro   rojo  verde   azul   -> pista");
}

void setup() {
  Serial.begin(115200);
  unsigned long t = millis();
  while (!Serial && millis() - t < 4000) {}   // el Leonardo espera al monitor serie
  diagnosticar();
}

void loop() {
  if (Serial.available()) {                    // cualquier tecla repite el diagnostico
    while (Serial.available()) Serial.read();
    sensorOk = false;
    diagnosticar();
  }
  if (!sensorOk) { delay(100); return; }
  unsigned int c, r, g, b;
  if (!leerColor(c, r, g, b)) {
    Serial.println("   FALLA: se perdio la conexion en plena lectura (soldadura intermitente?)");
    delay(500);
    return;
  }
  char fila[48];
  snprintf(fila, sizeof fila, "  %6u %6u %6u %6u", c, r, g, b);
  Serial.print(fila);
  Serial.print("   -> ");
  Serial.println(c > 60000 ? "saturado (demasiada luz)" : pista(r, g, b));
  delay(500);
}

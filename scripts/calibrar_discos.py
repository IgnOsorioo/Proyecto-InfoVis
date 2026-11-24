"""Calibra los discos del tocadiscos con la luz del lugar (24-nov).

El sensor TCS34725 no filtra el infrarrojo: con otra luz (de día, otra sala) cambian las proporciones de color y el
brillo de cada disco, y el Arduino deja de reconocerlos. Este script pide poner cada disco, le manda K:<color> al
Arduino, que mide ~1 s y guarda la referencia en su EEPROM (sobrevive al apagado), y al final prueba la lectura.

Antes: cerrar o desconectar la página del tocadiscos (el puerto USB lo puede usar un solo programa a la vez).

Uso: uv run --with pyserial python scripts/calibrar_discos.py [puerto]
"""
import glob, sys, time
import serial

PASOS = [("nada", "Saca el disco del plato (el sensor descubierto)"),
         ("rojo", "Pon el disco ROJO (rock)"),
         ("azul", "Pon el disco AZUL (pop)"),
         ("negro", "Pon el disco NEGRO (hip hop)"),
         ("verde", "Pon el disco VERDE (electrónica)")]


def respuesta(s, prefijos, segundos=4):
    fin, lineas = time.time() + segundos, []
    while time.time() < fin:
        l = s.readline().decode(errors="ignore").strip()
        if l.startswith(prefijos):
            lineas.append(l)
            if l.startswith(("CAL:", "ERR")):
                # deja pasar los AVISO que llegan justo después
                fin = min(fin, time.time() + 0.3)
    return lineas


def main():
    puertos = sys.argv[1:] or sorted(glob.glob("/dev/cu.usbmodem*")) or sorted(glob.glob("/dev/ttyACM*"))
    if not puertos:
        sys.exit("No encuentro el Arduino: conéctalo por USB.")
    try:
        s = serial.Serial(puertos[0], 115200, timeout=0.2)
    except serial.SerialException:
        sys.exit(f"{puertos[0]} está ocupado: cierra la página del tocadiscos (o el monitor serie) y vuelve a intentar.")
    time.sleep(2.5)
    s.reset_input_buffer()
    s.write(b"S\n")
    print(f"Arduino en {puertos[0]}. Deja el tocadiscos donde se va a usar, con la luz de ese momento.\n")
    for color, instruccion in PASOS:
        input(f"{instruccion} y presiona Enter… ")
        s.reset_input_buffer()
        s.write(f"K:{color}\n".encode())
        for l in respuesta(s, ("CAL:", "AVISO", "ERR")):
            print("   ", l)
    print("\nPrueba: pon y saca discos durante 20 s; debería reconocer cada uno en menos de medio segundo.")
    s.reset_input_buffer()
    fin, ultimo = time.time() + 20, None
    while time.time() < fin:
        l = s.readline().decode(errors="ignore").strip()
        if l.startswith("C:") and l != ultimo:
            ultimo = l
            print("    ve:", "sin disco" if l == "C:-" else l[2:])
    s.close()
    print("\nListo. Vuelve a abrir la página y conecta el tocadiscos.")


if __name__ == "__main__":
    main()

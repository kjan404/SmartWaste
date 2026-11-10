# Parts and wiring reference

## Needed parts

| Quantity | Part | Selection or use |
| --- | --- | --- |
| 1 | ESP32-S3-CAM carrier with camera and ribbon cable | The WROOM marking identifies the module. Verify the actual carrier and camera sensor before selecting a camera profile. |
| 2 | HC-SR04 ultrasonic sensors | One mounted above each bin, pointed down at its contents. |
| 1 | Positional PWM servo with horn and mounting screws | An SG90-class servo is an option for a light prototype gate. Choose torque and voltage to match the load. |
| 4 | 10 kΩ resistors | Two equal resistors per ECHO divider. Use separate dividers for the two sensors. |
| 1 | Regulated 5 V supply for the HC-SR04s | Use a supply that can also support the servo if the servo is rated for 5 V and the supply can cover both sensors and the servo stall current. Otherwise use a separate servo-rated supply. |
| 1 | USB data cable and suitable ESP32 board power source | Match the carrier’s connector. Follow the carrier’s input voltage requirements. |
| 1 set | Breadboard or prototyping board, jumper wires, terminals and headers as required | Use wiring and terminals rated for the servo supply current. |
| 2 | Waste bins | Label one for paper and one for plastic. |
| 1 set | Chute, staging tray, pivoting gate, servo linkage, mounting brackets and fasteners | Keep each material’s route clear and mount both sensors securely. |
| 1 each | Computer with Python and VS Code, plus a 2.4 GHz Wi-Fi network | The computer runs the dashboard and classifier. |

**As needed**

- A compatible 3.3 V USB-to-UART adapter if the carrier requires external serial programming. Verify the board’s boot and reset procedure.
- A logic-level translator for TRIG or servo PWM if the selected device does not reliably accept a 3.3 V signal. Check its input specification.
- A servo-rated separate supply and suitable decoupling if the shared peripheral supply is inadequate. Verify ratings from the actual servo documentation.
- A rigid camera mount, steady diffuse lighting, and a guard over the moving linkage for repeatable, safer tests.

## Tentative GPIO assignments

**Verify every candidate against your carrier schematic and camera profile before wiring.** These numbers refer to GPIO labels, not physical header positions. A generic WROOM label does not establish the camera ribbon routing, exposed pins, memory variant, or onboard peripheral connections.

| Connection | Candidate or supply |
| --- | --- |
| Paper sensor TRIG | GPIO 1 |
| Paper sensor ECHO through divider | GPIO 2 |
| Plastic sensor TRIG | GPIO 4 |
| Plastic sensor ECHO through divider | GPIO 5 |
| Servo PWM signal | GPIO 6 |
| Both sensor VCC pins | Regulated 5 V |
| Servo power | External supply rated for the servo voltage and stall current |
| Grounds | Connect ESP32 GND, both HC-SR04 grounds, and the servo supply ground |
| Camera data, timing and SCCB | Exact carrier camera profile in `firmware/include/config.h` |

For **each ECHO**, connect the first 10 kΩ resistor between ECHO and the input node, and the second 10 kΩ resistor between that node and common ground. Connect the input node to its verified ESP32 GPIO. A 5 V ECHO gives about 2.5 V at the node with equal resistors. Check the logic levels before connecting. Keep the ESP32 powered from its specified input and the servo off its 3.3 V pin. Connect common grounds and keep separate supply positive rails separate unless you have verified the intended power wiring.

With power disconnected, inspect the schematic and board labels. Check camera and microSD connections, LEDs, USB on GPIO 19 and 20, boot strapping pins and memory reservations. Some octal PSRAM module variants reserve GPIO 35–37. Measure each bin’s empty distance and the closest usable full distance, then enter the results in the firmware. The firmware fires the ultrasonic sensors in sequence to reduce interference.

- [Espressif ESP32-S3-WROOM module datasheet](https://documentation.espressif.com/esp32-s3-wroom-1_wroom-1u_datasheet_en.pdf)
- [Espressif camera pin profiles](https://github.com/espressif/arduino-esp32/blob/master/libraries/ESP32/examples/Camera/CameraWebServer/camera_pins.h)
- [Adafruit HC-SR04 voltage divider wiring](https://learn.adafruit.com/distance-measurement-ultrasound-hcsr04/connect-the-sensor)
- [Adafruit servo power guidance](https://learn.adafruit.com/adafruit-arduino-lesson-14-servo-motors/if-the-servo-misbehaves)
